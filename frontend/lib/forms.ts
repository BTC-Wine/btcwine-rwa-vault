// Envoi des demandes (livraison, reprise) vers Netlify Forms : POST en
// arriere-plan vers le fichier statique qui declare les formulaires.
// Les soumissions restent privees (dashboard Netlify), rien n'est publie.

export async function postForm(
  formName: string,
  fields: Record<string, string>
): Promise<void> {
  const res = await fetch("/__forms.html", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "form-name": formName, ...fields }).toString(),
  });
  if (!res.ok) throw new Error(`form submit failed: ${res.status}`);
}

// Nonce aleatoire inclus dans les donnees hachees : l'empreinte on-chain ne
// peut pas etre testee par dictionnaire, meme en theorie.
export function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

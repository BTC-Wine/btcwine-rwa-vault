// Composant serveur : injecte un bloc de donnees structurees schema.org.
// Le JSON est serialise tel quel ; ne passer que des donnees construites
// cote serveur (jamais de saisie utilisateur).
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

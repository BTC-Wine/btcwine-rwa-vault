// Helper de traduction pur (utilisable cote serveur et cote client). Prend le
// sous-dictionnaire d'un namespace, une cle en notation pointee et des
// variables d'interpolation optionnelles ({nom}).

export type Messages = Record<string, unknown>;

function resolve(dict: Messages, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

export function translate(
  dict: Messages,
  key: string,
  vars?: Record<string, string | number>
): string {
  const value = resolve(dict, key);
  if (typeof value !== "string") {
    // Cle absente ou non-string : on renvoie la cle pour reperer le trou.
    return key;
  }
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

// Fabrique une fonction t liee a un namespace, pour les composants serveur.
export function makeT(dict: Messages, namespace: string) {
  const ns = (dict[namespace] as Messages) ?? {};
  return (key: string, vars?: Record<string, string | number>) =>
    translate(ns, key, vars);
}

export type TFunction = ReturnType<typeof makeT>;

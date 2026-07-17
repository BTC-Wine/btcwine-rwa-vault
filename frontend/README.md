# TERWA, le site

Plateforme d'achat en primeur de grands vins sur Stellar. Cuvee nº 1 :
Chateau Coutet "Les Demoiselles", Saint-Emilion Grand Cru.

## Developpement

```
npm install
npm run dev
```

Les variables d'environnement (`.env.local` en local, `netlify.toml` en
deploiement) pointent vers les contrats du testnet Stellar. Elles sont
regenerees depuis le monorepo a chaque redeploiement des contrats.

## Stack

Next.js (App Router), Tailwind, `@stellar/stellar-sdk`, Stellar Wallets Kit.
Les lectures on-chain passent par la RPC Soroban publique, les soldes par
Horizon. Aucun backend requis pour cette version.

## Notes

- Le bouton "Mode demo" (en bas a droite) simule un wallet connecte detenant
  des allocations, pour la revue UX. A retirer avant le mainnet.
- Les pages legales contiennent des champs [A COMPLETER] a valider avant
  toute mise en ligne publique.

// Source unique des faits domaine et prix. Donnees fournies par le Chateau
// Coutet (juin 2026), usage du nom, des images et des notes accorde
// a TERWA. Toute mise a jour passe par ce fichier, jamais en dur dans un
// composant.

export const domaine = {
  nom: "Château Coutet",
  appellation: "Saint-Émilion Grand Cru",
  cuvee: "Les Demoiselles",
  site: "https://chateau-coutet.com",
  faits: [
    { valeur: "400 ans", detail: "dans la même famille, les David Beaulieu, 14e génération, trois générations au domaine aujourd'hui" },
    { valeur: "0 chimie", detail: "aucun herbicide, pesticide ou engrais de synthèse depuis 1601, confirmé par analyses de laboratoire indépendantes. Certifié bio depuis 2012" },
    { valeur: "16,8 ha", detail: "d'un seul tenant, dont 13 ha de vignes, à moins d'un kilomètre de la cité médiévale de Saint-Émilion" },
    { valeur: "Cheval", detail: "labour au cheval de trait pour préserver les sols, vendanges entièrement manuelles en cagettes" },
    { valeur: "500 gènes/ha", detail: "sélection massale sans clones, une diversité génétique exceptionnelle (moyenne régionale : 2 gènes/ha)" },
    { valeur: "96/100", detail: "RVF 2026 et 100+/100 Lobenberg pour le millésime 2022 de la cuvée Les Demoiselles" },
  ],
  terroir: {
    nom: "Peycocut",
    description:
      "Les Demoiselles naît de 4 parcelles du lieu-dit Peycocut (« là où chante le coucou », mentionné dès 1541), sur le calcaire à astéries du plateau de Saint-Martin, le point haut de la propriété, entouré de voisins premiers crus. 2,7 hectares de vignes d'environ 100 ans, dont 1,5 hectare est réservé aux précommandes TERWA.",
  },
  partenaires: {
    stockage: { nom: "Bordeaux City Bond", url: "https://www.bordeauxcitybond.com" },
    assurance: { nom: "AXA", url: "https://www.axa.fr" },
  },
  productionReservee: {
    bouteillesParMillesime: 4980,
    surfaceReservee: "1,5 ha",
    millesimes: "2025 à 2029",
  },
};

// Historique de production et de mise en marche de la cuvee Les Demoiselles,
// tel que communique par la propriete.
// marche* : fourchettes communiquees par la propriete (mars 2026).
// releveTTC : prix constate en ligne chez Gute Weine Lobenberg (bouteille de
// 75 cl, TTC Allemagne), releve le 2 juillet 2026. "souscription" = vin vendu
// avant sa mise a disposition. null = introuvable a la vente (hors marche).
// Les prix allemands incluent 19 % de TVA : equivalent HT arrondi a l'euro.
export const htFromTTC = (ttc: number) => Math.round(ttc / 1.19);

export const releveSource =
  "Gute Weine Lobenberg, bouteilles de 75 cl, prix TTC Allemagne, relevé le 2 juillet 2026";

export const historique = [
  { millesime: 2016, production: 2800, marche: null, marcheMin: null, marcheMax: null, releveTTC: 140, releveStatut: null },
  { millesime: 2017, production: 2800, marche: null, marcheMin: null, marcheMax: null, releveTTC: null, releveStatut: null },
  { millesime: 2018, production: 5300, marche: "120", marcheMin: 120, marcheMax: 120, releveTTC: null, releveStatut: null },
  { millesime: 2019, production: 4250, marche: "90 à 120", marcheMin: 90, marcheMax: 120, releveTTC: null, releveStatut: null },
  { millesime: 2020, production: 4250, marche: "75 à 100", marcheMin: 75, marcheMax: 100, releveTTC: 133, releveStatut: null },
  { millesime: 2021, production: 4500, marche: "75 à 100", marcheMin: 75, marcheMax: 100, releveTTC: 99, releveStatut: null },
  { millesime: 2022, production: 4400, marche: "90 à 140", marcheMin: 90, marcheMax: 140, releveTTC: 144, releveStatut: null },
  { millesime: 2023, production: 7600, marche: "70 à 90", marcheMin: 70, marcheMax: 90, releveTTC: 133, releveStatut: null },
  { millesime: 2024, production: 4250, marche: null, marcheMin: null, marcheMax: null, releveTTC: 89, releveStatut: "souscription" },
  { millesime: 2025, production: 9975, marche: null, marcheMin: null, marcheMax: null, releveTTC: 99, releveStatut: "souscription" },
];

// Le meme millesime 2025, vendu en souscription classique chez un
// distributeur : le comparable le plus direct de la precommande TERWA.
export const souscription2025 = {
  prixTTC: 99,
  distributeur: "Gute Weine Lobenberg",
  livraison: "automne 2028",
  date: "2 juillet 2026",
  url: "https://www.gute-weine.de/suche/?tx_solr%5Bq%5D=coutet+demoiselle",
};

// Prix de reference du millesime en cours (HT par bouteille).
export const prixActuels = {
  precommande: 60.33,
  proprieteB2C: 70,
  distributeurB2C: 80,
};

// Prix de detail moyens constates par marche pour la cuvee, moyenne des 7
// derniers millesimes. Sources : propriete, Wine-Searcher, Winedecider Pro,
// mars 2026. paysKey renvoie a dictionaries/<lang>/home.json ("countries").
export const prixParPays = [
  { paysKey: "france", prix: 90 },
  { paysKey: "belgium", prix: 95 },
  { paysKey: "germany", prix: 90 },
  { paysKey: "switzerland", prix: 98 },
  { paysKey: "uk", prix: 167 },
  { paysKey: "usa", prix: 159 },
  { paysKey: "russia", prix: 212 },
];

// Distributeurs et agregateurs independants qui referencent la cuvee.
// Les prix affiches sur ces sites ne dependent pas de TERWA.
// zoneKey renvoie a dictionaries/<lang>/home.json ("prices.zones").
export const distributeurs = [
  {
    nom: "Wine-Searcher",
    zoneKey: "aggregator",
    url: "https://www.wine-searcher.com/find/chateau+coutet+les+demoiselles",
  },
  {
    nom: "Gerstl Weinselektionen",
    zoneKey: "switzerland",
    url: "https://www.gerstl.ch/c?q=demoiselle%202025",
  },
  {
    nom: "Gute Weine Lobenberg",
    zoneKey: "germanyAustria",
    url: "https://www.gute-weine.de/suche/?tx_solr%5Bq%5D=coutet+demoiselle",
  },
  {
    nom: "Ace Beverage",
    zoneKey: "usa",
    url: "https://www.acebevdc.com/products/chateau-coutet-saint-emilion-grand-cru-les-demoiselles-cuvee-emri-2020?_pos=1&_sid=6ef0ec8d5&_ss=r",
  },
];

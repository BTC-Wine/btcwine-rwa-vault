# TERWA : Design System

Référence pour toute évolution de l'interface. Toute déviation doit être justifiée ici, pas improvisée dans un composant.

## Intention

L'interface doit évoquer un domaine viticole, pas une app crypto : calme, chaleureux, artisanal, digne de confiance. La blockchain est un détail d'implémentation, jamais un argument visuel. Aucun code visuel "web3" (néons, dégradés violets, glassmorphism, dark mode par défaut).

## Palette

| Rôle | Valeur | Usage |
|---|---|---|
| Fond de page | `#faf7f2` (crème) | Fond global, header |
| Surface | `#ffffff` | Cartes, listes |
| Bordeaux (marque) | `#5a1f2b` | Titres, boutons primaires, liens actifs, focus ring |
| Bordeaux hover | `#71303e` | Hover des boutons primaires |
| Texte principal | stone-900 | Corps de texte |
| Texte secondaire | stone-600 | Légendes, métadonnées (jamais plus clair que stone-600 sur fond crème, contraste AA) |
| Texte tertiaire | stone-500 | Uniquement sur surface blanche, taille >= 14 px |
| Bordures | stone-200 | Cartes, séparateurs ; stone-100 pour les divisions internes de listes |
| Succès / erreur | green-50/800, red-50/800 | Messages de confirmation et d'erreur |

Règles : une seule couleur d'accent (le bordeaux). Pas de nouvelle couleur sans mise à jour de ce fichier. Les états sémantiques gardent green/red.

## Typographie

| Rôle | Police | Taille / graisse |
|---|---|---|
| Display (h1) | Cormorant Garamond | 48 px (`text-5xl`), 500 |
| Titre de section (h2) | Cormorant Garamond | 30 px (`text-3xl`), 500 |
| Titre de carte (h3) | Cormorant Garamond | 20 px (`text-xl`), 500 |
| Valeur mise en avant (stats, noms de millésimes) | Cormorant Garamond | 18-24 px, 500 |
| Corps | Inter | 16 px (`text-base`), 400 |
| Légende / métadonnée | Inter | 14 px (`text-sm`) |
| Note de bas de page | Inter | 12 px (`text-xs`), stone-600 minimum |

Règles : Cormorant n'est chargée qu'en 500 et 600, `globals.css` force `font-weight: 500` sur `.font-serif` (jamais de 400 synthétisé). Échelle ~1,25 : 16 / 20 / 30 / 48, ne pas créer de taille intermédiaire. L'uppercase avec `tracking-[0.2em]` est réservé au kicker au-dessus du h1.

## Espacements

Base 8 px, valeurs autorisées : 4, 8, 16, 24, 32, 48, 64.

| Contexte | Valeur |
|---|---|
| Entre sections majeures d'une page | `mt-16` (64 px), partout, sans exception |
| Titre de section -> son contenu | `mt-4` à `mt-6` |
| Padding des cartes de contenu | `p-8` (32 px) |
| Padding des petites cartes (stats) | `p-6` (24 px) |
| Lignes de liste | `px-6 py-4` + `gap-4` entre colonnes |
| Grilles | `gap-4` (cartes denses) ou `gap-8` (colonnes de page) |
| Marge de page | `px-6` desktop, `px-4` mobile, contenu max `max-w-5xl` (3xl pour les pages de contenu) |

Règle : le rapproché appartient au lié (un titre est plus proche de son contenu que de la section précédente). Aucune valeur hors échelle.

## Rayons et ombres

- Cartes et listes : `rounded-2xl`, bordure stone-200, `shadow-sm` uniquement sur la carte d'action principale (BuyCard). Pas d'ombres décoratives.
- Boutons : `rounded-xl` (pleine largeur dans les cartes) ou `rounded-full` (header).
- Rayon interne < rayon externe quand imbriqué.

## Composants canoniques

- **Bouton primaire** : fond bordeaux, texte blanc, `py-3` (pleine largeur) ou `min-h-11 px-5 py-2` (header), `disabled:opacity-40`, jamais de texte en gras.
- **Bouton secondaire** : bordure stone-300, `rounded-full`, hover bordure bordeaux.
- **Carte stat** : `p-6`, label `text-sm` stone-500, valeur serif bordeaux `text-2xl`.
- **Liste** : conteneur `rounded-2xl` + `divide-y divide-stone-100`, lignes `px-6 py-4`.
- **Skeleton** : blocs `bg-stone-100 animate-pulse` aux dimensions du contenu réel (obligatoire pour tout contenu chargé depuis la RPC, jamais de pop-in).
- **Messages** : succès `bg-green-50 text-green-800`, erreur `bg-red-50 text-red-800`, `rounded-lg p-3 text-sm`.

## Graphiques

- Couleurs de séries (validées contraste + vision des couleurs sur fond crème) : bordeaux graphique `#8a3548` (série principale), or `#a06b28` (série secondaire, bandes min/max à 18 % d'opacité). Ne jamais utiliser le bordeaux marque `#5a1f2b` comme couleur de série (trop sombre).
- Une seule échelle par graphique, jamais de double axe. Grilles et axes en stone-200/stone-500, texte 11 px.
- Légende dès 2 séries, tooltip au survol avec crosshair, labels de valeurs en texte (jamais colorés aux couleurs de série), vue tableau toujours disponible (balise details).
- Barres nominales : une seule teinte pour toutes les barres, valeur à droite en tabular-nums.
- Les données viennent de `frontend/lib/domaine.ts`, jamais en dur dans les composants.

## États et accessibilité

- Cibles tactiles : 44 px minimum partout (`min-h-11` ou padding suffisant).
- Focus : ring global `:focus-visible` 2 px bordeaux, offset 2 px (défini dans `globals.css`), ne jamais le supprimer.
- Contraste : AA minimum. Sur fond crème, pas de texte plus clair que stone-600 ; stone-500 autorisé sur blanc à partir de 14 px.
- Chaque action asynchrone a ses trois états : en cours (libellé dédié : "Signature en cours..."), succès, erreur avec cause et action.
- Mobile d'abord acceptable : le header wrappe (`flex-wrap`), rien ne se chevauche, pas de scroll horizontal.

## Voix et copy

- Vocabulaire : Allocation, Millésime, Ma cave, précommande, mise à disposition, engagement de reprise. Interdits : share, invest, yield, profit, portfolio, vault (en copy), tout vocabulaire financier.
- Jamais de tiret cadratin. Virgule, deux-points ou parenthèses.
- Phrases courtes, voix active, pas de "Bienvenue sur...", pas d'auto-congratulation.
- Les nombres utilisent `toLocaleString("fr-FR")`.
- Les boutons disent l'action précise ("Précommander", pas "Valider").

## Anti-patterns (rejet immédiat)

Dégradés violets, icônes dans des ronds colorés, tout centré par défaut, emoji (AUCUN emoji nulle part, seule exception : les drapeaux du sélecteur de langue ; les icônes se dessinent en SVG), blobs et vagues SVG, border-left coloré sur les cartes, radius uniformément bulleux, dark mode cosmétique, jargon crypto dans l'interface.

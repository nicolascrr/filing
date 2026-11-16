# Fil'ing Broderies

Site vitrine : Accueil (`/`), Création (`/creation`), Production (`/production`), Galerie (`/galerie`). Astro SSR avec adaptateur Node standalone ; FR/EN/IT par cookie, FR par défaut. Navigation `ClientRouter`, interactions vanilla/GSAP.

## Démarrer

Depuis `app/`, avec Node **≥ 22.12.0** et npm. `package-lock.json` fixe les versions effectives ; `package.json` définit les plages autorisées.

```powershell
npm ci
npm run dev
```

Adresse habituelle : `http://localhost:4321` (vérifier la sortie du serveur). Installation et commandes génératrices uniquement si la mission les autorise.

| Commande            | Usage                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run lint`      | ESLint sans correction automatique                                                                 |
| `npm run typecheck` | `astro check`                                                                                      |
| `npm run build`     | Build SSR dans `dist/`                                                                             |
| `npm run preview`   | Script `astro preview` disponible ; pour vérifier le standalone, préférer l'entrée Node ci-dessous |
| `npm run lint:fix`  | Corrections ESLint avec écritures                                                                  |
| `npm run format`    | Prettier sur le projet avec écritures : éviter sur un worktree partagé                             |

Après un build à jour, lancement SSR local sous PowerShell :

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '4321'
node dist/server/entry.mjs
```

Ce lancement n'est pas une procédure de déploiement. Aucun domaine/origine publique définitif n'est configuré ici.

## Repères

- `src/pages/` : quatre routes ; `src/layouts/BaseLayout.astro` : document, métadonnées actuelles, polices/chrome.
- `src/components/{chrome,sections,ui}/` : compositions ; `src/scripts/` : contrôleurs, révélations, arrivée des photos, zoom. Scripts Astro traités/dédupliqués, nettoyage local lors des navigations.
- `src/middleware.ts`, `src/i18n/` : résolution SSR/traductions ; `src/data/` : navigation, chronologie, catégories, manifeste.
- `src/server/galleryCatalogue.ts` : catalogue serveur. `seed`, `category`, `type`, `image`, `zoom` participent au fonctionnement actuel : aucune suppression/redirection sans analyser leurs usages.
- `src/styles/` : tokens, styles et transitions. Poppins pour les titres, Noto Sans pour le corps, auto-hébergées via Fontsource.
- `public/` : ressources servies telles quelles, pas nécessairement importées dans le code.

## Médias/provenance

Lire [src/assets/README.md](src/assets/README.md) et [scripts/README-gallery-media.md](scripts/README-gallery-media.md).

`src/assets/gallery/` est l'autorité du catalogue publié ; conserver chemins, casse, accents et octets. Manifeste et globs serveur doivent correspondre à cet inventaire. `src/content/` est **en lecture seule** ; `../medias/` et autres sources de provenance ne sont pas supprimables parce qu'ils ne sont pas importés.

```powershell
node scripts/prepare-gallery-media.mjs --inspect
```

Inspection sans écriture. Pour mettre à jour le manifeste, uniquement sur autorisation :

```powershell
node scripts/prepare-gallery-media.mjs --prepare
```

`--prepare` remplace seulement `src/data/galleryMediaManifest.json`, sans encodage ni suppression. `--remove-raw` est rejeté. Les métadonnées historiques ne sont pas une nouvelle vérification des originaux.

## Vérifier

Lire [tests/README.md](tests/README.md), référence pour les procédures/prérequis :

```powershell
node --test tests/gallery-zoom.test.mjs
node --test tests/photo-arrival.test.mjs
node tests/gallery-review-browser.mjs
```

Le harness navigateur nécessite un build SSR à jour et Chrome local (`CHROME_PATH` si nécessaire). `FILING_QA_BASE_URL` permet un serveur de production local déjà lancé. Les contrôles de provenance lisant les originaux nécessitent les fichiers clients et sources externes présents localement ; un checkout incomplet ne suffit pas à les certifier. Ne pas remplacer ces fichiers pour masquer un prérequis manquant.

Les tests de handlers, l'émulation tactile Chrome et les contrôles HTTP ne sont ni un test sur appareil physique, ni une mesure terrain CWV, ni une preuve exhaustive d'absence de fuite mémoire. Rapporter commandes/résultats/limites sans figer le nombre de tests.

Le contrat zoom actuel est 1 ↔ 2,5 sur desktop, 1…2,5 sur mobile. Vérifier ce contrat avec les suites zoom/navigateur et rapporter leurs résultats réels, sans masquer les échecs.

## Suite

- [AGENTS.md](AGENTS.md) : conventions/invariants.
- [SEO.md](../SEO.md) : plan futur, aucune implémentation/migration autorisée aujourd'hui.
- [TODO.md](../TODO.md) : données officielles, liens et configurations à fournir.
- `UserStories.md` : historique conservé, pas spécification active.

Aucun commit/déploiement sans validation explicite. Aucune compression d'images demandée.

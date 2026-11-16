# Médias publiés et provenance

## Autorités

- `gallery/` : catalogue canonique de WebP préparés, par technique/groupes. Conserver chemins, accents, casse et octets ; globs serveur et `src/data/galleryMediaManifest.json` couvrent cet inventaire.
- `hero/` : vidéos desktop/mobile, photographie de secours `hero-poster.JPG`, photos des heroes de pages.
- `timeline/` : photos clients conservant leurs noms d'origine.
- `icons/`, `brand/` et autres dossiers importés : pictogrammes, emblèmes et médias des compositions actuelles.
- `src/content/` : originaux clients **en lecture seule**. Médias externes de provenance, notamment `medias/` à la racine du dépôt : conservés.

Les 40 anciens SVG placeholders, les composants hors graphe `GridGallery`/`SmallCarousel`, le script historique `splittext.ts`, deux photos préparées inutilisées et deux `Thumbs.db` ont été retirés après contrôle des références et de leur statut Git. Ce nettoyage du dépôt ne représente pas un gain réseau : ces fichiers n'étaient déjà pas dans le bundle client. Ne pas les restaurer pour satisfaire une référence obsolète ; le support actif `[data-split]` reste dans `reveals.ts`.

## Inventaire

Depuis `app/`, voir le [guide du générateur](../../scripts/README-gallery-media.md) :

```powershell
node scripts/prepare-gallery-media.mjs --inspect
```

Sans écriture. `--prepare`, uniquement sur autorisation, réinventorie et remplace le manifeste, sans conversion/copie/suppression de médias. `--remove-raw` est rejeté. Les champs historiques `source*` documentent la provenance, pas une lecture fraîche des originaux ; `source` est une identité logique stable, pas un chemin à restaurer.

## Hero, chronologie et emblèmes

`hero-video.mp4` et `hero-video-mobile.mp4` ont été déplacées depuis `public/` sans réencodage et sont importées comme URL Vite. Les anciennes URL publiques ne sont plus le contrat courant. `creation-lead.jpg`, `production-lead.jpg`, `showroom-lead.jpg` ont été déplacées dans `hero/` sans réencodage.

`hero-poster.JPG` est une photographie copiée depuis `Traditionnelle/P1000499.JPG`, pas une frame vidéo. Chronologie : copies `1994.JPG`, `1997.JPG`, `2001.JPG`, `2005.JPG`, `2011.JPG`, `2013.png`, `2015.jpg`, `2023.jpeg`, `2024.jpg` ; originaux intacts.

Le hero emploie une seule vidéo, source mobile sous 768px puis desktop de repli. Préserver sélection native, première frame décodée, secours photographique, reduced motion et nettoyage des navigations. Un resize ne doit pas déclencher volontairement un double téléchargement.

`EPV_logo.svg` : emblème fourni rouge, sans recoloration, destiné à « Entreprise du patrimoine vivant ». « Fabrication française » conserve `made_in_france.svg`.

## Intervention

Aucune compression, reconversion, modification de dimensions, renommage ou suppression d'originaux protégés dans la mission courante. Vérifier routes, globs, données et ressources publiques avant de conclure « inutile ». Non suivi par Git ne signifie pas superflu.

Un ajout futur nécessite droits/provenance validés, cohérence catégories/traductions et vérifications adaptées. Ne pas déduire un fait éditorial d'un nom de fichier. Alt/descriptions informatifs : chantier éditorial FR/EN/IT ; décorations : alt vide.

Voir [guide projet](../../README.md), [tests/prérequis](../../tests/README.md), [plan SEO futur](../../../SEO.md).

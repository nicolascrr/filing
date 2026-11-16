# Fil'ing Broderies — guide des agents

## Contrat

- Suivre la mission validée et ses critères ; `UserStories.md` est un historique conservé, pas une spécification active à réimposer.
- Inspecter code, tests concernés et `git status` avant écriture. Préserver les changements des autres intervenants.
- Aucun commit, stage, push, reset, déploiement ou acte destructif sans autorisation. Aucun ajout de dépendance ni migration implicite.
- Une mission en lecture seule ne lance aucune commande d'écriture. Rapporter seulement les vérifications réellement exécutées et leurs limites.

## Architecture actuelle

- Astro SSR, Node standalone, Tailwind v4, GSAP, `ClientRouter`. Versions : `package.json` et `package-lock.json` font foi, jamais « latest ».
- Quatre routes : `/`, `/creation`, `/production`, `/galerie`. `BaseLayout.astro` porte le document/chrome ; les pages composent sections et composants UI.
- Scripts Astro traités/dédupliqués et contrôleurs TypeScript vanilla dans `src/scripts/` : pas d'obligation d'îlot `client:load` ni de centralisation artificielle. Initialisation locale sur `astro:page-load`, nettoyage sur `astro:before-swap` : écouteurs, requêtes, timers, observers, captures pointeur et contextes GSAP.
- `middleware.ts`, `src/i18n/` et dictionnaires FR/EN/IT : cookie `locale`, FR par défaut. Garder SSR et `html lang` cohérents ; aucune migration d'URL de langue sans approbation. Voir [SEO.md](../SEO.md).
- Galerie : autorité média `src/assets/gallery/`, manifeste `src/data/galleryMediaManifest.json`, globs et `src/server/galleryCatalogue.ts` cohérents. Le générateur inventorie sans convertir. Voir [pipeline](scripts/README-gallery-media.md).
- Timeline actuellement horizontale. `--content-max` global : 1600px ; Atelier : limite locale 1280px ; Galerie presque pleine largeur ; heroes fullscreen. Ne pas réintroduire les composants historiques/placeholders comme fallbacks actifs.

## Style et accessibilité

- Luxe artisanal, sobriété et précision ; animations élégantes, lisibles, non tapageuses. Réutiliser tokens/composants.
- TypeScript strict, props typées, HTML sémantique. Textes/libellés accessibles via données traduites FR/EN/IT ; conserver la convention `**gras**`.
- Titres : token `font-heading`/Poppins ; corps : Noto Sans. Polices auto-hébergées existantes, aucune nouvelle famille.
- Mobile-first ; vérifier 375/768/1024/1440px, débordements, lisibilité et cibles tactiles 44×44px (distinctes de la taille du pictogramme).
- Focus visible, clavier, dialogues avec fermeture/Esc et gestion focus/scroll/inert ; alternatives no-JS et `prefers-reduced-motion`. Alt pertinent pour une image informative, vide pour une décoration.
- Commentaires minimaux : pourquoi/invariant, pas paraphrase. Préserver licences, directives d'outils et textes légaux nécessaires.

## Invariants interactions/médias

- Une interaction/propriété `transform` a un seul propriétaire. GSAP anime les wrappers, jamais l'image pilotée par le zoom.
- Préserver abort, générations, cache, HD sur intention et rejet des réponses périmées. Cycle de vie par viewer ; garder `context.ignore()` et libérer tweens/ressources à chaque fin, y compris erreur, interruption et swap.
- Contrat zoom actuel : desktop 1 ↔ 2,5 ; mobile 1…2,5. Ne pas réintroduire l'ancien plafond 4. Vérifier ce contrat avec les suites pertinentes et distinguer le comportement attendu des résultats réellement observés.
- Changement de langue : préserver cookie/SSR, suppression de l'arrivée sur rendu SSR ET synchronisation initiale, puis restauration du viewport. Pas de replay à cause d'une réponse tardive.
- Préserver le geste historique `photoArrival` (groupes 8/6/6), les lots Galerie 2/3/4, le hover partagé avec le Footer et l'écart mobile photo/flèches 12px.
- `src/content/` : originaux en lecture seule ; médias externes de provenance conservés. Aucune compression, reconversion, modification de dimensions, renommage ou suppression d'originaux protégés dans cette mission.
- Absence d'import direct ≠ inutile : vérifier routes Astro, globs, données et assets publics. Non suivi par Git ≠ inutile. Conserver favicons et sources de paquets ambiguës sans retrait validé.

## Vérification et références

- Commandes/prérequis : [README](README.md). Scénarios Node/Chrome et limites : [tests/README.md](tests/README.md).
- Pour le code et si autorisé : lint ciblé, typecheck, tests pertinents, build puis régressions justifiées. Les missions documentaires/lecture seule n'imposent pas ces commandes génératrices.
- Consulter les docs Astro officielles via Context7 pour les décisions d'API/configuration et vérifier la version verrouillée.
- [TODO.md](../TODO.md) suit les données manquantes ; [SEO.md](../SEO.md) est un plan futur, pas une autorisation d'implémentation.

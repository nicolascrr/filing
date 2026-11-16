# SEO — plan futur à valider

**Statut : plan uniquement, tous les lots sont à faire.** Aucune métadonnée, URL, intégration, dépendance ou migration n'est implémentée par ce document. Les valeurs inconnues doivent être fournies, jamais inventées. Aucune promesse de positionnement.

## État de départ vérifié

- Quatre routes `/`, `/creation`, `/production`, `/galerie`, SSR Node (`output: 'server'`, standalone). `app/astro.config.mjs` ne définit pas `site`.
- FR/EN/IT par cookie, FR par défaut ; `html lang` reflète la langue SSR. Trois alternates `hreflang` et `x-default` utilisent tous la même URL, paramètres inclus : ce ne sont pas trois versions linguistiques adressables.
- Dans `src/`, pas de canonical, Open Graph, Twitter Cards ou JSON-LD ; pas de robots/sitemap. Les trois pages internes ont un titre propre mais héritent de la description commune.
- Galerie : aperçu aléatoire de 18 groupes parmi 16 catégories ; paramètres `seed`, `category`, `type`, `image`, `zoom`, réponses privées/non stockables (`Cache-Control: private, no-store`). Les requêtes techniques servent les interactions : aucune redirection globale des paramètres.
- Photos Atelier avec alt vide et descriptions Galerie génériques à revoir éditorialement. Le Teaser utilise désormais un `h2` en Poppins uppercase aligné au hero ; l'audit Hn global reste futur. La chronologie contient encore « à préciser/compléter ».
- Vidéo du hero décorative (`aria-hidden`), pas une page de visionnage : pas de `VideoObject` pour ce seul décor.
- Identité publique/légale et adresse postale à confirmer ; liens sociaux, position Maps, itinéraires et email validés désormais configurés dans le Footer, suivis dans [TODO.md](TODO.md). Aucun Core Web Vital mesuré : les objectifs ci-dessous ne sont pas des résultats.

## Gouvernance

Chaque lot est **à faire**. Les responsables indiqués sont des rôles à attribuer. Validation P0 requise avant implémentation ; les fichiers cités sont des surfaces futures, pas une autorisation d'écriture. Préserver SSR, cache privé, cookies et interactions tant qu'un changement n'est pas approuvé.

### Lot 0A — données officielles et périmètre public

- **Priorité : P0. Dépendances :** aucune. **Responsables :** utilisateur / représentant légal pour les faits ; exploitant pour hébergement et Search Console.
- **À fournir :** origine HTTPS de production, hôte préféré, éventuel sous-chemin, environnements de staging et langues réellement indexables ; nom public/raison sociale, adresse postale, activité locale attestée. L'email et les liens sociaux/Maps du Footer sont configurés ; leur usage éventuel dans des données structurées reste dans les lots futurs. Valider textes, dates de chronologie, droits/crédits photos et qualifications revendiquées. Désigner propriétaire Search Console et accès.
- **Fichiers futurs :** `app/astro.config.mjs`, éventuelle configuration de site dédiée à approuver, `app/src/components/chrome/Footer.astro`, `app/src/data/timeline.ts`, `app/src/i18n/locales/{fr,en,it}.json` ; [TODO.md](TODO.md) pour le suivi.
- **Critères vérifiables :** registre des valeurs validées et de leurs sources ; aucune URL locale/test, coordonnée fictive ni droit supposé. Origine/sous-chemin/langues et responsabilités approuvés avant le lot suivant.

### Lot 0B — décision i18n/indexation

- **Priorité : P0. Dépendances :** 0A. **Responsables :** utilisateur (arbitrage), référent SEO et développeur (proposition).
- **Décision future :** conserver le cookie avec indexation linguistique limitée, sans présenter le même URL comme trois traductions distinctes ; ou concevoir des URL stables par langue. Dans ce second cas seulement : canonical par locale, alternates réciproques incluant soi-même, `x-default` approprié, liens de changement de langue, redirections et rôle résiduel du cookie. Aucune migration autorisée aujourd'hui.
- **Fichiers futurs :** `app/src/middleware.ts`, `app/src/i18n/`, `app/src/components/chrome/LanguageSwitcher.astro`, `app/src/layouts/BaseLayout.astro` ; routes/configuration seulement si migration approuvée.
- **Critères vérifiables :** matrice route/langue/URL/indexabilité approuvée ; chaque alternate correspond à un contenu linguistique adressable sans cookie implicite. Redirections et compatibilité des liens existants documentées avant exécution.

### Lot 1A — métadonnées et paramètres

- **Priorité : P1. Dépendances :** 0A, 0B. **Responsables :** rédaction/traduction pour les contenus, développeur pour l'intégration.
- **Travail futur :** titres/descriptions par page et locale ; canonical absolu depuis l'origine de confiance validée, jamais un `Host` arbitraire. OG/Twitter Cards avec image existante autorisée, URL absolue et texte pertinent ; aucune création d'image requise. Vérifier `ClientRouter` autant que la réponse SSR froide.
- **Galerie :** inventorier séparément URL HTML publiques et fetchs techniques. Décider des variantes indexables, canonical et éventuelles directives d'indexation ; éviter l'explosion seed × catégorie × groupe × image × zoom. Ne pas casser requêtes, cache privé, sélection/partage pour « nettoyer » les URL. Pas de redirection aveugle ni d'exclusion du fetch à la place de la page HTML.
- **Fichiers futurs :** `app/src/layouts/BaseLayout.astro`, quatre pages, dictionnaires, configuration de site approuvée ; `app/src/pages/galerie.astro` et `app/src/server/galleryCatalogue.ts` pour l'analyse des réponses, contrôleur Galerie seulement si nécessaire et validé.
- **Critères vérifiables :** un title/description/canonical attendu par réponse ; canonical HTTPS approuvé sans hôte injecté ni paramètres non retenus. Matrice des paramètres testée ; filtres/viewer/fetchs préservés. Métadonnées/langue correctes en SSR, navigation Astro et changement de langue.

### Lot 1B — sitemap, robots et HTTP

- **Priorité : P1. Dépendances :** 0A, 0B, politique d'URL 1A. **Responsables :** développeur/exploitant, validation SEO.
- **Travail futur :** choisir une génération explicitement compatible SSR : liste explicite des quatre routes publiques et futures variantes approuvées, ou endpoint XML approuvé ultérieurement. Ne pas supposer que l'intégration sitemap découvre automatiquement les routes SSR. Aucune nouvelle dépendance maintenant. N'inclure que les URL canoniques indexables ; `lastmod` sur date éditoriale réelle, pas l'heure du build/requête.
- Politique `robots.txt` production/staging sans bloquer les ressources de rendu. Robots n'est pas un contrôle d'accès : protéger réellement le staging ; si `noindex` doit être lu, ne pas empêcher sa lecture par une interdiction de crawl incohérente. Planifier vrais 404 et redirections permanentes seulement pour changements validés, sans boucle/soft 404.
- **Fichiers futurs :** `app/astro.config.mjs`, éventuels `app/public/robots.txt` et sitemap explicite ou endpoint dans `app/src/pages/` (choix à approuver), hébergement et tests HTTP.
- **Critères vérifiables :** XML parsable, URL absolues publiques 200 et canonical cohérent ; aucune URL localhost/test ou combinaison technique. Robots/protection staging vérifiés par HTTP ; vrais 404, chaînes de redirection contrôlées, référence sitemap correcte en production.

### Lot 1C — contenu, sémantique, maillage

- **Priorité : P1. Dépendances :** faits/droits 0A, URL 0B, prise en compte du lot typographique livré. **Responsables :** entreprise et rédaction/traduction, développeur pour le balisage.
- **Travail futur :** auditer H1/H2/H3 et sections des quatre pages ; le style visuel ne dicte pas le niveau HTML. Réviser alt des vraies photos informatives et descriptions Galerie en FR/EN/IT, sans inférer sujet/technique/histoire du nom de fichier. Garder les décorations en alt vide, sans bourrage de mots-clés. Remplacer les textes provisoires de chronologie par des faits approuvés.
- Préserver les liens stables menu/Footer/teasers. Si les catégories deviennent indexables plus tard, prévoir URL stables et liens explorables ; ne pas transformer aveuglément des boutons de commande/filtre en liens.
- **Fichiers futurs :** `app/src/components/ui/{Teaser,AtelierPresentation,ImageCard,Timeline,CatalogueCard}.astro`, compositions, `app/src/data/{timeline,galleryCategories}.ts`, dictionnaires et données éditoriales Galerie à définir.
- **Critères vérifiables :** arbre Hn cohérent en SSR/après navigation, aucune mention provisoire publiée, alt adaptés dans les trois langues, liens internes explorables sans JS ; contrôles clavier/lecteur d'écran et commandes Galerie sans régression.

### Lot 2A — données structurées factuelles

- **Priorité : P2. Dépendances :** 0A, 0B, 1A, contenu validé 1C. **Responsables :** entreprise pour les faits, développeur/référent SEO.
- **Travail futur :** envisager `Organization`, `WebSite`, `WebPage` avec identifiants stables. `LocalBusiness` seulement avec activité/implantation locale et propriétés nécessaires validées. `sameAs` pour profils officiels précis, jamais les homepages Instagram/LinkedIn.
- Aucun avis, note, certification, horaire, coordonnée géographique ou service inventé. Aucun `VideoObject` pour le hero décoratif ; une future vidéo éditoriale nécessiterait une décision/données propres.
- **Fichiers futurs :** layout ou composant JSON-LD dédié approuvé, configuration des faits officiels, pages concernées.
- **Critères vérifiables :** JSON valide, données conformes au contenu visible/autorisé ; Schema Markup Validator, puis Rich Results Test pour les types éligibles uniquement. Aucune promesse de résultat enrichi ou classement.

### Lot 1/2B — performance mesurée

- **Priorité : P1 diagnostic, P2 corrections ciblées. Dépendances :** environnement reproductible 0A ; corrections après mesure/autorisation. **Responsables :** QA/performance, développeur, exploitant pour les données terrain.
- Mesurer mobile/desktop, cache froid/chaud, chargement initial/navigation Astro ; identifier LCP/INP/CLS. Examiner polices, gates heroes, vidéos/secours, interactions Galerie, intention HD/zoom, changement de langue, erreurs réseau. Contrôler reduced motion et no-JS. Un score laboratoire n'est pas une distribution terrain.
- **Cibles terrain p75 :** LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1. Objectifs, pas résultats acquis. Collecter le terrain si disponible et documenter un volume insuffisant.
- **Fichiers futurs à examiner :** `app/src/layouts/BaseLayout.astro`, styles/polices, `app/src/components/sections/accueil/Hero.astro`, `app/src/scripts/{heroMediaReady,galleryController,galleryZoom,photoArrival}.ts`, catalogue serveur/tests. Ne modifier que les causes démontrées ; aucune compression/reconversion d'image ni traitement de dimensions dans ce plan.
- **Critères vérifiables :** protocole/environnement et rapports avant/après conservés, labo/terrain séparés, régressions interaction/langue/erreur vérifiées. Aucune déclaration « CWV conformes » sans preuves correspondantes.

### Lot 3 — recette et suivi

- **Priorité : P1 recette initiale, P2 suivi. Dépendances :** lots implémentés et environnements autorisés. **Responsables :** QA/référent SEO, utilisateur pour Search Console.
- **Surfaces :** réponses HTTP des quatre routes/variantes approuvées, head SSR/navigation Astro, langue/cookies/cache, sémantique/liens, XML/JSON-LD. Tests pertinents : [app/tests/README.md](app/tests/README.md), compléments de recette à écrire lors de l'implémentation.
- **Critères vérifiables :** sans cookie puis trois langues, navigation/rechargement, paramètres Galerie/fetchs techniques, erreurs/404/redirections ; comparer canonical/alternates/OG SSR/client. Contrôler Hn/alt/liens, XML/JSON-LD et 375/768/1024/1440px, clavier, reduced motion, no-JS.
- Après mise en ligne autorisée : soumettre sitemap, inspecter URL/canonique choisie par Google dans Search Console, suivre couverture/indexation et CWV ; journaliser anomalies/corrections. Exploration/indexation restent décidées par les moteurs, sans délai ni position garantis.

## Références

Astro officiel consulté via Context7 (`/withastro/docs`, branche principale non versionnée ; vérifier l'adéquation à Astro 7.1.3 verrouillé avant implémentation). Ces options restent des choix futurs, pas une intégration installée.

- Astro : [site](https://docs.astro.build/en/reference/configuration-reference/#site), [sitemap/limites SSR](https://docs.astro.build/en/guides/integrations-guide/sitemap/), [internationalisation](https://docs.astro.build/en/guides/internationalization/).
- Google Search Central : [sites multilingues/régionaux](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites), [canonicalisation](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [LocalBusiness](https://developers.google.com/search/docs/appearance/structured-data/local-business), [images](https://developers.google.com/search/docs/appearance/google-images), [vidéo](https://developers.google.com/search/docs/appearance/video), [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals), [liens explorables](https://developers.google.com/search/docs/crawling-indexing/links-crawlable).
- [Schema.org Organization](https://schema.org/Organization), [Schema Markup Validator](https://validator.schema.org/), [Rich Results Test](https://search.google.com/test/rich-results).

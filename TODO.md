# À fournir ou configurer ultérieurement

Les liens validés ci-dessous sont configurés dans le Footer ; les autres tâches restent ouvertes. Aucun service ni contenu légal n'est installé par cette liste.

- [ ] **SEO** — Valider les données/décisions P0 de [SEO.md](SEO.md), puis autoriser et appliquer les lots et leur recette.
- [x] **Analytics — code Counter.dev intégré.** Snippet fourni inclus une fois en fin de `body` dans `BaseLayout.astro`, commun aux cinq pages HTML, sans réexécution forcée lors des navigations SPA.
- [ ] **Analytics — validations restantes.** Vérifier le dashboard (réception des données non vérifiée), la configuration du compte et les accès ; examiner confidentialité, consentement et obligations applicables.
- [x] **Aéroport** — Lien Google Maps d'itinéraire depuis l'aéroport Lyon Saint-Exupéry vers les coordonnées validées de Fil'ing (45.903903, 4.8771092).
- [x] **TGV** — Lien Google Maps d'itinéraire depuis la gare Lyon Part-Dieu vers cette même destination validée.
- [x] **Instagram / LinkedIn** — Profils fournis configurés ; URL LinkedIn conservée avec `/posts/?feedView=all`.
- [x] **Position Maps et email** — Lien fourni `https://maps.app.goo.gl/Lv3RT9JYYH2KcvF9A` et `contact@filing.fr` configurés ; mailto SSR et popup progressive avec copie/fallback manuel.
- [ ] **Mentions légales** — Valider contenu et destination à configurer. Aucune fausse identité ni page légale inventée.
- [ ] **Identité et adresse officielles** — Valider l'identité publique/légale et l'adresse postale avant publication de données légales ou structurées. Aucun Place ID ni adresse déduit du cadrage Maps.

Évidence : [Footer.astro](app/src/components/chrome/Footer.astro), objets `contact` et `journey`. QA locale sur build SSR : quatre routes × FR/EN/IT, href exacts et popup Chrome headless (copie native autorisée, refus/absence simulés, no-JS, clavier, Astro, tailles 375/768/1024/1440 et faible hauteur). Aucun mail envoyé ni itinéraire testé sur le terrain. Responsable des données restantes : utilisateur / représentant habilité.

import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = process.env.FILING_QA_BASE_URL ?? 'http://127.0.0.1:4330';
const labels = { fr: 'Mention légales', en: 'Legal notice', it: 'Note legali' };
const headings = [
  'Présentation du site.',
  'Conditions générales d’utilisation du site et des services proposés.',
  'Description des services fournis.',
  'Limitations contractuelles sur les données techniques.',
  'Propriété intellectuelle et contrefaçons.',
  'Limitations de responsabilité.',
  'Gestion des données personnelles.',
  'Liens hypertextes et cookies.',
  'Droit applicable et attribution de juridiction.',
  'Les principales lois concernées.',
  'Lexique.',
  'Utilisation des données personnelles collectées',
  'Commentaires', 'Médias', 'Formulaires de contact', 'Cookies',
  'Contenu embarqué depuis d’autres sites', 'Statistiques et mesures d’audience',
  'Utilisation et transmission de vos données personnelles', 'Durées de stockage de vos données',
  'Les droits que vous avez sur vos données', 'Transmission de vos données personnelles',
];
const removedHeadings = [
  'Informations de contact', 'Informations supplémentaires', 'Comment nous protégeons vos données',
  'Procédures mises en œuvre en cas de fuite de données',
  'Les services tiers qui nous transmettent des données',
  'Opérations de marketing automatisé et/ou de profilage réalisées à l’aide des données personnelles',
  'Affichage des informations liées aux secteurs soumis à des régulations spécifiques',
];
const requiredText = [
  'Mentions Légales / 2020 © Fil’ing Broderies', 'Mentions Légales 2020 © Fil’ing Broderies',
  '41453286100039', 'SAS au capital de 100 000 euros', 'Technoparc Saône Vallée 01390 Civrieux France',
  'Carrara Yves – internet@filing.fr', 'OVH – 2 rue Kellermann – 59100 Roubaix – France',
  'Bourg-en-Bresse', 'https://www.filing.fr', 'https://automattic.com/privacy/',
  'Tous les informations', 'Le site n’est pas déclaré à la CNIL car il ne recueille pas d’informations personnelles. .',
  'Sous Internet Explorer', 'Sous Firefox', 'Sous Safari', 'Sous Chrome',
];

async function page(locale) {
  const response = await fetch(new URL('/mentions_legales', baseUrl), {
    headers: { cookie: `locale=${locale}` },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, 200, `${locale} legal notice response`);
  return (await response.text()).replaceAll('&amp;', '&');
}

test('legal notice is directly served, French-only and preserves required legal copy for every locale', async () => {
  let canonicalBody;
  for (const locale of ['fr', 'en', 'it']) {
    const html = await page(locale);
    assert.match(html, new RegExp(`<html[^>]+lang="${locale}"`));
    assert.match(html, /<article\b[^>]*lang="fr"/);
    const article = html.match(/<article\b[^>]*class="legal-notice[^>]*>([\s\S]*?)<\/article>/)?.[1];
    assert.ok(article, `${locale} article exists`);
    for (const heading of headings) assert.ok(article.includes(heading), `${locale}: ${heading}`);
    const articleText = article.replace(/\s+/g, ' ');
    for (const heading of removedHeadings)
      assert.ok(!articleText.includes(heading), `${locale}: removed heading ${heading}`);
    for (const text of requiredText) assert.ok(article.includes(text), `${locale}: ${text}`);
    assert.equal((article.match(/<h1\b/g) ?? []).length, 1);
    if (canonicalBody === undefined) canonicalBody = article;
    else assert.equal(article, canonicalBody, `${locale} legal body remains unchanged`);
    const copyright = html.match(/<p class="footer__copyright"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    assert.ok(copyright);
    assert.match(copyright, /2026 Fil(?:&#39;|&#x27;|')ing Broderies\./);
    assert.match(copyright, new RegExp(`<a class="footer__legal-link" href="\\/mentions_legales"[^>]*>${labels[locale]}<\\/a>`));
    assert.match(html, /<nav\b[^>]*footer__sitemap[\s\S]*?<\/nav>/);
    for (const href of ['/','/creation','/production','/galerie'])
      assert.ok(html.includes(`href="${href}"`), `${locale} shared navigation ${href}`);
    assert.doesNotMatch(html, /common\.footer\.legalNotice/);
  }
});

// Runs after both `vite build` (client bundle) and `vite build --ssr` (the
// entry-server bundle) as part of `npm run build`. It takes the client
// dist/index.html as a shared template (fonts, favicon, structured data,
// global OG/Twitter image tags are identical on every route) and, for each
// route in PAGE_META:
//
//   1. renders that route's real React output to an HTML string
//   2. swaps in the route-specific <title>, <meta description>,
//      <link rel="canonical">, <meta name="robots">, and og/twitter
//      title+description+url
//   3. injects the rendered markup into <div id="root">...</div>
//   4. writes the result to dist/index.html (for "/") or
//      dist<path>/index.html (pretty-URL static file for every other route)
//
// The client JS bundle then boots normally on top of this and takes over
// rendering (see main.tsx) — this only affects what's in the initial
// response body, which is what non-JS crawlers and simple SEO auditors see.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceTag(html, regex, replacement) {
  if (!regex.test(html)) {
    throw new Error(`Expected to find a match for ${regex} in the template`);
  }
  return html.replace(regex, replacement);
}

async function main() {
  const templatePath = path.join(distDir, 'index.html');
  if (!existsSync(templatePath)) {
    throw new Error('dist/index.html not found — run `vite build` first.');
  }

  const template = await readFile(templatePath, 'utf8');

  const ssrEntryPath = path.join(ssrDir, 'entry-server.js');
  if (!existsSync(ssrEntryPath)) {
    throw new Error(
      'dist-ssr/entry-server.js not found — run `vite build --ssr src/entry-server.tsx --outDir dist-ssr` first.'
    );
  }

  const { renderPage, PAGE_META } = await import(
    'file://' + ssrEntryPath
  );

  const routes = Object.values(PAGE_META);

  for (const meta of routes) {
    const bodyHtml = renderPage(meta.path);

    const url =
      meta.path === '/' ? 'https://docbit.in/' : `https://docbit.in${meta.path}`;

    const robots =
      meta.robots ??
      'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    let html = template;

    html = replaceTag(
      html,
      /<title>[\s\S]*?<\/title>/,
      `<title>${escapeHtml(meta.title)}</title>`
    );

    html = replaceTag(
      html,
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(meta.description)}" />`
    );

    html = replaceTag(
      html,
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/,
      `<meta name="robots" content="${escapeHtml(robots)}" />`
    );

    html = replaceTag(
      html,
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
      `<link rel="canonical" href="${escapeHtml(url)}" />`
    );

    html = replaceTag(
      html,
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:url" content="${escapeHtml(url)}" />`
    );

    html = replaceTag(
      html,
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:title" content="${escapeHtml(meta.title)}" />`
    );

    html = replaceTag(
      html,
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:description" content="${escapeHtml(meta.description)}" />`
    );

    html = replaceTag(
      html,
      /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`
    );

    html = replaceTag(
      html,
      /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`
    );

    html = replaceTag(
      html,
      /<div id="root"><\/div>/,
      `<div id="root">${bodyHtml}</div>`
    );

    const outPath =
      meta.path === '/'
        ? path.join(distDir, 'index.html')
        : path.join(distDir, meta.path.replace(/^\//, ''), 'index.html');

    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, html, 'utf8');

    console.log(`prerendered ${meta.path === '/' ? '/' : meta.path} -> ${path.relative(root, outPath)}`);
  }

  await writeSitemap(routes);

  await rm(ssrDir, { recursive: true, force: true });
}

async function writeSitemap(routes) {
  const today = new Date().toISOString().slice(0, 10);

  const urls = routes
    // Never list a noindex route in the sitemap.
    .filter((meta) => !meta.robots || !meta.robots.includes('noindex'))
    .map((meta) => {
      const loc =
        meta.path === '/' ? 'https://docbit.in/' : `https://docbit.in${meta.path}`;
      const changefreq = meta.sitemapChangefreq ?? 'monthly';
      const priority = meta.sitemapPriority ?? '0.5';

      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        '  </url>'
      ].join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  await writeFile(path.join(distDir, 'sitemap.xml'), xml, 'utf8');
  console.log('generated sitemap.xml with lastmod', today);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Rebuild ../llms-full.txt from the official MapLibre GL JS docs for a given release tag.
//
// Usage:  node build-llms-full.mjs [tag]      (default tag: v5.24.0)
// Deps:   npm install --no-save turndown cheerio turndown-plugin-gfm   (install transiently; do NOT add to
//         the repo's package.json — this is a maintenance tool, not a runtime dependency)
//
// It is self-contained: it discovers the API page list and the example list from the maplibre-gl-js repo
// tree at the given tag, fetches the rendered MkDocs pages + raw guide/example sources, converts the MkDocs
// "Material" content region to Markdown, and assembles one grep-friendly file. Scope: MapLibre GL JS (web)
// only — not MapLibre Native, Martin, or MLT.

import { load } from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { writeFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = process.argv[2] ?? 'v5.24.0';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'llms-full.txt');
const FAIL = resolve(HERE, 'build-failures.log');

const RAW = `https://raw.githubusercontent.com/maplibre/maplibre-gl-js/${TAG}`;
const TREE = `https://api.github.com/repos/maplibre/maplibre-gl-js/git/trees/${TAG}?recursive=1`;
const API = 'https://maplibre.org/maplibre-gl-js/docs/API';
const SPEC = 'https://maplibre.org/maplibre-style-spec';

// 8 concurrent fetches keeps us well under GitHub/CDN rate limits while finishing ~330 requests in seconds.
const POOL = 8;
// The hand-written guides shipped in the repo, in reading order.
const GUIDES = [
  'docs/index.md', 'docs/style-spec.md', 'docs/guides/index.md', 'docs/guides/large-data.md',
  'docs/guides/leaflet-migration-guide.md', 'docs/guides/mapbox-migration-guide.md',
  'docs/guides/openlayers-migration-guide.md',
];
// Style-spec sections a GL JS author consumes (the spec is its own site; this is the relevant subset).
const SPEC_SECTIONS = [
  'root', 'sources', 'layers', 'expressions', 'types', 'light', 'sky', 'terrain', 'projection', 'state',
  'sprite', 'glyphs', 'transition', 'font-faces',
];

const td = new TurndownService({ codeBlockStyle: 'fenced', headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '_' });
td.use(gfm);
td.remove(['script', 'style']);
td.addRule('pre', {
  filter: (n) => n.nodeName === 'PRE',
  replacement: (_c, node) => `\n\n\`\`\`\n${node.textContent.replace(/\n+$/, '')}\n\`\`\`\n\n`,
});

async function fetchText(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 45000);
      const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'maplibre-skill-builder' } });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i === tries) { appendFileSync(FAIL, `FAIL ${url} :: ${e.message}\n`); return null; }
      await new Promise((res) => setTimeout(res, 400 * i)); // linear backoff
    }
  }
}

function mkdocsToMd(html) {
  const $ = load(html);
  $('nav, .md-sidebar, .md-header, .md-footer, .md-tabs, .md-search, script, style, .md-source, .headerlink, .md-content__button, .md-nav').remove();
  const inner = $('.md-content__inner').first().html() || $('[role=main]').html() || '';
  return td.turndown(inner).replace(/\[\s*\]\([^)]*\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// Drop the page's own H1 (we emit our own `## Name`) and demote remaining headings so each item is a unique `## `.
function demote(md) {
  return md
    .replace(/^#\s+[^\n]*\n+/, '')
    .replace(/^(#{1,5})\s/gm, (_m, h) => '#'.repeat(Math.min(h.length + 1, 6)) + ' ')
    .trim();
}

function exampleToMd(html, slug) {
  const $ = load(html);
  const title = ($('title').first().text() || slug).trim();
  const desc = ($('meta[property="og:description"]').attr('content') || '').trim();
  let code = '';
  $('script').each((_, el) => {
    const e = $(el);
    if (!e.attr('src') && e.html()?.includes('maplibregl')) code = e.html().trim();
  });
  return code ? `\n\n## EXAMPLE: ${title}\n\n${desc ? desc + '\n\n' : ''}\`\`\`js\n${code}\n\`\`\`` : '';
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (idx < items.length) { const i = idx++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const banner = (t) => `\n\n# ${'='.repeat(8)} ${t} ${'='.repeat(8)}\n`;

writeFileSync(FAIL, '');
process.stderr.write(`Building llms-full.txt from MapLibre GL JS docs @ ${TAG}\n`);

// 1. Discover API slugs (from the rendered API index) and example slugs (from the repo tree).
const apiIndex = await fetchText(`${API}/`);
const apiSlugs = [...new Set(
  [...(apiIndex ?? '').matchAll(/href="\.\/(classes|interfaces|type-aliases|functions|enumerations|variables)\/([^"/]+)\//g)]
    .map((m) => `${m[1]}/${m[2]}`),
)].sort();
const tree = JSON.parse((await fetchText(TREE)) ?? '{"tree":[]}');
const examples = tree.tree
  .filter((n) => n.type === 'blob' && /^test\/examples\/.*\.html$/.test(n.path))
  .map((n) => n.path.replace(/^test\/examples\//, '').replace(/\.html$/, ''))
  .sort();
process.stderr.write(`  ${GUIDES.length} guides, ${apiSlugs.length} API pages, ${SPEC_SECTIONS.length} spec sections, ${examples.length} examples\n`);

// 2. Fetch + convert each group.
const guideMd = await pool(GUIDES, async (p) => {
  const t = await fetchText(`${RAW}/${p}`);
  return t ? `\n\n## GUIDE: ${p.replace('docs/', '').replace('.md', '')}\n\n${demote(t.trim())}` : '';
});
const kindOrder = ['classes', 'interfaces', 'type-aliases', 'functions', 'enumerations', 'variables'];
const byKind = Object.fromEntries(kindOrder.map((k) => [k, apiSlugs.filter((s) => s.startsWith(`${k}/`))]));
const apiParts = [];
for (const kind of kindOrder) {
  apiParts.push(banner(`API: ${kind.toUpperCase()}`));
  const md = await pool(byKind[kind], async (slug) => {
    const html = await fetchText(`${API}/${slug}/`);
    return html ? `\n\n## ${slug.split('/')[1]}\n\n${demote(mkdocsToMd(html))}` : '';
  });
  apiParts.push(md.filter(Boolean).join('\n'));
}
const specMd = await pool(SPEC_SECTIONS, async (sec) => {
  const html = await fetchText(`${SPEC}/${sec}/`);
  return html ? `\n\n## STYLE-SPEC: ${sec}\n\n${demote(mkdocsToMd(html))}` : '';
});
const exMd = await pool(examples, async (slug) => {
  const html = await fetchText(`${RAW}/test/examples/${slug}.html`);
  return html ? exampleToMd(html, slug) : '';
});

// 3. Assemble.
const header = `# MapLibre GL JS — Full Documentation (llms-full.txt)

> Bundled offline reference for the \`maplibre-gl\` skill. Source: official MapLibre GL JS documentation at
> ${TAG} (https://maplibre.org/maplibre-gl-js/docs/ and https://maplibre.org/maplibre-style-spec/). Scope:
> MapLibre GL JS (web) ONLY — not MapLibre Native, Martin, or MLT. Licence: BSD-3-Clause (library) / docs per
> MapLibre. Assembled: ${GUIDES.length} guides, ${apiSlugs.length} API pages, ${SPEC_SECTIONS.length}
> style-spec sections, ${examples.length} examples.

For grep/line-range retrieval from SKILL.md. Major parts are marked with \`# ========\` banners; every item is
a \`## Heading\`.
`;
const final = [
  header,
  banner('PART 1: GUIDES'), guideMd.filter(Boolean).join('\n'),
  banner('PART 2: API REFERENCE'), apiParts.join('\n'),
  banner('PART 3: STYLE SPECIFICATION'), specMd.filter(Boolean).join('\n'),
  banner('PART 4: EXAMPLES'), exMd.filter(Boolean).join('\n'),
].join('\n') + '\n';

writeFileSync(OUT, final);
process.stderr.write(`DONE: ${OUT} — ${final.split('\n').length} lines, ${(final.length / 1024).toFixed(0)} KB\n`);

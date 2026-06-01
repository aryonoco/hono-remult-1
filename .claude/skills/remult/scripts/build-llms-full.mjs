#!/usr/bin/env node
// Regenerate llms-full.txt for the `remult` skill from the OFFICIAL Remult docs.
//
//   node build-llms-full.mjs [tag]        # e.g. v3.3.10 (default), v3.4.0
//
// Source of truth: the markdown under `docs/docs/**` in the remult/remult repo at
// the given git tag — the same files that render at https://remult.dev/docs and
// feed the official https://remult.dev/llms.txt index. We concatenate them in the
// site's canonical reading order (mirrored from /llms.txt), stripping VitePress-only
// constructs (frontmatter, <script setup>, Vue components, ::: containers) while
// leaving every fenced code block byte-for-byte intact.
//
// No npm deps: the docs are already markdown, so this is pure string processing.
// Scope: GL-of-Remult, i.e. the /docs guide + API-reference pages. The external
// interactive tutorials (learn.remult.dev) are intentionally excluded.

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = process.argv[2] ?? 'v3.3.10';
const REPO = 'remult/remult';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(SCRIPT_DIR, '..', 'llms-full.txt');

// Canonical reading order, mirrored from https://remult.dev/llms.txt. Each slug is
// a path under docs/docs (without the .md). Anything present in the repo but missing
// here is auto-appended under "Appendix" so the file is always complete.
const SECTIONS = [
  ['Getting Started', ['index', 'creating-a-project', 'quickstart', 'example-apps']],
  ['Entities', [
    'entities', 'field-types', 'entity-relations', 'filtering-and-relations',
    'lifecycle-hooks', 'migrations', 'entities-codegen-from-db-schema', 'offline-support',
    'active-record', 'entity-backend-methods', 'mutable-controllers',
  ]],
  ['Stacks — Frameworks', [
    'installation/framework/react', 'installation/framework/angular', 'installation/framework/vue',
    'installation/framework/sveltekit', 'installation/framework/nextjs', 'installation/framework/solid',
    'installation/framework/nuxt',
  ]],
  ['Stacks — Servers', [
    'installation/server/express', 'installation/server/fastify', 'installation/server/hono',
    'installation/server/elysia', 'installation/server/hapi', 'installation/server/koa',
    'installation/server/nest',
  ]],
  ['Stacks — Databases', [
    'installation/database/index', 'installation/database/postgresql', 'installation/database/mysql',
    'installation/database/mongodb', 'installation/database/sqlite3', 'installation/database/better-sqlite3',
    'installation/database/sqljs', 'installation/database/mssql', 'installation/database/bun-sqlite',
    'installation/database/turso', 'installation/database/duckdb', 'installation/database/oracle',
    'installation/database/d1', 'installation/database/json',
  ]],
  ['Server-side Code', ['backendMethods', 'using-server-only-packages']],
  ['Guides', ['access-control', 'admin-ui', 'modules', 'modules-community']],
  ['Escape Hatches', [
    'custom-filter', 'running-sql-on-the-server', 'using-remult-in-custom-backend-code',
    'working-without-decorators', 'custom-options',
  ]],
  ['Integrations', ['adding-swagger', 'adding-graphql', 'standard-schema']],
  ['API Reference', [
    'ref_entity', 'ref_field', 'ref_valueconverter', 'validation', 'ref_validators',
    'ref_relations', 'ref_relationoptions', 'ref_remult', 'ref_apiclient', 'ref_repository',
    'ref_remultserveroptions', 'entityFilter', 'ref_entitymetadata', 'ref_fieldmetadata', 'allowed',
    'ref_backendmethod', 'ref_queryresult', 'ref_paginator', 'ref_livequery', 'ref_livequerychangeinfo',
    'ref_filter', 'ref_filterprecisevalues', 'ref_preprocessfilterinfo', 'ref_sort', 'ref_sqldatabase',
    'ref_subscriptionchannel', 'ref_generatemigrations', 'ref_migrate', 'ref_initasynchooks', 'rest-api',
    'ref_entitybase', 'ref_identity', 'ref_entityref', 'ref_fieldref', 'ref_getentityref', 'ref_getfields',
  ]],
];

// Vue/VitePress doc-only components that wrap or decorate prose (never code). We drop
// these tags OUTSIDE fenced code blocks only; code samples keep <Task/>, <Order/> etc.
const DOC_COMPONENTS = ['Icon', 'Remultor', 'SwaggerUI', 'ReactSwagger', 'ClientOnly', 'Example'];
const COMPONENT_RE = new RegExp(`</?(?:${DOC_COMPONENTS.join('|')})\\b[^>]*>`, 'g');

function humanize(slug) {
  const base = slug.split('/').pop().replace(/^ref_/, '');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { body: md, llm: '', skip: false };
  const fm = m[1];
  const llmMatch = fm.match(/^llm:\s*(.*)$/m);
  let llm = llmMatch ? llmMatch[1].trim() : '';
  if (llm.startsWith('"') || llm.startsWith("'")) llm = llm.slice(1, -1);
  const skip = /^llm:\s*false\b/m.test(fm);
  return { body: md.slice(m[0].length), llm, skip };
}

// Fence-aware cleanup: strip VitePress chrome, preserve every code block verbatim.
function cleanBody(md) {
  // Whole-document removals (these blocks never live inside code fences).
  md = md
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');

  const lines = md.split('\n');
  const out = [];
  let inFence = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    if (inFence) {
      out.push(raw);
      continue;
    }
    // ----- outside fenced code: apply VitePress cleanup -----
    // Container fences: ::: tip|warning|info|danger|details [title]  /  ::: code|tabs|code-group  /  closing :::
    const callout = trimmed.match(/^:::\s*(tip|warning|info|danger|details)\b\s*(.*)$/i);
    if (callout) {
      const label = callout[1].toUpperCase();
      out.push(callout[2] ? `**${label} — ${callout[2]}**` : `**${label}**`);
      continue;
    }
    if (/^:::/.test(trimmed)) continue; // ::: code / ::: tabs / closing :::
    if (/^==\s+\S/.test(trimmed)) {
      out.push(`**${trimmed.replace(/^==\s+/, '')}**`); // tab label
      continue;
    }
    // Strip doc-only Vue component tags; drop the line if nothing meaningful remains.
    let line = raw.replace(COMPONENT_RE, '');
    if (/^\s*<\/?(?:div|br|ClientOnly)\b[^>]*>\s*$/.test(line)) continue;
    if (line.trim() === '' && raw.trim() !== '') continue; // line was only a component
    out.push(line);
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function fetchDocs() {
  const dir = mkdtempSync(join(tmpdir(), 'remult-docs-'));
  const tar = join(dir, 'remult.tar.gz');
  process.stderr.write(`Downloading ${REPO}@${TAG} docs...\n`);
  execSync(`curl -sL "https://github.com/${REPO}/archive/refs/tags/${TAG}.tar.gz" -o "${tar}"`, {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  execSync(`tar -xzf "${tar}" -C "${dir}" --wildcards '*/docs/docs/*'`, {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const root = join(dir, `remult-${TAG.replace(/^v/, '')}`, 'docs', 'docs');
  if (!existsSync(root)) throw new Error(`docs/docs not found under ${root}`);
  return { tmp: dir, root };
}

function allMarkdown(root, rel = '') {
  const acc = [];
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) acc.push(...allMarkdown(root, childRel));
    else if (entry.name.endsWith('.md')) acc.push(childRel.replace(/\.md$/, ''));
  }
  return acc;
}

function emitPage(slug, root, section) {
  const file = join(root, `${slug}.md`);
  if (!existsSync(file)) {
    process.stderr.write(`  WARN missing: ${slug}\n`);
    return null;
  }
  const { body, llm, skip } = parseFrontmatter(readFileSync(file, 'utf8'));
  if (skip) return null;
  const cleaned = cleanBody(body);
  const h1 = cleaned.match(/^#\s+(.+)$/m);
  const title = h1 ? h1[1].trim() : humanize(slug);
  const header = `# ${section} — ${title}\n`;
  const note = llm ? `\n> ${llm}\n` : '\n';
  // Drop the page's own leading H1 (now redundant with our section header).
  const rest = h1 ? cleaned.replace(/^#\s+.+$/m, '').trimStart() : cleaned;
  return { title, text: `${header}${note}\n${rest}\n` };
}

function main() {
  const { tmp, root } = fetchDocs();
  try {
    const used = new Set();
    const chunks = [];
    const index = []; // { kind, label, line }
    let line = 1;
    const push = (text) => {
      chunks.push(text);
      line += text.split('\n').length - 1;
    };

    const preamble =
      `# Remult ${TAG} — Full Documentation (offline)\n\n` +
      `> Assembled by scripts/build-llms-full.mjs from the official docs/docs markdown in\n` +
      `> ${REPO}@${TAG}, in the canonical order of https://remult.dev/llms.txt. VitePress\n` +
      `> chrome is stripped; all code blocks are verbatim. Regenerate: node build-llms-full.mjs <tag>.\n\n`;
    push(preamble);

    for (const [section, slugs] of SECTIONS) {
      index.push({ kind: 'section', label: section, line });
      for (const slug of slugs) {
        const page = emitPage(slug, root, section);
        used.add(slug);
        if (!page) continue;
        index.push({ kind: 'page', label: `${section} / ${page.title}`, line });
        push(`${page.text}\n`);
      }
    }

    // Completeness fallback: append any repo page not already included.
    const leftovers = allMarkdown(root).filter((s) => !used.has(s) && s !== 'llms').sort();
    const appendix = [];
    for (const slug of leftovers) {
      const page = emitPage(slug, root, 'Appendix');
      if (page) appendix.push({ slug, page });
    }
    if (appendix.length) {
      index.push({ kind: 'section', label: 'Appendix — Additional Pages', line });
      for (const { page } of appendix) {
        index.push({ kind: 'page', label: `Appendix / ${page.title}`, line });
        push(`${page.text}\n`);
      }
    }

    writeFileSync(OUT, chunks.join(''));
    const totalLines = chunks.join('').split('\n').length;

    // Print a section index to stdout for pasting into SKILL.md.
    process.stdout.write(`\nWrote ${OUT}\nTotal lines: ${totalLines}\n\nSECTION INDEX:\n`);
    for (const e of index) {
      if (e.kind === 'section') process.stdout.write(`\n## ${e.label}  (line ${e.line})\n`);
      else process.stdout.write(`   ${String(e.line).padStart(6)}  ${e.label}\n`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();

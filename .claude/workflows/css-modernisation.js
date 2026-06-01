export const meta = {
  name: 'css-modernisation',
  description:
    'Modernise ALL app styling to 2026 best practice (CSS-1..6), preserving the exact rendered appearance',
  whenToUse:
    'Run AFTER the FORMS + SCOPE campaigns are complete and committed, and NOT while the main loop is editing/committing (concurrent commits race the git index). A pure refactor: every screen must look identical before/after in both themes.',
  phases: [
    { title: 'Inventory', detail: 'enumerate every styling source + classify legacy declarations' },
    { title: 'Modernise', detail: 'one agent per styling area — appearance-preserving uplift' },
    { title: 'Review', detail: 'adversarial check that each diff preserves appearance + is 2026-compliant' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// The quality bar every agent must honour (kept verbatim so each fresh subagent
// has the full contract without reading the repo's docs).
const QUALITY_BAR = `
QUALITY BAR (hard rules — a violation fails review):
- This is a REFACTOR. PRESERVE the exact rendered appearance. Do NOT change layout,
  spacing, colour, or behaviour as seen on screen. Same pixels, modern source.
- Colour ONLY via --mat-sys-* / --color-* tokens. NEVER a hex/rgb/hsl literal outside
  the @theme token layer of tailwind.css. No new colour values.
- NO !important except the single existing prefers-reduced-motion view-transition guard
  in styles.scss. Recolour/size Material ONLY via mat.*-overrides()/density — never
  .mat-mdc-*/.mdc-*/::ng-deep.
- Keep whole static Tailwind class strings (never build class names at runtime).
- Preserve every data-testid and every selector other code/tests depend on
  (class names used by specs or [class.x] bindings must not be renamed).
- Keep the cascade-layer order (base, material, tailwind, utilities) intact.

2026 MODERNISATION TARGETS (apply where it does NOT change appearance):
- Units: replace stray px with rem/em for type, spacing, radii, breakpoints; keep px
  ONLY for genuine 1px hairlines/borders and sub-pixel geometry. Prefer the Tailwind
  spacing scale / canonical utilities over arbitrary [Npx] values.
- Logical properties: margin/padding-inline|block, inset, border-start/end, text-align
  start/end (RTL/i18n ready) instead of physical top/right/bottom/left.
- Fluid sizing with clamp()/min()/max() where a fixed value is really a responsive one.
- Layout via grid/flex + gap rather than margins for spacing; container queries where a
  component should respond to its container not the viewport.
- Uniform use of :has(), :focus-visible, color-mix(), light-dark(), cascade layers
  (several already used — make them consistent, don't introduce regressions).
- No magic numbers: use the scale or named tokens/custom properties.

After editing, the file must still compile and the app must build. Do NOT run git
commit (the orchestrator commits). Do NOT run a dev server.
`

const INVENTORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['areas'],
  properties: {
    areas: {
      type: 'array',
      description: 'Every distinct styling source in apps/web (and any shared lib styles).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'kind', 'legacyNotes', 'priority'],
        properties: {
          path: { type: 'string', description: 'Repo-relative file path.' },
          kind: {
            type: 'string',
            enum: ['global-scss', 'tailwind-css', 'component-inline', 'component-stylefile', 'template-arbitrary'],
          },
          legacyNotes: {
            type: 'string',
            description:
              'Concrete legacy patterns found (stray px, physical props, magic numbers, hex literals, arbitrary [Npx] Tailwind, margin-for-spacing, etc.). Empty string if already modern.',
          },
          priority: { type: 'string', enum: ['high', 'medium', 'low', 'already-modern'] },
        },
      },
    },
  },
}

const CHANGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'status', 'summary', 'changes'],
  properties: {
    path: { type: 'string' },
    status: { type: 'string', enum: ['MODERNISED', 'ALREADY_MODERN', 'BLOCKED'] },
    summary: { type: 'string', description: 'One paragraph: what was modernised and why it is appearance-neutral.' },
    changes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Bullet list of concrete edits (e.g. "px→rem on .card padding", "top/left→inset").',
    },
    appearanceRisk: {
      type: 'string',
      description: 'Any edit that could conceivably shift a pixel, and why it does not. Empty if none.',
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'appearancePreserved', 'compliant', 'verdict', 'issues'],
  properties: {
    path: { type: 'string' },
    appearancePreserved: { type: 'boolean', description: 'Does the diff provably keep the same rendered result?' },
    compliant: { type: 'boolean', description: 'Does it meet the 2026 targets + quality bar with no violations?' },
    verdict: { type: 'string', enum: ['APPROVED', 'NEEDS_WORK'] },
    issues: { type: 'array', items: { type: 'string' }, description: 'Specific problems if NEEDS_WORK.' },
  },
}

// ── Phase 1: inventory ───────────────────────────────────────────────────────
phase('Inventory')
log('Inventorying every styling source in apps/web…')
const inventory = await agent(
  `Inventory EVERY styling source in this Angular workspace so a modernisation pass can cover ALL of it.
Search apps/web (and any shared lib styles) for:
  - global stylesheets: apps/web/src/styles.scss, apps/web/src/tailwind.css, apps/web/src/**/*.css|*.scss
  - component inline styles: every @Component({ styles: \`…\` }) and styleUrl(s)
  - arbitrary Tailwind values in templates/inline classes: bracketed utilities like [Npx], [calc(...)],
    physical-direction utilities, and magic numbers
For each distinct file/area, classify the legacy patterns present (stray px, physical properties,
magic numbers, hex/rgb/hsl literals, arbitrary [Npx], margin-for-spacing). Use ripgrep/glob; read
excerpts, not whole files. Return the structured inventory. Mark already-modern files as priority
"already-modern" with empty legacyNotes so the modernise phase can skip them.`,
  { label: 'inventory', phase: 'Inventory', schema: INVENTORY_SCHEMA, agentType: 'Explore' },
)

const targets = inventory.areas.filter((a) => a.priority !== 'already-modern')
log(`${inventory.areas.length} styling areas found; ${targets.length} need modernisation.`)
if (targets.length === 0) {
  return { inventory, results: [], note: 'All styling already modern.' }
}

// ── Phase 2+3: modernise each area, then adversarially review it ─────────────
// Pipeline (no barrier): each area is reviewed as soon as its modernisation lands.
// Agents EDIT files only — they do NOT commit; the orchestrator (main loop) runs
// check:ci + the AA guard + a browser before/after sweep and commits per area.
const results = await pipeline(
  targets,
  (area) =>
    agent(
      `Modernise the styling in ${area.path} to 2026 best practice, PRESERVING the exact rendered appearance.
Legacy patterns noted in inventory: ${area.legacyNotes || '(none recorded — audit it yourself)'}
${QUALITY_BAR}
Edit the file in place. Return the structured change record.`,
      { label: `modernise:${area.path}`, phase: 'Modernise', schema: CHANGE_SCHEMA },
    ),
  (change, area) =>
    agent(
      `Adversarially review the modernisation of ${area.path}. Read the current file and its git diff.
Default to NEEDS_WORK if ANYTHING could shift a rendered pixel or violates the bar.
${QUALITY_BAR}
The implementer reported: ${change?.summary ?? '(no summary — treat as suspect)'}
Check: (1) every edit is appearance-neutral; (2) no new colour literal, no !important, no .mat-mdc-*/::ng-deep,
no renamed selector a spec/binding depends on; (3) the 2026 targets are actually applied (not cosmetic).
Return the verdict with specific issues.`,
      { label: `review:${area.path}`, phase: 'Review', schema: VERDICT_SCHEMA },
    ).then((verdict) => ({ area: area.path, change, verdict })),
)

const clean = results.filter(Boolean)
const approved = clean.filter((r) => r.verdict?.verdict === 'APPROVED')
const needsWork = clean.filter((r) => r.verdict?.verdict !== 'APPROVED')
log(`Modernised + reviewed ${clean.length} areas: ${approved.length} approved, ${needsWork.length} need follow-up.`)

// The orchestrator must, after this returns: run `bun run check:ci` + `bunx nx test web`
// + the AA contrast guard, browser-verify each screen looks identical in both themes at
// 1320/820/390, fix any NEEDS_WORK area, then commit (one focused commit per area or a
// single CSS-modernisation commit). Nothing here is committed.
return { inventory, approved, needsWork, areas: clean }

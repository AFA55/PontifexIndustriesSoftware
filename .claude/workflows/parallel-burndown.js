export const meta = {
  name: 'parallel-burndown',
  description: 'Fan out N independent backlog items as worktree-isolated builders, guardian-review + verify each, report diffs for approval (no push).',
  whenToUse: 'Burning down several INDEPENDENT bugs/chores at once instead of serially. Each item must touch non-overlapping files. Pass items via args.',
  phases: [
    { title: 'Build', detail: 'one worktree-isolated builder per item' },
    { title: 'Review', detail: 'guardian-review each change adversarially' },
    { title: 'Verify', detail: 'confirm wired end-to-end + no regressions' },
  ],
}

// args = [{ id, title, prompt, files }] — id: short slug, title: human label,
//   prompt: full self-contained builder instructions, files: hint of files in scope.
// If args is missing, the workflow no-ops with a usage note.
const items = Array.isArray(args) ? args : []
if (!items.length) {
  log('No items passed. Invoke with args: [{id,title,prompt,files}]')
  return { error: 'no-items', usage: 'Workflow({scriptPath, args:[{id,title,prompt,files}]})' }
}

log(`Burndown: ${items.length} item(s) — ${items.map(i => i.id).join(', ')}`)

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'status', 'summary', 'filesChanged'],
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked', 'skipped'] },
    summary: { type: 'string', description: 'what changed + why, 2-4 sentences' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', description: 'risks, follow-ups, or blocker reason' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'verdict', 'blocking', 'findings'],
  properties: {
    id: { type: 'string' },
    verdict: { type: 'string', enum: ['PASS', 'BLOCKING'] },
    blocking: { type: 'number', description: 'count of blocking findings' },
    findings: { type: 'array', items: { type: 'string' } },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'wiredEndToEnd', 'buildClean', 'verdict'],
  properties: {
    id: { type: 'string' },
    wiredEndToEnd: { type: 'boolean' },
    buildClean: { type: 'boolean' },
    verdict: { type: 'string', enum: ['ship-ready', 'needs-work'] },
    detail: { type: 'string' },
  },
}

// Pipeline: each item flows Build -> Review -> Verify independently (no barrier).
const results = await pipeline(
  items,
  // Stage 1: builder, worktree-isolated so parallel edits never collide
  (item) =>
    agent(
      `You are a senior builder on the Pontifex Industries platform (Next.js 15 + Supabase + Capacitor multi-tenant SaaS).\n` +
        `READ FIRST: CLAUDE.md (hard conventions — RLS via SECURITY DEFINER helpers, dates via lib/dates.ts, email via lib/email.ts, tenant_id on every table). Obey it.\n\n` +
        `TASK: ${item.title}\n\n${item.prompt}\n\n` +
        `Scope (stay within these unless strictly necessary): ${(item.files || []).join(', ') || 'as needed'}\n\n` +
        `Rules: make the change, keep it minimal and idiomatic to surrounding code, run \`npx tsc --noEmit\` on what you touched. ` +
        `Do NOT push, do NOT apply DB migrations to prod (write the .sql file only), do NOT edit files outside your scope.`,
      { label: `build:${item.id}`, phase: 'Build', isolation: 'worktree', schema: RESULT_SCHEMA }
    ),
  // Stage 2: guardian review of that item's change
  (built, item) =>
    built && built.status === 'done'
      ? agent(
          `Run the guardian-review checklist adversarially on this change.\n` +
            `Item: ${item.title}\nBuilder summary: ${built.summary}\nFiles: ${(built.filesChanged || []).join(', ')}\n\n` +
            `Check for: tenant-isolation/RLS gaps (NEVER auth.jwt()->user_metadata), missing tenant_id, auth on API routes, ` +
            `date-handling bugs (no new Date('YYYY-MM-DD')), email via lib/email.ts only, mobile tap targets, dead code, security. ` +
            `Return verdict PASS or BLOCKING with specific findings.`,
          { label: `review:${item.id}`, phase: 'Review', agentType: 'guardian-review', schema: REVIEW_SCHEMA }
        ).then((r) => ({ ...built, review: r || null }))
      : { ...(built || { id: item.id, status: 'blocked' }), review: null },
  // Stage 3: end-to-end verification
  (reviewed, item) =>
    reviewed && reviewed.status === 'done'
      ? agent(
          `Verify this change is wired end-to-end and introduces no regressions.\n` +
            `Item: ${item.title}\nSummary: ${reviewed.summary}\nReview verdict: ${reviewed.review?.verdict || 'n/a'}\n\n` +
            `Trace the real data path (auth -> route -> DB/RLS -> response -> UI where relevant). Run \`npm run build\` and report if clean.`,
          { label: `verify:${item.id}`, phase: 'Verify', agentType: 'production-validator', schema: VERIFY_SCHEMA }
        ).then((v) => ({ ...reviewed, verify: v || null }))
      : reviewed
)

const report = results.filter(Boolean).map((r) => ({
  id: r.id,
  status: r.status,
  summary: r.summary,
  filesChanged: r.filesChanged,
  review: r.review?.verdict || 'n/a',
  blocking: r.review?.blocking ?? 0,
  verify: r.verify?.verdict || 'n/a',
  notes: r.notes || '',
}))

const shipReady = report.filter((r) => r.review === 'PASS' && r.verify === 'ship-ready')
log(`Done: ${shipReady.length}/${report.length} ship-ready. Review diffs before push.`)
return { report, shipReady: shipReady.map((r) => r.id) }

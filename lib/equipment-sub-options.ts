/**
 * Sub-option (`_sub`) handling for the schedule form's per-service equipment
 * picks (`job_orders.equipment_selections`).
 *
 * A service's `_sub` is the ONE machine or system the job goes out with —
 * WS/TS picks Pentruder vs Track Saw (PBG); DFS picks which floor saw. It is a
 * single string on purpose:
 *
 *   - it prints in the ticket's service HEADING, "DFS (Husqvarna 7000)", via
 *     SUB_OPTION_LABELS in lib/job-ticket-format.ts — a comma-joined value
 *     would miss that lookup and print raw keys;
 *   - it is what an item's `showWhen` is compared against, so follow-up
 *     questions ("15 HP or 40 HP?") have exactly one machine to belong to.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT
 * Switching the sub-option used to LEAVE the previous machine's gated picks in
 * `equipment_selections`. The form hid them the instant the `showWhen` filter
 * stopped matching, but nothing removed them, so the printed ticket still
 * listed a Pentruder 480 cord on a PBG job — or, with the new DFS saw picker,
 * "slab saw motor (40 HP)" on a Tier 4 diesel ticket. Invisible in the form,
 * wrong in the shop, and impossible for the office to correct because the
 * control that wrote it is no longer on screen.
 *
 * `applySubOption` is the only place a `_sub` changes. It drops exactly the
 * picks that just became unreachable, and nothing else.
 */

/**
 * Apply a new sub-option to one service's picks.
 *
 * @param picks             the service's current `equipment_selections[code]`
 * @param nextSub           the newly chosen sub-option value; `''` clears it
 * @param showWhenByItemId  item id → its `showWhen` gate (absent = ungated)
 * @returns a NEW picks object — the input is never mutated
 *
 * Ungated picks (slurry drums, chalk line, core bits) belong to the SERVICE,
 * not the machine, so they survive every switch. Gated picks survive only while
 * their gate still matches; clearing the sub-option drops all of them, because
 * with no sub-option selected none of them can be seen or edited.
 */
export function applySubOption(
  picks: Record<string, string> | null | undefined,
  nextSub: string,
  showWhenByItemId: Record<string, string | undefined>,
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const [itemId, value] of Object.entries(picks || {})) {
    if (itemId === '_sub') continue;
    const gate = showWhenByItemId?.[itemId];
    if (gate == null) {
      next[itemId] = value;
      continue;
    }
    if (nextSub !== '' && gate === nextSub) next[itemId] = value;
  }

  if (nextSub) next._sub = nextSub;
  return next;
}

/**
 * Build the `showWhen` lookup `applySubOption` needs from a service's item
 * catalog. Items without a gate are simply absent from the map, which is what
 * "ungated" means to `applySubOption` — so a `showWhen: undefined` entry and a
 * missing entry behave identically and callers cannot get it subtly wrong.
 */
export function showWhenMap(
  items: { id: string; showWhen?: string }[],
): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const item of items) {
    if (item.showWhen) map[item.id] = item.showWhen;
  }
  return map;
}

/**
 * HOW A PERSON'S NAME IS SHOWN, everywhere, once.
 *
 * Conrade Richardson goes by **Nate**. The founder has to hunt for "Conrade
 * Richardson" on every timecard and every crew picker, because the nickname is
 * what everyone in the company actually calls him — and `profiles.nickname` has
 * existed, and been editable in Team Profiles, the whole time. Almost nothing
 * rendered it.
 *
 * This lives in one place so thirty call sites cannot each invent their own
 * format. The rule:
 *
 *     Conrade Richardson (Nate)      — has a nickname
 *     Dante Burgess                  — does not
 *     Nate                           — nickname only, no real name on file
 *
 * The REAL name leads because it is what payroll, the customer's ticket and any
 * legal record use. The nickname follows because it is what the office says out
 * loud. Neither replaces the other.
 */

export interface NameableProfile {
  full_name?: string | null;
  nickname?: string | null;
}

/** "Conrade Richardson (Nate)" — for lists, pickers, tables. */
export function displayName(p: NameableProfile | null | undefined, fallback = 'Unknown'): string {
  const full = (p?.full_name ?? '').trim();
  const nick = (p?.nickname ?? '').trim();
  if (!full && !nick) return fallback;
  if (!full) return nick;
  if (!nick) return full;
  // A nickname that IS the name (or the first name) adds nothing but noise.
  const lowerFull = full.toLowerCase();
  const lowerNick = nick.toLowerCase();
  if (lowerFull === lowerNick || lowerFull.split(/\s+/)[0] === lowerNick) return full;
  return `${full} (${nick})`;
}

/**
 * Everything this person might be typed as, lowercased — for a search box.
 * Searching "nate" has to find Conrade, or the nickname is decoration.
 */
export function nameSearchText(p: NameableProfile | null | undefined): string {
  return [p?.full_name ?? '', p?.nickname ?? ''].join(' ').toLowerCase().trim();
}

/** Does this person match what was typed? Matches on either name, any word. */
export function matchesNameQuery(p: NameableProfile | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = nameSearchText(p);
  // Every whitespace-separated term must appear, so "con rich" still finds
  // Conrade Richardson without matching everyone called Con.
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

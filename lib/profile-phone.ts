/**
 * The one place that knows `profiles` has TWO phone columns.
 *
 * THE BUG (task #60, founder Aug 7): signup, the invite flow and the access
 * request all write **`phone_number`** — it is populated for every active
 * Patriot crew member. A separate, much older **`phone`** column is empty for
 * all but two rows. Several readers read `phone`, saw nothing, and reported
 * crew numbers as missing. They were never missing; we were reading the wrong
 * column. The founder pushed back on being told the data had never been
 * collected, and he was right.
 *
 * `phone_number` is canonical. `phone` is a fallback only, never a target.
 *
 * ⚠️ The two rows that DO have `phone` are both the founder's own accounts, and
 * in both the two columns disagree (`phone` = 470-658-6313 while `phone_number`
 * = (864) 940-7161 / +4706586313). So `phone` is NOT simply stale — it may hold
 * a second real number. Nothing here copies one column into the other; that
 * call needs a human. See BACKLOG.
 */

/** Select list for any query that needs a person's phone. Use this, not a
 *  hand-written column list, so a new reader can't pick the empty column. */
export const PROFILE_PHONE_SELECT = 'phone_number, phone';

export interface ProfilePhoneColumns {
  phone_number?: string | null;
  phone?: string | null;
}

/**
 * The person's phone number, canonical column first.
 * Returns null when neither column holds anything usable — callers must handle
 * "no number on file" rather than rendering an empty string.
 */
export function readProfilePhone(profile: ProfilePhoneColumns | null | undefined): string | null {
  if (!profile) return null;
  const canonical = typeof profile.phone_number === 'string' ? profile.phone_number.trim() : '';
  if (canonical) return canonical;
  const legacy = typeof profile.phone === 'string' ? profile.phone.trim() : '';
  return legacy || null;
}

/**
 * Normalise a user-entered number for STORAGE.
 *
 * Live data arrives in at least three shapes — `(864) 275-0064`, `+4706586313`
 * and `470-658-6313`. Ten-digit US numbers are stored as `(XXX) XXX-XXXX`,
 * which is what 15 of the 17 populated rows already look like, so new writes
 * match what is already there.
 *
 * Anything that isn't a recognisable US number is returned trimmed rather than
 * rejected — an operator with an unusual number must not be blocked from
 * saving their profile. `formatPhoneNumber` in lib/sms.ts does the E.164
 * conversion at send time and is the authority for whether a number is
 * textable.
 */
export function normalizeProfilePhone(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  const local =
    digits.length === 10 ? digits :
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) :
    null;

  if (!local) return trimmed;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

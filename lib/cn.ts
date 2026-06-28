/**
 * cn — tiny class-name merge util for the Pontifex UI library.
 *
 * Dependency-free (we deliberately do NOT pull in clsx/tailwind-merge — see
 * docs/TOOLING_EVALUATION.md). It flattens conditional class inputs into a single
 * space-separated string and de-dupes by last-write-wins on a per-token basis so
 * a `className` passthrough can override a component's defaults predictably.
 *
 * Last-write-wins is token-exact (e.g. passing `"p-8"` will NOT override `"p-5"` —
 * they're different tokens). For prefix-aware conflict resolution you'd want
 * tailwind-merge, but for our primitives explicit token override is enough and
 * keeps the bundle lean. When you need to override a default, pass the SAME token
 * shape you want to win.
 */

export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

function toTokens(input: ClassValue, out: string[]): void {
  if (!input) return;
  if (typeof input === 'string' || typeof input === 'number') {
    out.push(String(input));
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) toTokens(item, out);
    return;
  }
  if (typeof input === 'object') {
    for (const [key, val] of Object.entries(input)) {
      if (val) out.push(key);
    }
  }
}

export function cn(...inputs: ClassValue[]): string {
  const raw: string[] = [];
  for (const input of inputs) toTokens(input, raw);

  // Split on whitespace into individual tokens, then de-dupe last-write-wins.
  const tokens: string[] = [];
  for (const chunk of raw) {
    for (const t of chunk.split(/\s+/)) {
      if (t) tokens.push(t);
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];
  // Walk backwards so the LAST occurrence wins, then reverse to restore order.
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (seen.has(t)) continue;
    seen.add(t);
    result.push(t);
  }
  return result.reverse().join(' ');
}

export default cn;

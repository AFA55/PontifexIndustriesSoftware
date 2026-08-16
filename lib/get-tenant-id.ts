import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * The tenant a user belongs to.
 *
 * ── WHY THIS FILE NO LONGER SWALLOWS ERRORS ─────────────────────────────────
 *
 * It used to end `catch { return null }`. That is nine characters that quietly
 * turn a database hiccup into a cross-company data leak, because of how all
 * 101 call sites are written:
 *
 *     const tenantId = await getTenantId(user.id);
 *     if (tenantId) query = query.eq('tenant_id', tenantId);   // ← no filter
 *
 * A null does not mean "filter by nothing sensibly". It means NO FILTER AT ALL.
 * So a transient failure reaching Supabase downgraded a company-scoped query
 * into a platform-wide one — for every role, on reads AND on the routes that
 * update and delete.
 *
 * This is not hypothetical. Supabase was unreachable from this machine for over
 * an hour on Aug 16, and the platform logged 196 auth failures in twenty
 * minutes during it. That is precisely the condition this catch was built to
 * hide.
 *
 * NOW IT THROWS. A route that cannot establish which company is asking must
 * fail, loudly, with a 500 — because the alternative is answering with another
 * company's data and telling nobody. A 500 is visible and gets fixed; a silent
 * cross-tenant read is neither.
 *
 * The one thing it still returns null for is the case the original docstring
 * meant: the query SUCCEEDED and this user genuinely has no tenant. That is a
 * fact about the user, not a failure to find out.
 */
export async function getTenantId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    // maybeSingle, not single: "no such profile" comes back as data === null
    // rather than as an error, so a genuinely missing row is distinguishable
    // from the database being unreachable.
    .maybeSingle();

  if (error) {
    // Includes network failures, timeouts and permission errors. Never
    // downgrade any of them to "no tenant".
    throw new Error(`Could not resolve tenant for user ${userId}: ${error.message}`);
  }

  if (!data) {
    // requireAuth guarantees a profile exists before any route calls this, so
    // reaching here means the profile vanished mid-request or the caller passed
    // an id it never authenticated. Either way, "unknown user" must not become
    // "show them everything".
    throw new Error(`No profile found for user ${userId} — refusing to run an unscoped query.`);
  }

  return data.tenant_id ?? null;
}

/**
 * WHICH COMPANY AM I SIGNED IN TO, AND WHY CAN'T I SEE THIS?
 *
 * FOUNDER (Aug 16), setting the rule explicitly: "Patriot data should remain
 * within Patriot… later on there will be other companies and they will input
 * their own company code to access only their information… everything that is
 * Patriot should remain as Patriot."
 *
 * The isolation itself already works — a job on another tenant is refused. What
 * did NOT work was saying so. He was signed into the PONTIFEX portal, opened a
 * PATRIOT job, and the API answered "Job not found" — which reads as "this job
 * was deleted", not "you are in the wrong company". Ninety-eight routes say
 * that same bare sentence.
 *
 * WHY THIS STILL RETURNS 404 AND NOT 403.
 *
 * A 403 saying "that belongs to Patriot Concrete Cutting" would confirm the
 * record EXISTS to someone who is not entitled to know that. With one tenant
 * that feels pedantic; with fifty it is how a competitor learns your customer
 * list by walking ids. So the status stays 404 and the wording carries the
 * information the signed-in user is already entitled to — the name of the
 * company THEY are in. "Not found in Pontifex Industries" is true whether the
 * record never existed or lives on another tenant, and it points at the real
 * cause without confirming anything about another company's data.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase-admin';

/**
 * Tenant names change roughly never, and this is on an error path that can be
 * hit in a loop, so one lookup per process is plenty. Not a correctness-
 * sensitive cache: the worst staleness is an old company name in an error.
 */
const nameCache = new Map<string, string>();

export async function tenantDisplayName(tenantId: string | null | undefined): Promise<string | null> {
  if (!tenantId) return null;
  const cached = nameCache.get(tenantId);
  if (cached) return cached;
  try {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle();
    const name = (data?.name as string | undefined)?.trim();
    if (!name) return null;
    nameCache.set(tenantId, name);
    return name;
  } catch {
    // An error message is never worth failing a request over.
    return null;
  }
}

/** The wording, kept in one place so 98 routes cannot each invent their own. */
export function notFoundInCompanyMessage(tenantName: string | null, noun = 'job'): string {
  if (!tenantName) return `This ${noun} was not found.`;
  return (
    `This ${noun} was not found in ${tenantName}. You are signed in to ${tenantName} — ` +
    `if it belongs to a different company, sign out and sign back in using that company's code.`
  );
}

/**
 * The 404 to return when a record is missing OR belongs to another tenant.
 * Deliberately the same answer for both — see the note at the top of this file.
 */
export async function notFoundInCompany(
  tenantId: string | null | undefined,
  noun = 'job'
): Promise<NextResponse> {
  const name = await tenantDisplayName(tenantId);
  return NextResponse.json(
    {
      error: notFoundInCompanyMessage(name, noun),
      // Lets a page render a "switch company" affordance without parsing prose.
      code: 'not_in_your_company',
      company: name,
    },
    { status: 404 }
  );
}

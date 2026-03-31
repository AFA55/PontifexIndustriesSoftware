/**
 * Consent recording helpers
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

export type ConsentType = 'privacy_policy' | 'terms_of_service' | 'esign_consent' | 'gps_tracking';

interface RecordConsentParams {
  userId: string;
  consentType: ConsentType;
  documentVersion: string;
  granted?: boolean;
  context?: string;
  contextId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Fire-and-forget consent recording — never blocks the caller
 */
export function recordConsent(params: RecordConsentParams): void {
  Promise.resolve(
    supabaseAdmin.from('consent_records').insert({
      user_id: params.userId,
      consent_type: params.consentType,
      document_version: params.documentVersion,
      granted: params.granted ?? true,
      context: params.context || null,
      context_id: params.contextId || null,
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
    })
  ).then(({ error }) => {
    if (error) console.error(`Error recording ${params.consentType} consent:`, error);
  }).catch(() => {});
}

/**
 * Record GPS consent and update profile for quick lookup
 */
export async function recordGpsConsent(
  userId: string,
  version: string,
  ipAddress?: string,
  userAgent?: string
): Promise<boolean> {
  // Record consent event
  const { error: consentError } = await supabaseAdmin
    .from('consent_records')
    .insert({
      user_id: userId,
      consent_type: 'gps_tracking',
      document_version: version,
      granted: true,
      context: 'onboarding',
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });

  if (consentError) {
    console.error('Error recording GPS consent:', consentError);
    return false;
  }

  // Update profile for quick lookup
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      gps_consent_at: new Date().toISOString(),
      gps_consent_version: version,
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Error updating profile GPS consent:', profileError);
  }

  return true;
}

/**
 * Check if user has GPS consent (quick check via profile)
 */
export async function checkGpsConsent(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('gps_consent_at')
    .eq('id', userId)
    .single();

  if (error || !data) return false;
  return !!data.gps_consent_at;
}

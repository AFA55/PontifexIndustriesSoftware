export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/command-center/tts — Artifex's voice (ElevenLabs).
 *
 * Streams ElevenLabs TTS audio for an assistant reply so the Command Center
 * can SPEAK. The API key lives server-side only (ELEVENLABS_API_KEY env —
 * founder pastes into Vercel); the client never sees it. Voice defaults to a
 * stock ElevenLabs voice; override with ELEVENLABS_VOICE_ID.
 *
 * Fails soft: 503 { error: 'Voice not configured' } when the key is absent —
 * the UI hides/disables voice controls on that signal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { COMMAND_CENTER_ROLES } from '@/lib/rbac';

// "Adam" — a clear, deep stock voice; good Jarvis-adjacent default.
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
const MAX_TTS_CHARS = 2_500;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!COMMAND_CENTER_ROLES.includes(auth.role ?? '')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Voice not configured' }, { status: 503 });
  }

  let text = '';
  try {
    const body = await request.json();
    text = typeof body?.text === 'string' ? body.text.trim() : '';
  } catch {
    /* fall through to the empty-text check */
  }
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  // Strip markdown artifacts that read badly aloud, and cap length/cost.
  const speakable = text
    .replace(/```[\s\S]*?```/g, ' code block omitted. ')
    .replace(/[*_#`>|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TTS_CHARS);

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: speakable,
          model_id: 'eleven_turbo_v2_5', // low-latency tier — right for a live assistant
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      console.error('[tts] ElevenLabs error', res.status, detail.slice(0, 200));
      return NextResponse.json({ error: 'Voice generation failed' }, { status: 502 });
    }

    return new Response(res.body, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[tts] fetch failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Voice generation failed' }, { status: 502 });
  }
}

/**
 * Native on-device speech recognition for voice equipment checkout.
 *
 * The Pontifex app is a remote-URL Capacitor webview loading the same bundle
 * as the website. The browser's `SpeechRecognition`/`webkitSpeechRecognition`
 * Web API does NOT work inside the iOS Capacitor WKWebView (returns a
 * "service not allowed" error — confirmed dead end, see ARTIFEX_PLAN.md
 * "iOS voice input (VERIFIED)"). The existing WEB voice-checkout flow in
 * app/dashboard/admin/inventory-control/page.tsx (VoiceMic component) uses
 * that Web Speech API and is correctly scoped to browsers only.
 *
 * This module is the NATIVE counterpart: it bridges to the on-device speech
 * recognizer (iOS `SFSpeechRecognizer` / Android `SpeechRecognizer`) via the
 * `@capgo/capacitor-speech-recognition` plugin, ONLY when running inside the
 * native shell. On the website (and SSR) every function is a safe no-op —
 * the plugin is dynamically imported so it's never bundled into the web build.
 * Mirrors the exact pattern used by lib/biometric.ts (isNativeApp() guard +
 * dynamic import + graceful no-op / try-catch on missing plugin).
 *
 * API shape (verified against @capgo/capacitor-speech-recognition v8.1.8
 * definitions.d.ts): `start()` resolves immediately when `partialResults:
 * true` and does NOT return the final transcript; `stop()` returns
 * `Promise<void>`. The authoritative final text is read via
 * `getLastPartialResult()` right after stop() resolves, with the last
 * `partialResults` event text kept as a fallback in case the native side
 * has already cleared its cache by the time we ask.
 *
 * Flow used by components/equipment/NativeVoiceCheckout.tsx:
 *   1. requestSpeechPermission() once (first use) — mic + speech-recognition.
 *   2. startListening(onPartialResult) — begins on-device transcription;
 *      partial results stream back so the UI can show live text while the
 *      user talks.
 *   3. stopListening() — stops the recognizer and returns the final transcript.
 *   4. The caller (NativeVoiceCheckout) sends the final transcript text to
 *      POST /api/admin/equipment-checkouts/voice-parse-multi for LLM parsing.
 *
 * This module does NOT touch the manual/typed checkout path — it only ever
 * produces a raw transcript string. Structured parsing + confirmation happen
 * downstream (see voice-parse-multi route + NativeVoiceCheckout confirm step).
 */
import { isNativeApp } from './is-native';

/* eslint-disable @typescript-eslint/no-explicit-any */
type PluginListenerHandle = { remove: () => void | Promise<void> };

let cachedPlugin: any | null | undefined; // undefined = not yet resolved, null = unavailable

async function getPlugin(): Promise<any | null> {
  if (!isNativeApp()) return null;
  if (cachedPlugin !== undefined) return cachedPlugin;
  try {
    const mod = await import('@capgo/capacitor-speech-recognition');
    cachedPlugin = (mod as any).SpeechRecognition ?? null;
  } catch {
    cachedPlugin = null; // plugin not present in this build (older app) — degrade gracefully
  }
  return cachedPlugin;
}

export interface NativeSpeechAvailability {
  /** Running inside the native iOS/Android Capacitor shell? */
  nativeShell: boolean;
  /** Was the native speech-recognition plugin resolvable in this build? */
  pluginPresent: boolean;
  /** Is on-device speech recognition available on this device/OS? */
  available: boolean;
}

/** Non-throwing snapshot of native speech availability. Native-only; safe everywhere. */
export async function nativeSpeechAvailability(): Promise<NativeSpeechAvailability> {
  const nativeShell = isNativeApp();
  const plugin = await getPlugin();
  const pluginPresent = !!plugin;
  let available = false;
  if (plugin) {
    try {
      const res = await plugin.available();
      available = !!res?.available;
    } catch {
      available = false;
    }
  }
  return { nativeShell, pluginPresent, available };
}

/**
 * Request mic + speech-recognition permission. Returns true if granted.
 * No-op (returns false) on web/SSR or if the plugin is absent.
 */
export async function requestSpeechPermission(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    const res = await plugin.requestPermissions();
    return res?.speechRecognition === 'granted';
  } catch {
    return false;
  }
}

export interface StartListeningOptions {
  /** Called with the running partial transcript as the user talks (best-effort UX only). */
  onPartialResult?: (partialText: string) => void;
  /** BCP-47 language code. Defaults to 'en-US'. */
  language?: string;
}

let partialListener: PluginListenerHandle | null = null;
let lastPartialText = '';

async function cleanupPartialListener() {
  try { await partialListener?.remove(); } catch { /* noop */ }
  partialListener = null;
}

/**
 * Begin native on-device speech recognition. Resolves true once listening has
 * actually started — callers should show a "listening…" state after this
 * resolves. False means the plugin is unavailable (web, older build, or
 * device/permission failure) and the caller should fall back gracefully
 * (e.g. show a manual-entry option).
 */
export async function startListening(opts: StartListeningOptions = {}): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;

  lastPartialText = '';
  await cleanupPartialListener();

  try {
    partialListener = await plugin.addListener('partialResults', (data: { matches?: string[] }) => {
      const text = data?.matches?.[0];
      if (typeof text === 'string' && text.length > 0) {
        lastPartialText = text;
        opts.onPartialResult?.(text);
      }
    });
    // start() resolves immediately when partialResults=true; the useful
    // transcript arrives via the listener above and via getLastPartialResult()
    // after stop().
    await plugin.start({
      language: opts.language || 'en-US',
      maxResults: 1,
      partialResults: true,
      popup: false, // no native OS overlay UI — we render our own listening state
    });
    return true;
  } catch {
    await cleanupPartialListener();
    return false;
  }
}

/**
 * Stop listening and return the final transcript, or null if nothing was
 * captured / plugin unavailable / cancelled.
 */
export async function stopListening(): Promise<string | null> {
  const plugin = await getPlugin();
  if (!plugin) { await cleanupPartialListener(); return null; }
  try {
    await plugin.stop();
    // Prefer the native "last cached partial result" (most authoritative,
    // reflects any final-pass cleanup the recognizer did), fall back to the
    // last partialResults event we captured while listening.
    let text = lastPartialText;
    try {
      const last = await plugin.getLastPartialResult();
      if (last?.available && typeof last.text === 'string' && last.text.trim()) {
        text = last.text;
      }
    } catch { /* fall back to lastPartialText */ }
    await cleanupPartialListener();
    text = (text || '').trim();
    return text.length > 0 ? text : null;
  } catch {
    await cleanupPartialListener();
    return null;
  }
}

/** Cancel listening without returning a result (user backed out). No-op on web. */
export async function cancelListening(): Promise<void> {
  const plugin = await getPlugin();
  await cleanupPartialListener();
  if (!plugin) return;
  try { await plugin.forceStop(); } catch { /* noop */ }
}

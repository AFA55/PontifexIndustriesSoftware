/**
 * TELEGRAM — the alert channel the founder actually reads.
 *
 * FOUNDER (Aug 16): "I would like to add some form of logging and monitoring…
 * I remember telling you to have something within the Pontifex hub, but I don't
 * access that every day and I also don't get notifications. I feel like adding
 * Telegram can help."
 *
 * That is the correct diagnosis. The platform already writes
 * `platform_health_alerts` and `system_health_log` — 222 rows of them — and
 * NOTHING reads either. An alert nobody sees is not monitoring, it is
 * bookkeeping. The audit measured the result: a feature broken for two months,
 * another failing for twelve days, and a three-minute outage that nobody would
 * ever have known about.
 *
 * DESIGN RULES, learned from the failures already in this codebase:
 *
 *  1. NEVER let alerting break the thing it is watching. Every send is
 *     fire-and-forget with a hard timeout. An alert that throws inside an error
 *     handler turns a small fault into an outage.
 *  2. DEDUPE, or the channel gets muted. One error repeating 64 times must
 *     arrive once, not 64 times — the fastest way to make the founder ignore
 *     Telegram is to flood it. Handled by the caller via `reminder_log`-style
 *     keys; this module exposes `alertFingerprint` to make that easy.
 *  3. SAY WHAT TO DO. An alert with no next action is noise. Messages carry the
 *     path, the count, and a link.
 *  4. NEVER put secrets or customer PII in a chat message. Job numbers and
 *     counts, not customer contact details.
 */

const TELEGRAM_API = 'https://api.telegram.org';
/** Alerting must never hold a request open. */
const SEND_TIMEOUT_MS = 4000;

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export function telegramConfigFromEnv(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID?.trim();
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/**
 * Telegram's MarkdownV2 requires escaping a specific set of characters
 * ANYWHERE they appear, or the API rejects the whole message with a 400 — which
 * would mean the alert silently never arrives. Error text is full of brackets,
 * dots and dashes, so this is not optional.
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

/**
 * Escaping INSIDE a `code` span follows a different rule, and getting it wrong
 * is a silent failure: Telegram rejects the whole message with a 400 and the
 * alert simply never arrives.
 *
 * Per Telegram's MarkdownV2 spec, inside `code` and `pre` entities only the
 * backtick and the backslash may be escaped — escaping anything else there is
 * invalid. The first version of formatAlert ran the full escape set over the
 * `source` field and then wrapped it in backticks, so any source containing a
 * dot, dash or underscore — i.e. every route path this thing reports on —
 * produced an invalid message.
 */
export function escapeCodeSpan(text: string): string {
  return text.replace(/[`\\]/g, (c) => `\\${c}`);
}

export type AlertLevel = 'critical' | 'error' | 'warning' | 'info';

const LEVEL_ICON: Record<AlertLevel, string> = {
  critical: '🚨',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

export interface AlertInput {
  level: AlertLevel;
  /** Short, specific. "Clock-in failing for 3 operators", not "Error". */
  title: string;
  /** What is happening, in one or two sentences a non-engineer can act on. */
  detail: string;
  /** Where — a route, a cron name, a page. */
  source?: string;
  /** How many times this has happened in the window, if known. */
  count?: number;
  /** A link that takes the founder straight to the thing. */
  url?: string;
}

/**
 * A stable key for "this is the same problem again", so a fault repeating all
 * afternoon produces one message rather than a stream. Deliberately excludes
 * anything variable (ids, timestamps, counts).
 */
export function alertFingerprint(input: Pick<AlertInput, 'level' | 'title' | 'source'>): string {
  return [input.level, input.source ?? 'unknown', input.title]
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 180);
}

/** The message body. Pure, so the wording is testable without a network. */
export function formatAlert(input: AlertInput): string {
  const lines: string[] = [
    `${LEVEL_ICON[input.level]} *${escapeMarkdownV2(input.title)}*`,
    '',
    escapeMarkdownV2(input.detail),
  ];
  // escapeCodeSpan, NOT escapeMarkdownV2 — see the note on that function. Every
  // route path contains dots and slashes, so the full escape set inside these
  // backticks made Telegram 400 the entire message.
  if (input.source) lines.push('', `📍 \`${escapeCodeSpan(input.source)}\``);
  if (typeof input.count === 'number' && input.count > 1) {
    lines.push(`🔁 ${input.count} times`);
  }
  if (input.url) lines.push('', escapeMarkdownV2(input.url));
  return lines.join('\n');
}

/**
 * Send one message. Resolves `false` rather than throwing — callers are error
 * handlers and cron jobs, and an alerting failure must never become the
 * headline fault.
 */
export async function sendTelegram(
  config: TelegramConfig,
  text: string
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Logged, never thrown. A 400 here usually means an escaping bug, and it
      // would otherwise be invisible — the alert simply never arrives.
      console.error('[telegram] send failed', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[telegram] send error', (e as Error).message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience: format + send, no-op when Telegram is not configured. */
export async function alert(input: AlertInput): Promise<boolean> {
  const config = telegramConfigFromEnv();
  if (!config) {
    // SAY SO. The first version returned false in silence, which produced a
    // genuinely confusing hour: a test alert reached the server, logged
    // normally, and vanished — with no way to tell "Telegram refused it" from
    // "Telegram was never configured". Those need completely different fixes.
    console.warn(
      '[telegram] alert NOT sent — not configured',
      JSON.stringify({
        has_bot_token: !!process.env.TELEGRAM_BOT_TOKEN,
        has_chat_id: !!process.env.TELEGRAM_ALERT_CHAT_ID,
        title: input.title,
      })
    );
    return false;
  }
  return sendTelegram(config, formatAlert(input));
}

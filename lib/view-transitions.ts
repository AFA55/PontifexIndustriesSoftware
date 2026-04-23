/**
 * Thin wrapper around the View Transitions API.
 *
 * Progressive enhancement: in supporting browsers (Chromium-based) this runs
 * the callback inside `document.startViewTransition`, giving a free crossfade
 * between DOM states. In unsupported browsers (Safari/Firefox at time of
 * writing) it just invokes the callback synchronously — users still get the
 * normal skeleton -> content swap.
 *
 * Never throws. Never blocks. Never requires a polyfill.
 */

type StartViewTransition = (cb: () => void | Promise<void>) => {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
};

type DocumentWithVT = Document & {
  startViewTransition?: StartViewTransition;
};

export function supportsViewTransitions(): boolean {
  if (typeof document === 'undefined') return false;
  return typeof (document as DocumentWithVT).startViewTransition === 'function';
}

/**
 * Run a DOM-mutating callback inside a view transition if supported.
 * Returns a promise that resolves once the transition (or the callback, if
 * unsupported) completes.
 */
export function withViewTransition(callback: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransitions()) {
    const out = callback();
    return Promise.resolve(out).then(() => undefined);
  }
  const doc = document as DocumentWithVT;
  try {
    const transition = doc.startViewTransition!(callback);
    return transition.finished.catch(() => undefined);
  } catch {
    // Fail open — never block the UI on a transition error.
    const out = callback();
    return Promise.resolve(out).then(() => undefined);
  }
}

/**
 * PDF viewing that NEVER ejects the Capacitor webview (founder Jul 21:
 * "everything stays in the app"). window.open inside Capacitor hands the
 * page to Safari/Chrome — the two confirmed operator kick-outs were the
 * timecard PDF button and the print-dispatch-ticket button doing exactly
 * that. On native we render the PDF in a full-screen in-app overlay
 * (WKWebView renders PDFs in iframes); on web we keep window.open.
 */
import { isNativeApp } from '@/lib/is-native';

/** Show a PDF blob without leaving the app (native) / new tab (web). */
export function viewPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  if (!isNativeApp()) {
    window.open(url, '_blank');
    return;
  }
  // Native: full-screen overlay with an in-webview PDF frame + close bar.
  const overlay = document.createElement('div');
  overlay.setAttribute('data-pdf-overlay', '1');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;background:#0b0618;display:flex;flex-direction:column;';
  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex;justify-content:flex-end;align-items:center;padding:calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px;background:#0b0618;';
  const close = document.createElement('button');
  close.textContent = 'Close ✕';
  close.style.cssText =
    'min-height:44px;padding:0 16px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-size:15px;font-weight:600;';
  close.onclick = () => {
    overlay.remove();
    URL.revokeObjectURL(url);
  };
  const frame = document.createElement('iframe');
  frame.src = url;
  frame.style.cssText = 'flex:1;border:0;width:100%;background:#fff;';
  bar.appendChild(close);
  overlay.appendChild(bar);
  overlay.appendChild(frame);
  document.body.appendChild(overlay);
}

/** Fetch an authenticated PDF endpoint and show it in-app. */
export async function viewPdfUrl(url: string, accessToken: string): Promise<void> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Failed to load PDF');
  viewPdfBlob(await res.blob());
}

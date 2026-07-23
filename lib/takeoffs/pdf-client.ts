'use client';

/**
 * Takeoffs — client-side pdf.js helpers.
 *
 * The CLIENT does the PDF heavy lifting (Vercel routes can't take big
 * bodies and server-side rasterization is expensive): load the document,
 * read per-page dimensions + the text layer, and run the sheet-number
 * heuristics (Procore pattern: bottom-right title block, largest matching
 * text run wins). Everything returned in PDF page coordinates.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/** Lazy singleton — pdf.js + worker are only fetched on takeoff pages. */
export function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    // Legacy build: broader runtime compatibility (Turbopack dev + webpack
    // prod + WKWebView). The modern build's render pipeline stalled under
    // Turbopack dev (parse worked, paint never resolved — Jul 22).
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      // Static worker from public/ — bundler-independent (Turbopack dev +
      // webpack prod + Capacitor webview all resolve it identically).
      // KEEP IN SYNC: copy node_modules/pdfjs-dist/build/pdf.worker.min.mjs
      // into public/ whenever pdfjs-dist is upgraded.
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export async function loadPdf(source: string | ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfjs();
  const task = typeof source === 'string' ? pdfjs.getDocument({ url: source }) : pdfjs.getDocument({ data: source });
  return task.promise;
}

const SHEET_NUMBER_RE = /^([A-Z]{1,3})[-.]?\s?(\d{1,3}(?:\.\d{1,2})?[A-Za-z]?)$/;

const DISCIPLINE_MAP: Record<string, string> = {
  A: 'Architectural',
  S: 'Structural',
  C: 'Civil',
  E: 'Electrical',
  M: 'Mechanical',
  P: 'Plumbing',
  D: 'Demolition',
  G: 'General',
  T: 'Telecom',
  F: 'Fire Protection',
  L: 'Landscape',
};

export interface ParsedPage {
  page_number: number;
  width_pt: number;
  height_pt: number;
  rotation: number;
  user_unit: number;
  sheet_number: string | null;
  sheet_title: string | null;
  discipline: string | null;
  page_text: string;
}

/**
 * Extract dimensions + text + sheet metadata for one page.
 * Sheet number: text runs positioned in the bottom-right 25%x30% of the page
 * matching the sheet-number pattern, largest font size wins.
 */
export async function parsePage(pdf: PDFDocumentProxy, pageNumber: number): Promise<ParsedPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 }); // top-left origin, rotation applied
  const textContent = await page.getTextContent();

  type Run = { str: string; x: number; y: number; h: number };
  const runs: Run[] = [];
  for (const item of textContent.items as any[]) {
    if (!item.str || !item.str.trim()) continue;
    // transform = [a,b,c,d,e,f]; e/f = position in PDF units (bottom-left origin)
    const x = item.transform[4];
    const yBottomOrigin = item.transform[5];
    const y = viewport.height - yBottomOrigin; // normalize to top-left origin
    const h = Math.abs(item.transform[3]) || Math.abs(item.height) || 0;
    runs.push({ str: item.str.trim(), x, y, h });
  }

  // Reading-order-ish text for search + AI: sort by row bands then x.
  const sorted = [...runs].sort((a, b) => {
    const band = 8;
    const ra = Math.round(a.y / band);
    const rb = Math.round(b.y / band);
    return ra !== rb ? ra - rb : a.x - b.x;
  });
  const pageText = sorted.map((r) => r.str).join(' ').replace(/\s+/g, ' ').slice(0, 60000);

  // Sheet number: bottom-right region, pattern match, largest font wins.
  const regionX = viewport.width * 0.75;
  const regionY = viewport.height * 0.7;
  let sheetNumber: string | null = null;
  let sheetNumberRun: Run | null = null;
  let best = 0;
  for (const r of runs) {
    if (r.x < regionX || r.y < regionY) continue;
    const candidate = r.str.replace(/\s+/g, '');
    if (SHEET_NUMBER_RE.test(candidate) && r.h > best) {
      best = r.h;
      sheetNumber = candidate;
      sheetNumberRun = r;
    }
  }

  // Sheet title: largest non-number run near the sheet number's corner.
  let sheetTitle: string | null = null;
  if (sheetNumberRun) {
    let bestTitle = 0;
    for (const r of runs) {
      if (r.x < regionX * 0.9 || r.y < regionY * 0.85) continue;
      if (r === sheetNumberRun || r.str.length < 4 || r.str.length > 80) continue;
      if (SHEET_NUMBER_RE.test(r.str.replace(/\s+/g, ''))) continue;
      if (/^\d[\d\s./-]*$/.test(r.str)) continue; // pure numbers/dates
      if (r.h > bestTitle) {
        bestTitle = r.h;
        sheetTitle = r.str;
      }
    }
  }

  const discipline = sheetNumber ? DISCIPLINE_MAP[sheetNumber[0]] ?? null : null;

  return {
    page_number: pageNumber,
    width_pt: viewport.width,
    height_pt: viewport.height,
    rotation: viewport.rotation ?? 0,
    user_unit: (page as any).userUnit ?? 1,
    sheet_number: sheetNumber,
    sheet_title: sheetTitle,
    discipline,
    page_text: pageText,
  };
}

export async function parseAllPages(
  pdf: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void
): Promise<ParsedPage[]> {
  const out: ParsedPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    out.push(await parsePage(pdf, i));
    onProgress?.(i, pdf.numPages);
  }
  return out;
}

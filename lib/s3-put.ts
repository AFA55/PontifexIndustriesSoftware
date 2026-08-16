/**
 * PUT AN OBJECT INTO A BUCKET THE FOUNDER OWNS — S3 Signature V4, by hand.
 *
 * WHY THIS EXISTS. The founder, Aug 16: "we have built too much to lose it all
 * and we need to ensure the stability of our software application… maybe a 2nd
 * database, one that we control with our own servers, in case Supabase goes
 * down."
 *
 * The measured situation: the whole company is 41 MB and 5,532 rows, plus
 * 186 MB of signed PDFs and job photos in Supabase Storage. The existing backup
 * routine covers six tables out of 177, writes them back into the SAME Supabase
 * account, and — per an empty `backup_logs` — has never once run. So the actual
 * exposure is not "Supabase might be slow for an afternoon", it is "everything,
 * including every backup, lives inside one vendor account."
 *
 * A copy in storage the founder controls fixes that for a couple of dollars a
 * month. It needs exactly one thing from S3: PutObject.
 *
 * WHY NOT @aws-sdk/client-s3. It is a large dependency to carry into every
 * serverless bundle for a single verb, and this repo requires a tooling review
 * before adding one. SigV4 is a precisely specified algorithm; the signing-key
 * derivation below is verified in the tests against AWS's own published example
 * vector, so this is checkable rather than hopeful.
 *
 * Works against any S3-compatible store — Cloudflare R2, Backblaze B2, AWS S3,
 * Wasabi, MinIO. Nothing here is AWS-specific beyond the signature format.
 */

const ENC = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? ENC.encode(data) : data;
  // Copy into a fresh, exactly-sized ArrayBuffer. A Uint8Array view over a
  // larger pooled buffer (which Buffer.from often is in Node) would otherwise
  // hash the whole underlying buffer and silently produce a wrong digest.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return hex(await crypto.subtle.digest('SHA-256', copy.buffer));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const raw = key instanceof Uint8Array ? key.slice().buffer : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, ENC.encode(data));
}

/**
 * kSecret → kDate → kRegion → kService → kSigning.
 * Verified in the tests against AWS's documented example vector.
 */
export async function signingKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmac(ENC.encode(`AWS4${secretKey}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** `20260816T101530Z` and `20260816` from a Date. */
export function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Each path segment is URI-encoded, but the separating slashes are NOT — S3
 * treats `a/b.json` as a nested key, and encoding the slash would create an
 * object literally named "a%2Fb.json". Encoding must also cover the characters
 * encodeURIComponent leaves alone, or the signature will not match the server's.
 */
export function encodeS3Key(key: string): string {
  return key
    .split('/')
    .map((seg) =>
      encodeURIComponent(seg).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/');
}

export interface S3Target {
  /** e.g. https://<account>.r2.cloudflarestorage.com or https://s3.us-west-004.backblazeb2.com */
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Build the signed request without sending it — this is what the tests assert. */
export async function buildPutRequest(
  target: S3Target,
  key: string,
  body: Uint8Array,
  contentType: string,
  now: Date
): Promise<{ url: string; headers: Record<string, string> }> {
  const { amzDate, dateStamp } = amzDates(now);
  const host = new URL(target.endpoint).host;
  const canonicalUri = `/${encodeS3Key(target.bucket)}/${encodeS3Key(key)}`;
  const payloadHash = await sha256Hex(body);

  // Canonical headers must be lowercase, sorted, and match `signedHeaders`
  // exactly — any drift and the store rejects the signature.
  const headers: Record<string, string> = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames.map((n) => `${n}:${headers[n].trim()}\n`).join('');
  const signedHeaders = sortedNames.join(';');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${target.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const key4 = await signingKey(target.secretAccessKey, dateStamp, target.region, 's3');
  const signature = hex(await hmac(key4, stringToSign));

  return {
    url: `${target.endpoint.replace(/\/$/, '')}${canonicalUri}`,
    headers: {
      ...headers,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** PUT one object. Throws with the store's own message on failure. */
export async function putObject(
  target: S3Target,
  key: string,
  body: Uint8Array,
  contentType = 'application/octet-stream',
  now: Date = new Date()
): Promise<{ key: string; bytes: number }> {
  const { url, headers } = await buildPutRequest(target, key, body, contentType, now);
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    // Copy so the request body is a standalone buffer, never a view into a
    // larger pooled one (which would upload trailing garbage).
    body: new Uint8Array(body).slice(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`S3 PUT ${key} failed: ${res.status} ${res.statusText} ${detail.slice(0, 300)}`);
  }
  return { key, bytes: body.byteLength };
}

/**
 * The destination, from env. Returns null when it is not configured — the
 * caller must then say so out loud rather than report a successful backup,
 * which is the whole failure this replaces.
 */
export function backupTargetFromEnv(): S3Target | null {
  const endpoint = process.env.BACKUP_S3_ENDPOINT?.trim();
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  const region = process.env.BACKUP_S3_REGION?.trim() || 'auto';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, region, accessKeyId, secretAccessKey };
}

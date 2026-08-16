/**
 * @jest-environment node
 *
 * SigV4 is either exactly right or it does not work at all, so the parts that
 * can be checked against a published reference are checked against one.
 *
 * Runs under the NODE environment on purpose: this code runs in a serverless
 * function, and jsdom provides neither `TextEncoder` nor WebCrypto's
 * `crypto.subtle`. (The same jsdom gap is what makes lib/email.test.ts fail to
 * load — that one is unrelated to this file and predates it.)
 */

import { signingKey, amzDates, encodeS3Key, buildPutRequest, backupTargetFromEnv } from './s3-put';

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

describe('signingKey', () => {
  it('matches AWS’s own published example vector', async () => {
    // From the AWS Signature Version 4 documentation's worked example:
    //   secret  wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY
    //   date    20150830   region us-east-1   service iam
    // If this passes, the kSecret→kDate→kRegion→kService→kSigning chain and the
    // HMAC handling are correct, which is the part most implementations get
    // wrong.
    const key = await signingKey(
      'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      '20150830',
      'us-east-1',
      'iam'
    );
    expect(hex(key)).toBe('c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9');
  });

  it('derives a different key per day, region and service', async () => {
    const base = await signingKey('secret', '20260816', 'us-east-1', 's3');
    const otherDay = await signingKey('secret', '20260817', 'us-east-1', 's3');
    const otherRegion = await signingKey('secret', '20260816', 'us-west-2', 's3');
    const otherService = await signingKey('secret', '20260816', 'us-east-1', 'iam');
    const all = [base, otherDay, otherRegion, otherService].map(hex);
    expect(new Set(all).size).toBe(4);
  });
});

describe('amzDates', () => {
  it('formats the basic ISO8601 the signature requires', () => {
    const { amzDate, dateStamp } = amzDates(new Date('2026-08-16T10:15:30.123Z'));
    expect(amzDate).toBe('20260816T101530Z');
    expect(dateStamp).toBe('20260816');
  });
});

describe('encodeS3Key', () => {
  it('keeps path separators as separators', () => {
    // Encoding the slash would create one object literally named
    // "pontifex%2F2026-08-16%2Fdb.ndjson" instead of a folder path.
    expect(encodeS3Key('pontifex/2026-08-16/db.ndjson')).toBe('pontifex/2026-08-16/db.ndjson');
  });

  it('encodes spaces and characters encodeURIComponent leaves alone', () => {
    expect(encodeS3Key('job photos/site (1).jpg')).toBe('job%20photos/site%20%281%29.jpg');
    expect(encodeS3Key("o'brien!.pdf")).toBe('o%27brien%21.pdf');
  });
});

describe('buildPutRequest', () => {
  const target = {
    endpoint: 'https://example.r2.cloudflarestorage.com',
    bucket: 'pontifex-backups',
    region: 'auto',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  };
  const body = new TextEncoder().encode('{"hello":"world"}');
  const now = new Date('2026-08-16T10:15:30.000Z');

  it('addresses the object at bucket/key on the endpoint host', async () => {
    const { url } = await buildPutRequest(target, 'db/2026-08-16.ndjson', body, 'application/x-ndjson', now);
    expect(url).toBe(
      'https://example.r2.cloudflarestorage.com/pontifex-backups/db/2026-08-16.ndjson'
    );
  });

  it('signs the exact headers it declares in SignedHeaders', async () => {
    const { headers } = await buildPutRequest(target, 'k.json', body, 'application/json', now);
    expect(headers.Authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date'
    );
    // Every signed header must actually be sent, or the store recomputes a
    // different canonical request and rejects the signature.
    expect(headers['content-type']).toBe('application/json');
    expect(headers.host).toBe('example.r2.cloudflarestorage.com');
    expect(headers['x-amz-date']).toBe('20260816T101530Z');
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries the credential scope for the right day, region and service', async () => {
    const { headers } = await buildPutRequest(target, 'k.json', body, 'application/json', now);
    expect(headers.Authorization).toContain('Credential=AKIDEXAMPLE/20260816/auto/s3/aws4_request');
    expect(headers.Authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it('produces a different signature when the body changes', async () => {
    // The payload hash is signed, so a corrupted or truncated upload cannot
    // pass with a signature computed for the intended content.
    const a = await buildPutRequest(target, 'k.json', body, 'application/json', now);
    const b = await buildPutRequest(
      target,
      'k.json',
      new TextEncoder().encode('{"hello":"there"}'),
      'application/json',
      now
    );
    expect(a.headers.Authorization).not.toBe(b.headers.Authorization);
  });

  it('hashes only the bytes given, even from a pooled buffer', async () => {
    // Buffer.from(...) in Node often returns a view into a larger shared pool.
    // Hashing the underlying buffer instead of the view is a real and very
    // confusing failure — the signature would not match what was uploaded.
    const pooled = Buffer.from('{"hello":"world"}');
    const fromPooled = await buildPutRequest(target, 'k.json', pooled, 'application/json', now);
    const fromExact = await buildPutRequest(target, 'k.json', body, 'application/json', now);
    expect(fromPooled.headers['x-amz-content-sha256']).toBe(
      fromExact.headers['x-amz-content-sha256']
    );
  });
});

describe('backupTargetFromEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns null when the destination is not configured', () => {
    delete process.env.BACKUP_S3_ENDPOINT;
    delete process.env.BACKUP_S3_BUCKET;
    delete process.env.BACKUP_S3_ACCESS_KEY_ID;
    delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    // Null must stay null: the caller has to SAY the backup is unconfigured.
    // Reporting a successful backup that went nowhere is the exact failure this
    // whole module replaces.
    expect(backupTargetFromEnv()).toBeNull();
  });

  it('returns null when only some credentials are present', () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://x.r2.cloudflarestorage.com';
    process.env.BACKUP_S3_BUCKET = 'b';
    delete process.env.BACKUP_S3_ACCESS_KEY_ID;
    delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    expect(backupTargetFromEnv()).toBeNull();
  });

  it('defaults region to "auto" for R2-style endpoints', () => {
    process.env.BACKUP_S3_ENDPOINT = 'https://x.r2.cloudflarestorage.com';
    process.env.BACKUP_S3_BUCKET = 'b';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'id';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
    delete process.env.BACKUP_S3_REGION;
    expect(backupTargetFromEnv()?.region).toBe('auto');
  });
});

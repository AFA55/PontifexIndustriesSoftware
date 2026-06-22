// Upload an .aab to Google Play and roll it out to a track via the Android Publisher API.
// No deps — mints an OAuth2 token from a service-account key (RS256 JWT, node:crypto),
// then runs the edits flow: insert → upload bundle → set track → commit.
//
// Prereqs (one-time):
//   1. A Google Cloud service account with a JSON key.
//   2. Android Publisher API enabled on that SA's project.
//   3. The SA invited in Play Console → Users and permissions with release rights.
//
// Usage:
//   node scripts/play-upload.mjs \
//     --key /path/to/service-account.json \
//     --aab android/app/build/outputs/bundle/release/app-release.aab \
//     [--package com.pontifexindustries.platform] \
//     [--track production] \
//     [--notes "<release notes>"] \
//     [--status completed] [--rollout 1]
//
// Env fallbacks: PLAY_SA_KEY (key path or raw JSON), PLAY_AAB, PLAY_PACKAGE, PLAY_TRACK.

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

// ── args ────────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const KEY = arg('key', process.env.PLAY_SA_KEY);
const AAB = arg('aab', process.env.PLAY_AAB || 'android/app/build/outputs/bundle/release/app-release.aab');
const PKG = arg('package', process.env.PLAY_PACKAGE || 'com.pontifexindustries.platform');
const TRACK = arg('track', process.env.PLAY_TRACK || 'production');
const STATUS = arg('status', 'completed'); // completed | inProgress | draft | halted
const ROLLOUT = Number(arg('rollout', '1')); // userFraction when STATUS=inProgress
const NOTES = arg('notes', 'Bug fixes and improvements.');

if (!KEY) { console.error('ERROR: provide --key <service-account.json> (or PLAY_SA_KEY).'); process.exit(1); }

// Accept a path to JSON, raw JSON, or base64 JSON.
function loadSA(v) {
  let raw = v.trim();
  if (!raw.startsWith('{')) {
    try { raw = readFileSync(raw, 'utf8'); }
    catch { raw = Buffer.from(v, 'base64').toString('utf8'); }
  }
  const sa = JSON.parse(raw);
  if (!sa.client_email || !sa.private_key) throw new Error('key JSON missing client_email/private_key');
  sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
  return sa;
}

const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const input = `${header}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key);
  const jwt = `${input}.${b64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error('token exchange failed: ' + JSON.stringify(j));
  return j.access_token;
}

const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';

async function api(tok, method, url, body, isJson = true) {
  let headers = { Authorization: `Bearer ${tok}` };
  let payload = body;
  if (isJson && body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  else if (!isJson && body) { headers['Content-Type'] = 'application/octet-stream'; } // .aab bytes
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text}`);
  return json;
}

(async () => {
  const sa = loadSA(KEY);
  console.log(`SA: ${sa.client_email}\nPackage: ${PKG}\nTrack: ${TRACK}\nAAB: ${AAB}`);
  const tok = await token(sa);
  console.log('✓ OAuth token acquired');

  const edit = await api(tok, 'POST', `${BASE}/applications/${PKG}/edits`);
  const editId = edit.id;
  console.log('✓ edit created:', editId);

  const aabBytes = readFileSync(AAB);
  const up = await api(
    tok, 'POST',
    `${UPLOAD}/applications/${PKG}/edits/${editId}/bundles?uploadType=media`,
    aabBytes, false,
  );
  const versionCode = up.versionCode;
  console.log(`✓ bundle uploaded — versionCode ${versionCode} (sha1 ${up.sha1 || '?'})`);

  const release = {
    versionCodes: [String(versionCode)],
    status: STATUS,
    releaseNotes: [{ language: 'en-US', text: NOTES }],
  };
  if (STATUS === 'inProgress' && ROLLOUT < 1) release.userFraction = ROLLOUT;
  await api(tok, 'PUT', `${BASE}/applications/${PKG}/edits/${editId}/tracks/${TRACK}`, {
    track: TRACK, releases: [release],
  });
  console.log(`✓ track "${TRACK}" set to versionCode ${versionCode} (${STATUS})`);

  const committed = await api(tok, 'POST', `${BASE}/applications/${PKG}/edits/${editId}:commit`);
  console.log('✓ committed edit:', committed.id || editId);
  console.log('\n🚀 Done. The release is submitted; Google review applies as usual.');
})().catch((e) => { console.error('\n✗ FAILED:', e.message); process.exit(1); });

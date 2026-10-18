/**
 * sync.js — optional: keeps your progress the same on every device you sign in on.
 *
 * Only active when config.js has Supabase details. Otherwise every function here does nothing
 * and progress stays on the device, as before.
 *
 * How it works:
 *   - Sign in: you type your email and Supabase emails you a sign-in link. No password.
 *     Clicking the link brings you back to the site, signed in (finishSignInFromLink).
 *     If the email templates also contain {{ .Token }}, you can type the code instead, which is
 *     handier on phones because links open in the browser, not the installed app.
 *   - Each user has one row in the `progress` table (see supabase/schema.sql) holding the same
 *     data as store.js keeps in localStorage.
 *   - To sync, the app downloads that row, merges it with this device's progress, saves the
 *     result on the device, and uploads it if it changed. Merging is the same on every device:
 *       cards        the most recently studied copy wins, unless it was deleted after that
 *       activity     the higher answer count for each day
 *       match times  the faster time
 *     Deletions (resets, edited cards) are remembered in `deleted` so they reach other devices.
 *   - It syncs when the app opens, a few seconds after you answer cards, when you leave the app,
 *     and when you come back online. Studying offline is fine: it catches up later.
 *
 * Supabase is used through its plain web API with fetch(), so there's nothing to install.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { getSyncData, setSyncData, onProgressChange } from './store.js';

const SESSION_KEY = 'studydeck:session';
const SAVE_DELAY_MS = 5000; // wait this long after the last answer before uploading
const KEEP_DELETIONS_DAYS = 365;

export const syncEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const BASE = SUPABASE_URL.replace(/\/+$/, '');

// ---------- the signed-in session (saved on this device) ----------

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked: you'll just need to sign in again next time */
  }
}

let lastError = '';
let syncing = false;

/** What the Stats page shows: { signedIn, email, lastSynced, syncing, error }. */
export function syncStatus() {
  const session = syncEnabled ? loadSession() : null;
  return {
    signedIn: Boolean(session),
    email: session?.email || '',
    lastSynced: session?.lastSynced || null,
    syncing,
    error: lastError,
  };
}

// ---------- talking to Supabase ----------

async function api(path, { method = 'GET', body, token, prefer } = {}) {
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(navigator.onLine ? "Couldn't reach the sync server." : "You're offline. Progress will sync when you're back online.");
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.msg || data?.error_description || data?.message || `Sync server error (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function sessionFrom(data, email, previous = {}) {
  return {
    ...previous,
    email: data.user?.email || email || previous.email,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  };
}

/** A valid access token, refreshing it first if it has (nearly) expired. */
async function accessToken() {
  const session = loadSession();
  if (!session) throw new Error('Not signed in.');
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  try {
    const data = await api('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    saveSession(sessionFrom(data, session.email, session));
    return data.access_token;
  } catch (err) {
    if (err.status === 400 || err.status === 401) {
      saveSession(null); // signed out elsewhere, or away too long: sign in again
      notify(false);
      throw new Error('You were signed out. Sign in again to keep syncing.');
    }
    throw err;
  }
}

// ---------- signing in and out ----------

/** Emails a sign-in link (and code, if the email template has one). Creates the account the first time. */
export async function sendCode(email) {
  // Where the link in the email leads: this site's home page. It must be listed under
  // Authentication -> URL Configuration in Supabase, or Supabase uses its "Site URL" instead.
  const backTo = encodeURIComponent(location.origin + location.pathname);
  await api(`/auth/v1/otp?redirect_to=${backTo}`, { method: 'POST', body: { email, create_user: true } });
}

/**
 * Finishes signing in when someone opens the link from the sign-in email. Supabase sends them
 * back to the site with the session in the address: #access_token=…&refresh_token=…
 * Call before the first page is drawn. Returns a message to show, or '' if this wasn't a sign-in link.
 */
export function finishSignInFromLink() {
  if (!syncEnabled) return '';
  const params = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  if (!params.has('access_token') && !params.has('error_description')) return '';

  // Take the tokens out of the address bar (and history) straight away, and show the Stats page.
  history.replaceState(null, '', `${location.pathname}${location.search}#/stats`);
  if (!params.has('access_token')) {
    return params.get('error_code') === 'otp_expired'
      ? 'That sign-in link has expired or was already used. Ask for a new one below.'
      : `Couldn't sign in: ${params.get('error_description')}`;
  }
  const token = params.get('access_token');
  saveSession(
    sessionFrom(
      {
        access_token: token,
        refresh_token: params.get('refresh_token'),
        expires_at: Number(params.get('expires_at')) || 0,
        expires_in: Number(params.get('expires_in')) || 3600,
      },
      emailFromToken(token)
    )
  );
  lastError = '';
  return 'Signed in. Your progress now syncs.';
}

/** The email address inside a Supabase access token (a JWT: header.payload.signature). */
function emailFromToken(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(payload)))).email || '';
  } catch {
    return '';
  }
}

/** Checks the emailed code, then syncs straight away (merging this device's progress in). */
export async function verifyCode(email, code) {
  const data = await api('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: code } });
  saveSession(sessionFrom(data, email));
  lastError = '';
  await syncNow().catch(() => {}); // any problem shows up in syncStatus().error
}

/** Signs out on this device. Progress already on the device stays here. */
export function signOut() {
  const session = loadSession();
  saveSession(null);
  lastError = '';
  clearTimeout(timer);
  if (session) api('/auth/v1/logout', { method: 'POST', token: session.access_token }).catch(() => {});
  notify(false);
}

// ---------- syncing ----------

let running = null;
let runAgain = false;

/**
 * Syncs now. Resolves to true if this device's progress changed (new data from another device).
 * Rejects with a friendly message if it couldn't sync.
 */
export function syncNow() {
  if (!syncEnabled || !loadSession()) return Promise.resolve(false);
  if (running) {
    runAgain = true; // something changed mid-sync: go round once more when this one finishes
    return running;
  }
  syncing = true;
  running = (async () => {
    let changed = false;
    try {
      do {
        runAgain = false;
        changed = (await syncOnce()) || changed;
      } while (runAgain);
      lastError = '';
      return changed;
    } catch (err) {
      lastError = err.message;
      throw err;
    } finally {
      running = null;
      syncing = false;
      notify(changed);
    }
  })();
  return running;
}

async function syncOnce() {
  let changed = false;
  // A few tries, in case another device saves at the very same moment.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = await accessToken();
    const [remote] = await api('/rest/v1/progress?select=data,rev', { token });
    const local = getSyncData();
    const merged = mergeData(local, remote?.data || {});

    if (!sameData(merged, local)) {
      setSyncData(merged);
      changed = true;
    }
    if (remote && sameData(merged, remote.data)) return markSynced(changed);

    // Only save if nobody else has saved since we downloaded (rev is unchanged).
    const saved = remote
      ? await api(`/rest/v1/progress?rev=eq.${remote.rev}`, {
          method: 'PATCH',
          token,
          prefer: 'return=representation',
          body: { data: merged, rev: remote.rev + 1 },
        })
      : await api('/rest/v1/progress', { method: 'POST', token, prefer: 'return=representation', body: { data: merged } }).catch(
          (err) => {
            if (err.status === 409) return []; // another device created it first
            throw err;
          }
        );
    if (saved?.length) return markSynced(changed);
  }
  throw new Error("Couldn't save your progress online. It will try again soon.");
}

function markSynced(changed) {
  const session = loadSession();
  if (session) saveSession({ ...session, lastSynced: new Date().toISOString() });
  return changed;
}

// ---------- merging two copies of the progress ----------

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const later = (a, b) => (String(a || '') > String(b || '') ? String(a || '') : String(b || ''));

/** Merges two progress copies. Gives the same result whichever way round they are passed. */
export function mergeData(a, b) {
  const cutoff = new Date(Date.now() - KEEP_DELETIONS_DAYS * 864e5).toISOString();

  // When things were deleted: keep the latest time for each, and forget very old ones.
  const deleted = {};
  for (const source of [a, b]) {
    for (const [key, time] of Object.entries(asObject(source.deleted))) {
      if (typeof time !== 'string' || (key !== '*' && time < cutoff)) continue;
      deleted[key] = later(deleted[key], time);
    }
  }
  const resetAt = deleted['*'] || '';

  // Cards: the most recently studied copy, unless it was deleted (or everything was reset) after that.
  const progress = {};
  for (const source of [a, b]) {
    for (const [key, rec] of Object.entries(asObject(source.progress))) {
      if (!rec || typeof rec !== 'object' || typeof rec.box !== 'number') continue;
      const seen = String(rec.lastSeen || '');
      const deletedAt = later(deleted[key], resetAt);
      if (deletedAt && seen <= deletedAt) continue;
      const current = progress[key];
      const currentSeen = String(current?.lastSeen || '');
      if (!current || seen > currentSeen || (seen === currentSeen && stableJson(rec) > stableJson(current))) {
        progress[key] = rec;
      }
    }
  }

  // Activity and best times have no dates of their own, so a copy's values are skipped
  // if the other copy knows about a reset that this one hadn't heard of yet.
  const resetIn = (source, key) => later(asObject(source.deleted)[key], asObject(source.deleted)['*']);
  const activity = {};
  const match = {};
  for (const [source, other] of [
    [a, b],
    [b, a],
  ]) {
    if (resetIn(other, '*') <= resetIn(source, '*')) {
      for (const [day, count] of Object.entries(asObject(source.activity))) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number(count) > 0) activity[day] = Math.max(activity[day] || 0, Number(count));
      }
    }
    for (const [deckId, seconds] of Object.entries(asObject(source.match))) {
      if (typeof seconds !== 'number' || resetIn(other, `match:${deckId}`) > resetIn(source, `match:${deckId}`)) continue;
      if (match[deckId] == null || seconds < match[deckId]) match[deckId] = seconds;
    }
  }

  return { progress, activity, match, deleted };
}

/** JSON with object keys sorted, so two copies with the same content always compare equal. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const sameData = (a, b) => stableJson(a) === stableJson(b);

// ---------- when to sync ----------

let timer = null;
const listeners = new Set();

/** Calls `fn(changed)` after every sync, sign-in and sign-out. `changed` = this device got new progress. */
export function onSyncChange(fn) {
  listeners.add(fn);
}

function notify(changed) {
  listeners.forEach((fn) => fn(changed));
}

function syncSoon(delay = SAVE_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncNow().catch(() => {});
  }, delay);
}

/** Called once when the app starts. */
export function startSync() {
  if (!syncEnabled) return;
  onProgressChange(() => {
    if (loadSession()) syncSoon();
  });
  window.addEventListener('online', () => syncSoon(0));
  document.addEventListener('visibilitychange', () => {
    // Leaving the app: upload now rather than waiting. Coming back: fetch what other devices did.
    if (loadSession()) syncSoon(0);
  });
  syncSoon(0);
}

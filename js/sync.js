/* ---------------------------------------------------------------
   Sync: keeps this browser's copy of the library in step with two
   JSON files in a private GitHub repository, so every device — the
   admin page on any computer, and the student station — sees the
   same books, students and loans.

   How it works
   - The app keeps working on its local copy exactly as before, so it
     stays instant and keeps working when the Wi-Fi drops.
   - This file remembers the last version it and GitHub agreed on (the
     "base"). To sync, it fetches GitHub's current version and merges
     record by record: whichever side changed a record since the base
     wins; if both did, this device's change wins.
   - Every write carries the version it was based on, so if another
     device saved in between, GitHub refuses it and we merge again.
   - Offline, changes wait in the local copy and go up on the next try.

   Books and settings live in catalog.json; students, loans and holds
   in circulation.json. A checkout at the student station therefore
   never collides with a book being edited on the admin page, and each
   file is written one record per line, so GitHub's history reads as
   a clean log of what changed.
   --------------------------------------------------------------- */

const Sync = (function () {
  const ROLE = document.documentElement.dataset.role === 'student' ? 'student' : 'admin';
  const KEY_PREFIX = 'classroom-library-key-';
  const BASE_KEY = 'classroom-library-synced';
  const FILES = {
    catalog: { path: 'catalog.json', keys: ['items', 'settings'] },
    circulation: { path: 'circulation.json', keys: ['patrons', 'loans', 'holds'] }
  };

  let base = readBase();          // { catalog: {sha, etag, data}, circulation: {...} }
  let status = { state: 'off', detail: '', at: null };
  let running = null, rerun = false, timer = null, connecting = false;

  /* ---------- small helpers ---------- */

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
  }
  function readBase() { try { return JSON.parse(lsGet(BASE_KEY)) || {}; } catch (e) { return {}; } }
  function writeBase() { lsSet(BASE_KEY, JSON.stringify(base)); }

  const accessKey = () => lsGet(KEY_PREFIX + ROLE);
  const configured = () => !!accessKey();
  const hasEverSynced = () => !!(base.catalog && base.circulation);
  const repo = () => SYNC_CONFIG.dataRepo;

  function fail(kind, message) { return Object.assign(new Error(message), { kind: kind }); }

  /* Canonical JSON: key order never counts as a change. */
  function canon(v) {
    if (v === undefined) return '~';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }

  const copy = v => JSON.parse(JSON.stringify(v));

  function pick(src, keys) {
    const out = {};
    keys.forEach(k => { out[k] = src && src[k] != null ? src[k] : (k === 'settings' ? {} : []); });
    return out;
  }

  /* One record per line, so a checkout shows up in GitHub's history as a one-line change. */
  function serialize(obj) {
    return '{\n' + Object.keys(obj).map(k => {
      const v = obj[k];
      if (!Array.isArray(v)) return JSON.stringify(k) + ': ' + JSON.stringify(v);
      return JSON.stringify(k) + ': [' + (v.length ? '\n  ' + v.map(x => JSON.stringify(x)).join(',\n  ') + '\n' : '') + ']';
    }).join(',\n') + '\n}\n';
  }

  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function fromB64(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ---------- GitHub ---------- */

  async function gh(path, opts) {
    opts = opts || {};
    const headers = Object.assign({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + (opts.key || accessKey())
    }, opts.headers || {});
    try {
      return await fetch(SYNC_CONFIG.apiBase + '/repos/' + repo() + path, {
        method: opts.method || 'GET', headers: headers, body: opts.body, cache: 'no-store'
      });
    } catch (e) {
      throw fail('offline', 'No connection — changes are kept on this device and will sync when it is back.');
    }
  }

  function httpFail(res) {
    if (res.status === 401) return fail('auth', 'GitHub rejected the access key — it may have expired. Paste a new one in Settings.');
    if (res.status === 403 || res.status === 429) {
      if (res.headers.get('x-ratelimit-remaining') === '0') return fail('busy', 'GitHub asked us to slow down — sync will pick up again in a few minutes.');
      return fail('auth', 'The access key can read ' + repo() + ' but not change it. It needs Contents: Read and write.');
    }
    if (res.status === 404) return fail('repo', 'Cannot find ' + repo() + '. Check that the repository exists and the access key includes it.');
    return fail('http', 'GitHub returned an error (' + res.status + '). Will try again.');
  }

  async function getFile(name, etag, key) {
    const res = await gh('/contents/' + FILES[name].path, { key: key, headers: etag ? { 'If-None-Match': etag } : {} });
    if (res.status === 304) return { notModified: true };
    if (res.status === 404) return { missing: true };
    if (!res.ok) throw httpFail(res);
    const meta = await res.json();
    let b64 = meta.content;
    if (!b64 && meta.size > 0) {
      // Over 1 MB the contents API leaves the content out; the blob API still serves it.
      const blob = await gh('/git/blobs/' + meta.sha, { key: key });
      if (!blob.ok) throw httpFail(blob);
      b64 = (await blob.json()).content;
    }
    let data = {};
    if (b64) {
      try { data = JSON.parse(fromB64(b64)); }
      catch (e) { throw fail('data', FILES[name].path + ' in ' + repo() + ' is not valid JSON. Was it edited by hand? Restore an earlier version from its history.'); }
    }
    return { sha: meta.sha, etag: res.headers.get('ETag'), data: pick(data, FILES[name].keys) };
  }

  async function putFile(name, data, sha) {
    const body = {
      message: (ROLE === 'student' ? 'Student station' : 'Admin') + ': update ' + FILES[name].path,
      content: toB64(serialize(data))
    };
    if (sha) body.sha = sha;
    const res = await gh('/contents/' + FILES[name].path, {
      method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
    });
    // 409: the file moved on since `sha`; 422: it exists but we thought it didn't.
    if (res.status === 409 || res.status === 422) return { conflict: true };
    if (!res.ok) throw httpFail(res);
    return { sha: (await res.json()).content.sha };
  }

  /* ---------- merging ---------- */

  /* b is the last agreed version (null when this device has never synced).
     A record this device hasn't touched since b takes the remote version — including
     being deleted remotely. A record it has touched keeps this device's version. */
  function mergeRecords(b, l, r) {
    const index = list => new Map((list || []).map(x => [x.id, x]));
    const bm = index(b), lm = index(l), rm = index(r);
    const choose = id => {
      if (!b) return lm.has(id) ? lm.get(id) : rm.get(id); // no shared history: keep both sides
      return canon(lm.get(id)) === canon(bm.get(id)) ? rm.get(id) : lm.get(id);
    };
    const out = [], seen = new Set();
    r.concat(l).forEach(x => {
      if (!x || seen.has(x.id)) return;
      seen.add(x.id);
      const v = choose(x.id);
      if (v) out.push(v);
    });
    return out;
  }

  function mergeSettings(b, l, r) {
    const out = {};
    new Set(Object.keys(l).concat(Object.keys(r))).forEach(k => {
      // With no shared history the shared library's settings beat this device's defaults.
      const v = !b ? (k in r ? r[k] : l[k]) : (canon(l[k]) === canon(b[k]) ? r[k] : l[k]);
      if (v !== undefined) out[k] = v;
    });
    // Never hand out a barcode number that another device has already used.
    out.nextBarcode = Math.max(Number(l.nextBarcode) || 1, Number(r.nextBarcode) || 1);
    return out;
  }

  function mergeFile(b, l, r) {
    const out = {};
    Object.keys(l).forEach(k => {
      out[k] = k === 'settings'
        ? mergeSettings(b ? b.settings || {} : null, l.settings || {}, r.settings || {})
        : mergeRecords(b ? b[k] || [] : null, l[k] || [], r[k] || []);
    });
    return out;
  }

  /* Swap one file's worth of data into the live library without firing library:changed. */
  function applyLocal(data) {
    const next = migrate(Object.assign({}, DB, copy(data)));
    next.activity = DB.activity;
    DB = next;
    persistQuietly();
  }

  /* ---------- the sync itself ---------- */

  async function syncFile(name) {
    const keys = FILES[name].keys;
    for (let attempt = 0; attempt < 5; attempt++) {
      const b = base[name] || null;
      const remote = await getFile(name, b && b.etag);
      const r = remote.notModified ? b.data : remote.missing ? null : remote.data;
      const sha = remote.notModified ? b.sha : remote.missing ? null : remote.sha;
      const etag = remote.notModified ? b.etag : remote.missing ? null : remote.etag;

      const l = copy(pick(DB, keys));
      const merged = r ? mergeFile(b ? b.data : null, l, r) : l;

      let newSha = sha, newEtag = etag;
      if (!r || canon(merged) !== canon(r)) {
        const put = await putFile(name, merged, sha);
        if (put.conflict) continue;        // another device saved first: fetch and merge again
        newSha = put.sha;
        newEtag = null;
      }
      base[name] = { sha: newSha, etag: newEtag, data: merged };

      // Anything done on this device while we were talking to GitHub stays on top,
      // and goes up on the next pass.
      const now = pick(DB, keys);
      let result = merged;
      if (canon(now) !== canon(l)) { result = mergeFile(l, now, merged); rerun = true; }
      if (canon(result) === canon(now)) return false;
      applyLocal(result);
      return true;
    }
    throw fail('conflict', 'Another device kept saving at the same moment. Will try again shortly.');
  }

  async function syncNow() {
    if (!configured() || connecting) return;
    if (running) { rerun = true; return running; }
    running = (async () => {
      setStatus('syncing', '');
      let changed = false;
      try {
        for (const name of Object.keys(FILES)) changed = (await syncFile(name)) || changed;
        writeBase();
        setStatus('ok', '');
      } catch (e) {
        writeBase(); // keep whichever file did finish
        setStatus(e.kind === 'offline' ? 'offline' : 'error', e.message);
        if (!e.kind) console.error('Sync failed', e);
      }
      if (changed) window.dispatchEvent(new Event('library:reloaded'));
    })();
    try { await running; } finally { running = null; }
    if (rerun) { rerun = false; schedule(250); }
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(syncNow, ms);
  }

  function setStatus(state, detail) {
    status = { state: state, detail: detail || '', at: state === 'ok' ? Date.now() : status.at };
    window.dispatchEvent(new Event('sync:status'));
  }

  function pendingChanges() {
    if (!hasEverSynced()) return false;
    return Object.keys(FILES).some(n => canon(pick(DB, FILES[n].keys)) !== canon(base[n].data));
  }

  /* ---------- connecting a device ---------- */

  /* Checks the key and looks at what's already in the shared library.
     Returns what to do next: 'ready' (nothing to decide), or 'ask' when both this
     device and the shared library already hold a library of their own. */
  async function connect(key) {
    key = String(key || '').trim();
    if (!key) throw fail('auth', 'Paste the access key first.');
    connecting = true;
    try {
      const probe = await gh('', { key: key });
      if (!probe.ok) throw httpFail(probe);
      if (hasEverSynced()) {
        // A new key for a device that already syncs (e.g. the old one expired): just carry on.
        lsSet(KEY_PREFIX + ROLE, key);
        return { next: 'ready' };
      }
      const cat = await getFile('catalog', null, key);
      const circ = await getFile('circulation', null, key);
      lsSet(KEY_PREFIX + ROLE, key);
      const remote = { catalog: cat.missing ? null : cat, circulation: circ.missing ? null : circ };
      const summary = {
        remote: remote,
        remoteBooks: remote.catalog ? remote.catalog.data.items.length : 0,
        remoteStudents: remote.circulation ? remote.circulation.data.patrons.length : 0,
        localBooks: DB.items.length,
        localStudents: DB.patrons.length
      };
      const remoteHas = summary.remoteBooks + summary.remoteStudents > 0;
      const localHas = summary.localBooks + summary.localStudents + DB.loans.length > 0;
      if (remoteHas && !localHas) { adopt(summary, 'shared'); return { next: 'ready', summary: summary }; }
      if (remoteHas && localHas) return { next: 'ask', summary: summary };
      return { next: 'ready', summary: summary }; // shared library empty: this device's library goes up
    } finally {
      connecting = false;
    }
  }

  /* mode 'shared': replace this device's library with the shared one.
     mode 'merge': keep both — everything on this device is added to the shared library. */
  function adopt(summary, mode) {
    if (mode === 'shared') {
      Object.keys(FILES).forEach(n => {
        const f = summary.remote[n];
        if (!f) return;
        applyLocal(f.data);
        base[n] = { sha: f.sha, etag: f.etag, data: f.data };
      });
      writeBase();
      window.dispatchEvent(new Event('library:reloaded'));
    }
    // 'merge' needs nothing here: with no base, the first sync keeps both sides.
  }

  function disconnect() {
    lsSet(KEY_PREFIX + ROLE, null);
    base = {};
    writeBase();
    clearTimeout(timer);
    setStatus('off', '');
  }

  /* ---------- for the pages ---------- */

  function describe() {
    const s = status.state;
    if (s === 'off') return { tone: 'off', text: '' };
    if (s === 'syncing') return { tone: 'busy', text: 'Syncing…' };
    if (s === 'offline') return { tone: 'warn', text: 'Offline — saved on this device' };
    if (s === 'error') return { tone: 'error', text: 'Sync problem' };
    if (pendingChanges()) return { tone: 'busy', text: 'Saving…' };
    return { tone: 'ok', text: 'Synced' };
  }

  // The admin page on a device that has only been set up as the student station.
  const stationOnly = () => ROLE === 'admin' && !configured() && !!lsGet(KEY_PREFIX + 'student');

  window.addEventListener('library:changed', () => {
    if (!configured()) return;
    if (status.state === 'ok' || status.state === 'syncing') setStatus(status.state, '');
    schedule(700);
  });
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('storage', e => { if (e.key === BASE_KEY) base = readBase(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, (SYNC_CONFIG.pollSeconds || 20) * 1000);

  if (configured()) syncNow();

  return {
    role: ROLE, repo: repo, configured: configured, hasEverSynced: hasEverSynced,
    status: () => status, describe: describe, pendingChanges: pendingChanges,
    syncNow: syncNow, connect: connect, adopt: adopt, disconnect: disconnect,
    stationOnly: stationOnly,
    // exposed for tests
    _merge: mergeFile, _serialize: serialize
  };
})();

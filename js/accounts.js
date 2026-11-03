/* ---------------------------------------------------------------
   Accounts, so the library opens on any computer with a name and a
   password instead of the access key.

   The key can't be written into this public site: anyone could then
   read every student's borrowing, and GitHub cancels a key it finds
   in a public repository. Instead each account keeps its own copy of
   the key, locked with that person's password, in accounts.json in a
   small PUBLIC repository. Signing in unlocks that copy; without the
   password the file is useless.

   - Accounts are added in Settings, on a computer that is already
     connected — that is where the key being locked up comes from.
     The person is given a temporary password, and picks their own the
     first time they sign in. Nobody can make themselves an account.
   - Passwords are never stored or sent anywhere. Forgetting one means
     issuing a new temporary password (Settings).
   - The file is public, so a short or guessable password can be worn
     down by someone patient. Eight characters is the minimum, and the
     temporary ones this file makes up are a good deal more than that.

   Same design as the yearbook help desk, deliberately: it is proven,
   and one habit covers both.
   --------------------------------------------------------------- */

const Accounts = (function () {
  const PATH = 'accounts.json';
  const ITERATIONS = 310000;
  const MIN_PASSWORD = 8;
  const enc = new TextEncoder(), dec = new TextDecoder();

  const repo = () => SYNC_CONFIG.accountsRepo;
  const norm = u => String(u || '').trim().toLowerCase();
  const b64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  function fail(kind, message) { return Object.assign(new Error(message), { kind: kind }); }

  /* A temporary password has to be worth more than a guess. It locks the real
     access key, and the file it sits in is public, so anyone can take a copy away
     and try words against it all week without the school ever knowing. So it is
     twelve characters of chance rather than a phrase — out of an alphabet with no
     0 or O and no 1 or l in it, so it can be read down a corridor and typed once.
     Someone who insists on making one up instead gets MIN_PASSWORD and a warning. */
  const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // 31 characters
  function tempPassword() {
    const out = [];
    while (out.length < 12) {
      const batch = crypto.getRandomValues(new Uint8Array(16));
      for (let i = 0; i < batch.length && out.length < 12; i++) {
        // 248 = 8 x 31. Anything above it would make the first few letters likelier.
        if (batch[i] < 248) out.push(ALPHABET[batch[i] % ALPHABET.length]);
      }
    }
    return out.slice(0, 4).join('') + '-' + out.slice(4, 8).join('') + '-' + out.slice(8).join('');
  }

  async function keyFor(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function request(method, body, token) {
    const headers = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body) headers['Content-Type'] = 'application/json';
    try {
      return await fetch(SYNC_CONFIG.apiBase + '/repos/' + repo() + '/contents/' + PATH,
        { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) {
      throw fail('offline', 'No connection. Check the Wi-Fi and try again.');
    }
  }

  /* Anyone can read the list (it is public); only a computer holding the key can change it. */
  async function load() {
    const token = Sync.key();
    const res = await request('GET', null, token);
    if (res.status === 404) return { accounts: [], sha: null };
    if (res.ok) {
      const meta = await res.json();
      const text = dec.decode(unb64(String(meta.content || '').replace(/\s/g, '')));
      return { accounts: (text.trim() ? JSON.parse(text).accounts : null) || [], sha: meta.sha };
    }
    if (!token) {
      // GitHub limits how often a school's shared connection may ask without a key; the plain file still works.
      try {
        const raw = await fetch('https://raw.githubusercontent.com/' + repo() + '/HEAD/' + PATH, { cache: 'no-store' });
        if (raw.ok) return { accounts: (await raw.json()).accounts || [], sha: null };
      } catch (e) { /* fall through */ }
    }
    throw fail('http', 'Could not load the accounts (' + res.status + '). Try again in a minute.');
  }

  async function change(fn) {
    const token = Sync.key();
    if (!token) throw fail('auth', 'This computer is not connected.');
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await load();
      const next = fn(cur.accounts.slice());
      const text = '{"accounts": [' + (next.length ? '\n  ' + next.map(a => JSON.stringify(a)).join(',\n  ') + '\n' : '') + ']}\n';
      const body = { message: 'Update accounts', content: b64(enc.encode(text)) };
      if (cur.sha) body.sha = cur.sha;
      const res = await request('PUT', body, token);
      if (res.ok) return next;
      if (res.status === 404 || res.status === 403) throw fail('repo', 'The access key can\'t write to ' + repo() + '. It needs Contents: Read and write on that repository too.');
      if (res.status !== 409 && res.status !== 422) throw fail('http', 'Could not save the account (' + res.status + ').');
    }
    throw fail('conflict', 'Could not save the account. Try again.');
  }

  async function find(user) {
    return (await load()).accounts.find(a => a.user === norm(user)) || null;
  }

  /* Returns the access key locked inside the account, or throws if the password is wrong. */
  async function unlock(account, password) {
    try {
      const key = await keyFor(password, unb64(account.salt), account.iter);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(account.iv) }, key, unb64(account.box));
      return JSON.parse(dec.decode(plain)).token;
    } catch (e) {
      throw fail('password', 'That password isn\'t right.');
    }
  }

  /* Creates the account, or re-locks it (new password, or a replaced access key).
     What the person may do rides alongside in plain sight: the file is public, so it
     says only that someone named Sam may print labels — never anything secret. An
     account re-locked without a list keeps the one it had.

     opts.temp marks the lock as a temporary one, handed out by whoever added the
     person. The app refuses to let them past the sign-in with it still set, so the
     flag coming off is the same event as them choosing their own password. That it
     is readable in a public file is fine and rather the point: it says only that
     this account is waiting for its owner. */
  async function save(name, password, token, can, opts) {
    if (String(password).length < MIN_PASSWORD) throw fail('password', 'Pick a password with at least ' + MIN_PASSWORD + ' characters.');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFor(password, salt, ITERATIONS);
    const box = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify({ token: token })));
    const was = await find(name);
    /* "since" means when the person was added, so a change of password leaves it alone. */
    const account = { user: norm(name), name: String(name).trim(), salt: b64(salt), iv: b64(iv), box: b64(box), iter: ITERATIONS, at: (was && was.at) || new Date().toISOString() };
    if (opts && opts.temp) {
      account.temp = true;
      account.tempAt = new Date().toISOString();
      if (opts.by) account.by = String(opts.by).trim();
    }
    const list = can || (was && was.can);
    if (list) account.can = list.slice();
    await change(all => all.filter(a => a.user !== account.user).concat(account));
    return account;
  }

  /* Changes only the ticks, leaving the locked key alone — no password needed. */
  async function setAbilities(user, can) {
    const who = norm(user);
    return change(list => list.map(a =>
      a.user === who ? Object.assign({}, a, { can: can.slice() }) : a));
  }

  function remove(users) {
    const gone = [].concat(users).map(norm);
    return change(list => list.filter(a => !gone.includes(a.user)));
  }

  return { load: load, find: find, unlock: unlock, save: save, setAbilities: setAbilities,
    remove: remove, norm: norm, repo: repo, tempPassword: tempPassword, MIN_PASSWORD: MIN_PASSWORD };
})();

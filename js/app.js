/* ---------------------------------------------------------------
   App: routing, rendering, and the circulation desk interaction.
   Everything is keyboard-first — a barcode scanner is just a very
   fast typist that presses Enter, so the whole desk flow works
   without ever touching the mouse.
   --------------------------------------------------------------- */

/* Filled in below: one entry per tab. */
const VIEWS = {};   // route -> HTML string
const AFTER = {};   // route -> post-render wiring
const ACTIONS = {}; // data-act name -> handler

const ROUTES = ['circulation', 'catalog', 'patrons', 'holds', 'reports', 'settings'];
let route = (location.hash || '').replace('#', '') || 'circulation';
if (!ROUTES.includes(route)) route = 'circulation';

/* Transient screen state (never persisted). */
const circ = { item: null, patron: null, matches: null, busy: false };
const ui = { catalogQuery: '', catalogFilter: 'all', catalogGenre: '', patronQuery: '' };

const view = document.getElementById('view');
const modal = document.getElementById('modal');

function go(next) {
  route = ROUTES.includes(next) ? next : 'circulation';
  location.hash = route;
  render();
}

window.addEventListener('hashchange', () => {
  const next = (location.hash || '').replace('#', '') || 'circulation';
  if (next !== route) { route = ROUTES.includes(next) ? next : 'circulation'; render(); }
});

document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (btn) go(btn.dataset.route);
});

/* Delegated actions: every button carries data-act and optional data-id. */
view.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const handler = ACTIONS[el.dataset.act];
  if (handler) { e.preventDefault(); handler(el.dataset.id, el); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.open) return; // dialog closes itself
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    if (route !== 'circulation') go('circulation');
    focusScan();
  }
});

function render() {
  document.getElementById('brand-name').textContent = S().libraryName || 'Classroom Library';
  renderSyncPill();
  const who = document.getElementById('who');
  who.hidden = !Auth.me();
  who.textContent = Auth.me() ? 'Sign out (' + Auth.me() + ')' : '';
  const locked = Sync.stationOnly();
  const gated = !locked && Auth.needsSignIn();
  document.getElementById('tabs').hidden = locked || gated;
  if (locked) { renderStationLock(); return; }
  if (gated) { renderSignIn(); return; }
  document.title = (S().libraryName || 'Classroom Library');
  Array.from(document.querySelectorAll('.tab')).forEach(t => {
    t.classList.toggle('active', t.dataset.route === route);
    t.setAttribute('aria-selected', String(t.dataset.route === route));
  });
  const ready = readyHolds().length;
  const pill = document.getElementById('holds-pill');
  pill.hidden = ready === 0;
  pill.textContent = ready;

  view.innerHTML = VIEWS[route]();
  if (AFTER[route]) AFTER[route]();
}

/* Data changed underneath us (another device, or another tab). Re-render, but never
   while someone is mid-typing in a field — wait until they leave it. */
let renderDeferred = false;
function refreshFromElsewhere() {
  if (circ.item) circ.item = itemById(circ.item.id);
  if (circ.patron) circ.patron = patronById(circ.patron.id);
  if (circ.matches) circ.matches = circ.matches.map(i => itemById(i.id)).filter(Boolean);
  const a = document.activeElement;
  if (a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.value) { renderDeferred = true; return; }
  render();
}
view.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if (!renderDeferred || (a && view.contains(a) && a.value)) return;
  renderDeferred = false;
  render();
}, 0));
window.addEventListener('library:reloaded', refreshFromElsewhere);

/* ================================ SYNC ================================ */

function renderSyncPill() {
  const pill = document.getElementById('sync-pill');
  const d = Sync.describe();
  pill.hidden = d.tone === 'off';
  pill.className = 'sync-pill ' + d.tone;
  pill.textContent = d.text;
  pill.title = Sync.status().detail || (Sync.status().at ? 'Last synced ' + new Date(Sync.status().at).toLocaleTimeString() : '');
  const line = document.getElementById('sync-status-line');
  if (line) line.innerHTML = syncStatusLine();
}
window.addEventListener('sync:status', renderSyncPill);
document.getElementById('sync-pill').addEventListener('click', () => go('settings'));
document.getElementById('who').addEventListener('click', () => Auth.signOut());

function syncStatusLine() {
  const st = Sync.status();
  const d = Sync.describe();
  const when = st.at ? ' · last synced ' + esc(new Date(st.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : '';
  return `<span class="sync-dot ${d.tone}"></span> ${esc(d.text || 'Not connected')}${when}` +
    (st.detail ? `<br><span class="${st.state === 'error' ? 'danger' : 'muted'}">${esc(st.detail)}</span>` : '');
}

function syncSettingsHTML() {
  if (!Sync.configured()) return `
    <p class="hint">Keep this library the same on every computer and on the student station. The data is saved to a
      <strong>private</strong> GitHub repository, <code>${esc(Sync.repo())}</code>.
      <a href="https://github.com/homejeopardy/library#syncing-across-devices" target="_blank" rel="noopener">Setup steps</a></p>
    ${keyFormHTML('Connect', true)}
    <p class="hint">Let your browser save the key when it offers. Saved passwords survive clearing
      cookies and site data, so you can get back in with one click.</p>`;
  return `
    <p>Connected to <code>${esc(Sync.repo())}</code>.</p>
    <p class="sync-line" id="sync-status-line">${syncStatusLine()}</p>
    <div class="actions">
      <button class="btn" data-act="sync-now">Sync now</button>
      <button class="btn btn-quiet" data-act="sync-disconnect">Disconnect this computer</button>
    </div>
    <div class="actions"><button class="btn" data-act="pair-show">Set up another device…</button></div>
    <div id="pair-panel" hidden>
      <p class="hint">Open one of these links on the other device and it sets itself up — the key never has to be typed again.
        <strong>Anyone with a link can read and change the library</strong>, so keep them to your own devices and don't post them anywhere.</p>
      <div class="pair-row">
        <label class="field"><span>Student station</span><input id="pair-student" readonly value="${esc(Sync.pairingURL('student'))}"></label>
        <button class="btn" data-act="pair-copy" data-id="student">Copy</button>
        <button class="btn btn-quiet" data-act="pair-qr" data-id="student">QR</button>
        <button class="btn btn-quiet" data-act="pair-file" data-id="student">File</button>
      </div>
      <div class="pair-row">
        <label class="field"><span>This page, on another computer</span><input id="pair-admin" readonly value="${esc(Sync.pairingURL('admin'))}"></label>
        <button class="btn" data-act="pair-copy" data-id="admin">Copy</button>
        <button class="btn btn-quiet" data-act="pair-qr" data-id="admin">QR</button>
        <button class="btn btn-quiet" data-act="pair-file" data-id="admin">File</button>
      </div>
      <div class="qr-box" id="pair-qr-box" hidden></div>
    </div>
    <p class="hint">When the key expires, paste a new one below on this computer, then re-open the links above on the others.</p>
    ${keyFormHTML('Update key', false)}`;
}

/* ------------------------------ signing in ------------------------------
   An account unlocks the access key with a password, so the library opens
   on any computer without the key being typed or pasted. Who is signed in
   is remembered in this browser until they sign out.
   ------------------------------------------------------------------------ */

const Auth = (function () {
  const ME = 'classroom-library-me';
  const SEEN = 'classroom-library-has-accounts';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } };

  /* Ask for a sign-in when accounts are known to exist, or when this browser
     has no key of its own — never on a connected computer that predates
     accounts, which would lock the teacher out of her own library. */
  function needsSignIn() {
    if (get(ME)) return false;
    return get(SEEN) === '1' || !Sync.configured();
  }

  /* Remember whether accounts exist, so the gate works before the network answers. */
  function noteAccounts(list) { set(SEEN, list && list.length ? '1' : null); }

  return {
    me: () => get(ME),
    signIn: name => { set(ME, name); render(); },
    signOut: () => { set(ME, null); render(); },
    needsSignIn: needsSignIn,
    noteAccounts: noteAccounts
  };
})();

let gate = { step: 'name', name: '', account: null, error: '', busy: false };

function renderSignIn() {
  const g = gate;
  const body = {
    name: `<p>Sign in to open the library.</p>
      <label class="field"><span>Your name</span>
        <input name="who" autocomplete="username" value="${esc(g.name)}" placeholder="e.g. Catherine"></label>
      <div class="actions">
        <button type="submit" class="btn btn-primary">Continue</button>
        <button type="button" class="btn btn-quiet" data-gate="key">Use the access key instead</button>
      </div>`,
    password: `<p>Welcome back, <strong>${esc(g.name)}</strong>.</p>
      <input class="sr-only" type="text" name="username" value="${esc(g.name)}" autocomplete="username" readonly tabindex="-1" aria-hidden="true">
      <label class="field"><span>Password</span>
        <input name="password" type="password" autocomplete="current-password" placeholder="Your password"></label>
      <div class="actions">
        <button type="submit" class="btn btn-primary">Sign in</button>
        <button type="button" class="btn btn-quiet" data-gate="name">Back</button>
      </div>`,
    create: `<p>First time for <strong>${esc(g.name)}</strong> — pick a password. You'll use it with your name on any computer.</p>
      <input class="sr-only" type="text" name="username" value="${esc(g.name)}" autocomplete="username" readonly tabindex="-1" aria-hidden="true">
      <div class="grid-2">
        <label class="field"><span>Password</span>
          <input name="password" type="password" autocomplete="new-password"></label>
        <label class="field"><span>And again</span>
          <input name="again" type="password" autocomplete="new-password"></label>
      </div>
      <p class="hint">At least ${Accounts.MIN_PASSWORD} characters. Nobody can look it up for you, but it can be reset from Settings.</p>
      <div class="actions">
        <button type="submit" class="btn btn-primary">Save and sign in</button>
        <button type="button" class="btn btn-quiet" data-gate="name">Back</button>
      </div>`,
    key: `<p>Only needed on the very first computer, or if the key has changed. After this, people sign in with a name and password.</p>
      <label class="field"><span>GitHub access key</span>
        <input name="key" type="password" autocomplete="current-password" placeholder="github_pat_…"></label>
      <div class="actions">
        <button type="submit" class="btn btn-primary">Connect this computer</button>
        <button type="button" class="btn btn-quiet" data-gate="name">Back</button>
      </div>`
  }[g.step];

  view.innerHTML = `<section class="pane narrow sign-in">
    <h2>${esc(S().libraryName || 'Classroom Library')}</h2>
    <form id="gate-form" autocomplete="on">${body}
      ${g.error ? `<p class="danger">${esc(g.error)}</p>` : ''}
    </form>
  </section>`;

  const form = document.getElementById('gate-form');
  form.addEventListener('submit', e => { e.preventDefault(); gateSubmit(form); });
  form.addEventListener('click', e => {
    const to = e.target.dataset && e.target.dataset.gate;
    if (to) { gate = { step: to, name: gate.name, account: gate.account, error: '' }; renderSignIn(); }
  });
  const first = form.querySelector('input:not([readonly])');
  if (first) first.focus();
}

async function gateSubmit(form) {
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  const fail = message => { gate.error = message; btn.disabled = false; renderSignIn(); };
  try {
    if (gate.step === 'name') {
      const typed = form.who.value.trim();
      if (!typed) return fail('Type your name.');
      gate.name = typed;
      const all = (await Accounts.load()).accounts;
      Auth.noteAccounts(all);
      const account = all.find(a => Accounts.norm(a.user) === Accounts.norm(typed));
      if (account) gate = { step: 'password', name: account.name, account: account, error: '' };
      else if (Sync.configured()) gate = { step: 'create', name: typed, account: null, error: '' };
      else return fail('There is no account for ' + typed + ' yet. The first time, sign in on a computer that is already set up, or use the access key below.');
      return renderSignIn();
    }

    if (gate.step === 'password') {
      const token = await Accounts.unlock(gate.account, form.password.value);
      const res = await Sync.connect(token);
      if (res.next === 'ask') Sync.adopt(res.summary, 'merge');
      await Sync.syncNow();
      requestPersistence();
      return Auth.signIn(gate.account.name);
    }

    if (gate.step === 'create') {
      if (form.password.value !== form.again.value) return fail("Those two passwords don't match.");
      await Accounts.save(gate.name, form.password.value, Sync.key());
      Auth.noteAccounts([1]);
      return Auth.signIn(gate.name);
    }

    if (gate.step === 'key') {
      await connectWithKey(form.key.value, btn);
      if (!Sync.configured()) return fail('That key did not work.');
      gate = { step: 'name', name: gate.name, account: null, error: '' };
      return renderSignIn();
    }
  } catch (e) {
    fail(e.message);
  }
}

/* A proper sign-in form: a password manager will only offer to remember a
   password field that lives in a form with a username beside it. What it
   saves then outlives any clearing of site data. */
function keyFormHTML(buttonLabel, primary) {
  return `<form class="key-form" autocomplete="on">
    <input class="sr-only" type="text" name="username" value="Classroom Library key"
           autocomplete="username" readonly tabindex="-1" aria-hidden="true">
    <div class="lookup-row">
      <label class="field"><span>GitHub access key</span>
        <input id="sync-key" name="password" type="password" autocomplete="current-password"
               spellcheck="false" placeholder="github_pat_…"></label>
      <button type="submit" class="btn ${primary ? 'btn-primary' : ''}">${esc(buttonLabel)}</button>
    </div>
  </form>`;
}

/* Ask the browser to treat this library as worth keeping. It stops the
   routine tidying-up browsers do when disk runs short; it does not, and
   cannot, survive someone deliberately clearing site data. */
async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* not supported */ }
  return false;
}

async function showPersistence() {
  const el = document.getElementById('persist-line');
  if (!el) return;
  let persisted = null;
  try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) { /* ignore */ }
  el.textContent = persisted
    ? 'This browser has marked the library as worth keeping, so it will not be tidied away when disk runs short.'
    : 'This browser has not marked the library as protected storage. Installing the app, or bookmarking it, usually persuades it to.';
}

/* Shared by the Settings button and the station lock screen. */
async function connectWithKey(key, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
  try {
    const res = await Sync.connect(key);
    if (res.next === 'ask') {
      const s = res.summary;
      const keepBoth = confirm(
        'The shared library already has ' + plural(s.remoteBooks, 'book') + ' and ' + plural(s.remoteStudents, 'student') + '.\n' +
        'This computer has ' + plural(s.localBooks, 'book') + ' and ' + plural(s.localStudents, 'student') + ' of its own.\n\n' +
        'OK = keep both: add this computer\'s books and students to the shared library.\n' +
        'Cancel = use the shared library and set aside what is on this computer.');
      if (!keepBoth) download('classroom-library-before-sync-' + stamp() + '.json', exportJSON(), 'application/json');
      Sync.adopt(s, keepBoth ? 'merge' : 'shared');
      if (!keepBoth) toast('This computer\'s old library was downloaded as a backup file, just in case.', 'info');
    }
    await Sync.syncNow();
    requestPersistence();
    const st = Sync.status();
    if (st.state === 'error' || st.state === 'offline') toast(st.detail, 'error');
    else toast('Connected — this computer now syncs with the shared library.', 'ok');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    render();
  }
}

/* The QR library is only needed on the setup panel, so it loads when asked
   for and the panel copes without it. */
let qrLib = null;
function loadQRLibrary() {
  if (qrLib) return Promise.resolve(qrLib);
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    tag.onload = () => { qrLib = window.qrcode; qrLib ? resolve(qrLib) : reject(new Error('bad library')); };
    tag.onerror = () => reject(new Error('offline'));
    document.head.appendChild(tag);
  });
}

async function drawPairingQR(which) {
  const box = document.getElementById('pair-qr-box');
  const url = Sync.pairingURL(which);
  box.hidden = false;
  box.innerHTML = '<p class="muted small">Making the code…</p>';
  try {
    const qrcode = await loadQRLibrary();
    const qr = qrcode(0, 'L');            // 0 = smallest size that fits
    qr.addData(url);
    qr.make();
    box.innerHTML = `<div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 2 })}</div>
      <p class="hint">Point the other device's camera at this. It opens the ${which === 'student' ? 'student station' : 'admin page'}, already set up.</p>`;
  } catch (e) {
    box.innerHTML = '<p class="hint">The code needs internet to draw. Copy the link instead.</p>';
  }
}

async function drawAccounts() {
  const box = document.getElementById('accounts-list');
  if (!box) return;
  try {
    const list = (await Accounts.load()).accounts;
    Auth.noteAccounts(list);
    box.innerHTML = list.length
      ? `<ul class="genre-admin">${list.map(a => `<li>
          <span>${esc(a.name)}${Accounts.norm(a.user) === Accounts.norm(Auth.me() || '') ? ' <span class="muted small">(you)</span>' : ''}</span>
          <span class="muted small">since ${esc(fmtDate(a.at))}</span>
          <span class="row-actions"><button class="link danger" data-act="account-reset" data-id="${esc(a.user)}">Reset password</button></span>
        </li>`).join('')}</ul>`
      : `<p class="muted">No accounts yet. ${Sync.configured()
          ? 'Sign out and sign in with your name to make the first one.'
          : 'Connect this computer first.'}</p>`;
  } catch (e) {
    box.innerHTML = `<p class="muted">Could not load the list: ${esc(e.message)}</p>`;
  }
}

function renderStationLock() {
  view.innerHTML = `
  <section class="pane narrow station-lock">
    <h2>This computer is the student station</h2>
    <p>Students use <a href="student/">the student page</a>. To run the admin page here, paste the GitHub access key.</p>
    ${keyFormHTML('Unlock', true)}
  </section>`;
  const form = view.querySelector('.key-form');
  const input = document.getElementById('sync-key');
  form.addEventListener('submit', e => {
    e.preventDefault();
    connectWithKey(input.value, form.querySelector('button[type="submit"]'));
  });
  input.focus();
}

/* ============================ CIRCULATION ============================ */

function focusScan() {
  const el = document.getElementById('scan');
  if (el) { el.focus(); el.select(); }
}

function resetCirc() {
  circ.item = null; circ.patron = null; circ.matches = null;
  render();
  focusScan();
}

VIEWS.circulation = function () {
  const out = activeLoans().length;
  const over = overdueLoans().length;
  return `
  <section class="pane">
    <div class="scan-wrap">
      <label class="scan-label" for="scan">Scan a barcode &mdash; or type an ISBN, title, or student name</label>
      <input id="scan" class="scan" autocomplete="off" spellcheck="false"
             placeholder="Scan or type, then press Enter" aria-describedby="scan-hint">
      <p id="scan-hint" class="hint">
        ${DB.items.length ? plural(DB.items.length, 'book') + ' in the collection &middot; ' + out + ' out' + (over ? ' &middot; <strong class="danger">' + over + ' overdue</strong>' : '') : 'No books yet — scan an ISBN or <a href="#" data-act="new-item">add one by hand</a>.'}
      </p>
    </div>
    <div id="circ-panel" class="circ-panel">${circPanelHTML()}</div>
    ${recentActivityHTML()}
  </section>`;
};

function circPanelHTML() {
  if (circ.matches) return matchesHTML();
  if (!circ.item) return `<div class="empty-desk">
      <p class="empty-desk-icon" aria-hidden="true">📖</p>
      <p>Ready. Scan a book to check it out or in.</p>
    </div>`;

  const item = circ.item;
  const loan = activeLoanForItem(item.id);
  const hold = nextHoldForItem(item.id);

  if (item.status) {
    return `
    <div class="card card-danger">
      ${itemHeadHTML(item)}
      <div class="status-row">
        <span class="badge badge-danger">${esc(statusLabel(item.status))}</span>
        <span class="muted">since ${esc(fmtDate(item.statusAt))}${item.statusWith ? ' &middot; last with ' + esc(item.statusWith) : ''}</span>
      </div>
      ${item.statusNote ? `<p class="note">${esc(item.statusNote)}</p>` : ''}
      <div class="actions">
        <button class="btn btn-primary" data-act="unmark" data-id="${item.id}" id="primary-action">Back on the shelf</button>
        <button class="btn btn-quiet" data-act="edit-item" data-id="${item.id}">Edit</button>
        <button class="btn btn-quiet" data-act="clear-desk">Cancel</button>
      </div>
    </div>`;
  }

  if (loan) {
    const who = patronById(loan.patronId);
    const late = isOverdue(loan);
    return `
    <div class="card ${late ? 'card-danger' : ''}">
      ${itemHeadHTML(item)}
      <div class="status-row">
        <span class="badge ${late ? 'badge-danger' : 'badge-warn'}">${late ? 'Overdue' : 'Checked out'}</span>
        <span>to <strong>${esc(who ? who.name : 'unknown')}</strong></span>
        <span class="muted">&middot; ${esc(relativeDue(loan.dueAt))} (${esc(fmtDate(loan.dueAt))})</span>
        ${loan.renewals ? `<span class="muted">&middot; renewed ${loan.renewals}&times;</span>` : ''}
      </div>
      ${hold ? `<p class="note">On return, hold it for <strong>${esc((patronById(hold.patronId) || {}).name || '?')}</strong>.</p>` : ''}
      ${attentionNoteHTML(item)}
      <div class="actions">
        <button class="btn btn-primary" data-act="checkin" data-id="${item.id}" id="primary-action">Check in</button>
        <button class="btn" data-act="renew" data-id="${loan.id}">Renew</button>
        <button class="btn btn-quiet" data-act="hold-for" data-id="${item.id}">Place hold</button>
        <button class="btn btn-quiet" data-act="mark-trouble" data-id="${item.id}">Lost or damaged…</button>
        <button class="btn btn-quiet" data-act="${item.attention ? 'attention-clear' : 'attention-set'}" data-id="${item.id}">${item.attention ? 'Mark it fixed' : 'Needs attention…'}</button>
        <button class="btn btn-quiet" data-act="clear-desk">Cancel</button>
      </div>
    </div>`;
  }

  return `
  <div class="card">
    ${itemHeadHTML(item)}
    <div class="status-row">
      <span class="badge badge-ok">Available</span>
      ${item.attention ? '<span class="badge badge-warn">Needs attention</span>' : ''}
      ${hold ? `<span>&middot; held for <strong>${esc((patronById(hold.patronId) || {}).name || '?')}</strong></span>` : ''}
    </div>
    ${attentionNoteHTML(item)}
    <div class="checkout-row">
      <label class="field">
        <span>Check out to</span>
        <input id="patron-input" class="patron-input" autocomplete="off" spellcheck="false"
               placeholder="Type a student's name" value="${esc(circ.patron ? circ.patron.name : '')}"
               role="combobox" aria-expanded="false" aria-controls="patron-list" aria-autocomplete="list">
      </label>
      <ul id="patron-list" class="suggest" role="listbox" hidden></ul>
    </div>
    <div class="actions">
      <button class="btn btn-primary" data-act="do-checkout" id="primary-action">Check out</button>
      <button class="btn btn-quiet" data-act="hold-for" data-id="${item.id}">Place hold</button>
      <button class="btn btn-quiet" data-act="mark-trouble" data-id="${item.id}">Lost or damaged…</button>
      <button class="btn btn-quiet" data-act="${item.attention ? 'attention-clear' : 'attention-set'}" data-id="${item.id}">${item.attention ? 'Mark it fixed' : 'Needs attention…'}</button>
      <button class="btn btn-quiet" data-act="clear-desk">Cancel</button>
    </div>
    <p class="hint">${S().autoCreatePatrons ? 'A student who has never borrowed before is added automatically.' : 'New students must be added on the Students tab first.'}</p>
  </div>`;
}

function attentionNoteHTML(item) {
  if (!item.attention) return '';
  return `<p class="note">Needs attention${item.attentionNote ? ': ' + esc(item.attentionNote) : ''}
    <span class="muted">&middot; ${esc(fmtDate(item.attentionAt))}${item.attentionBy ? ', reported by ' + esc(item.attentionBy) : ''}</span></p>`;
}

function itemHeadHTML(item) {
  return `
  <div class="item-head">
    ${coverHTML(item, 'cover-md')}
    <div>
      <h2 class="item-title">${esc(item.title)}</h2>
      <p class="item-sub">${esc(item.author || 'Unknown author')}${item.year ? ' &middot; ' + esc(item.year) : ''}</p>
      <p class="item-meta mono">${esc(item.barcode)}${item.isbn ? ' &middot; ISBN ' + esc(item.isbn) : ''}</p>
      ${item.genre ? `<p class="item-genre">${genreTagHTML(item.genre)}</p>` : ''}
    </div>
  </div>`;
}

function coverHTML(item, cls) {
  if (item.cover) return `<img class="${cls}" src="${esc(item.cover)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls} cover-blank',textContent:'📕'}))">`;
  return `<div class="${cls} cover-blank" aria-hidden="true">📕</div>`;
}

function matchesHTML() {
  const list = circ.matches;
  if (!list.length) return '';
  return `
  <div class="card">
    <h2 class="card-title">${plural(list.length, 'match', 'matches')}</h2>
    <ul class="pick-list">
      ${list.slice(0, 12).map(i => {
        const loan = activeLoanForItem(i.id);
        const who = loan ? patronById(loan.patronId) : null;
        return `<li><button class="pick" data-act="pick-item" data-id="${i.id}">
          ${coverHTML(i, 'cover-sm')}
          <span class="pick-text">
            <strong>${esc(i.title)}</strong>
            <span class="muted">${esc(i.author || '')}</span>
          </span>
          <span class="badge ${loan ? (isOverdue(loan) ? 'badge-danger' : 'badge-warn') : 'badge-ok'}">${loan ? 'out — ' + esc(who ? who.name : '?') : 'available'}</span>
        </button></li>`;
      }).join('')}
    </ul>
    <div class="actions"><button class="btn btn-quiet" data-act="clear-desk">Cancel</button></div>
  </div>`;
}

function recentActivityHTML() {
  const acts = DB.activity.slice(0, 6);
  if (!acts.length) return '';
  return `
  <section class="recent">
    <h2 class="section-title">Recent</h2>
    <ul class="recent-list">
      ${acts.map(a => {
        const loan = loanById(a.loanId);
        if (!loan) return '';
        const item = itemById(loan.itemId), p = patronById(loan.patronId);
        const verb = a.type === 'checkout' ? 'Checked out' : a.type === 'checkin' ? 'Checked in' : 'Renewed';
        return `<li>
          <span class="recent-verb ${a.type}">${verb}</span>
          <span class="recent-what">${esc(item ? item.title : 'deleted item')}</span>
          <span class="muted">${a.type === 'checkin' ? 'from' : 'to'} ${esc(p ? p.name : '?')}</span>
          <span class="muted time">${esc(new Date(a.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span>
          <button class="link" data-act="undo" data-id="${a.id}">Undo</button>
        </li>`;
      }).join('')}
    </ul>
  </section>`;
}

AFTER.circulation = function () {
  const scan = document.getElementById('scan');
  if (scan) {
    scan.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); handleScan(scan.value); }
    });
  }
  const pi = document.getElementById('patron-input');
  if (pi) {
    wirePatronAutocomplete(pi);
    pi.focus();
  } else {
    const primary = document.getElementById('primary-action');
    if (primary) primary.focus(); else focusScan();
  }
};

async function handleScan(raw) {
  const value = String(raw || '').trim();
  if (!value) return;

  const item = findItemByCode(value);
  if (item) { circ.item = item; circ.matches = null; render(); return; }

  const patron = findPatronByCode(value);
  if (patron) {
    circ.patron = patron;
    render();
    toast(patron.name + ' — now scan a book.', 'info');
    return;
  }

  if (looksLikeISBN(value)) {
    openItemModal(null, value);
    return;
  }

  const matches = searchItems(value);
  if (matches.length === 1) { circ.item = matches[0]; circ.matches = null; render(); return; }
  if (matches.length > 1) { circ.matches = matches; circ.item = null; render(); return; }

  // Nothing matched a book — maybe they typed a student's name.
  const people = searchPatrons(value, 3);
  if (people.length === 1 && normName(people[0].name) === normName(value)) {
    openPatronModal(people[0].id);
    return;
  }
  circ.matches = null;
  circ.item = null;
  render();
  toast('Nothing found for "' + value + '".', 'error');
  openItemModal(null, '', value);
}

/* --- student autocomplete --- */
function wirePatronAutocomplete(input) {
  const list = document.getElementById('patron-list');
  let active = -1;
  let options = [];

  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }

  function draw() {
    const q = input.value.trim();
    options = searchPatrons(q, 6);
    const canCreate = S().autoCreatePatrons && q && !findPatronByName(q);
    if (!options.length && !canCreate) { close(); return; }
    list.innerHTML =
      options.map((p, i) => {
        const outCount = activeLoansForPatron(p.id).length;
        return `<li role="option" data-i="${i}" class="${i === active ? 'active' : ''}">
          <span>${esc(p.name)}</span>
          <span class="muted">${outCount ? plural(outCount, 'book') + ' out' : ''}</span>
        </li>`;
      }).join('') +
      (canCreate ? `<li role="option" data-i="new" class="create ${active === options.length ? 'active' : ''}">
          <span>＋ Add <strong>${esc(tidyName(q))}</strong> as a new student</span></li>` : '');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function choose(i) {
    const q = input.value.trim();
    if (i === 'new' || i === options.length) {
      const res = addPatron(q);
      if (!res.ok) { toast(res.error, 'error'); return; }
      circ.patron = res.patron;
    } else {
      circ.patron = options[i];
    }
    input.value = circ.patron.name;
    close();
    const primary = document.getElementById('primary-action');
    if (primary) primary.focus();
  }

  input.addEventListener('input', () => { circ.patron = null; active = -1; draw(); });
  input.addEventListener('focus', draw);
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', e => {
    const count = options.length + (S().autoCreatePatrons && input.value.trim() && !findPatronByName(input.value.trim()) ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, count - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) choose(active === options.length ? 'new' : active);
      else if (options.length && normName(options[0].name) === normName(input.value)) choose(0);
      else if (options.length === 1) choose(0);
      else if (S().autoCreatePatrons && input.value.trim()) choose('new');
      else toast('Pick a student from the list.', 'error');
      if (circ.patron) ACTIONS['do-checkout']();
    }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); choose(li.dataset.i === 'new' ? 'new' : Number(li.dataset.i)); }
  });
}

/* ============================== MODALS ============================== */

function openModal(title, bodyHTML, onMount) {
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');
  body.innerHTML = bodyHTML;
  if (!modal.open) modal.showModal();
  if (onMount) onMount(body);
}

function closeModal() { if (modal.open) modal.close(); }

modal.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) closeModal();
  if (e.target === modal) closeModal(); // click the backdrop
});
modal.addEventListener('close', () => { if (route === 'circulation') focusScan(); });

function field(label, name, value, opts) {
  opts = opts || {};
  return `<label class="field">
    <span>${esc(label)}</span>
    <input name="${name}" value="${esc(value || '')}" ${opts.type ? 'type="' + opts.type + '"' : ''}
      ${opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '"' : ''} autocomplete="off" spellcheck="false">
  </label>`;
}

/* --- add / edit a book --- */
function genreOptionsHTML(current) {
  const list = genreList();
  // A book can carry a genre that was later deleted from the list; still show it.
  if (current && !list.some(g => normName(g) === normName(current))) list.push(current);
  return `<option value="">— No genre —</option>` +
    list.map(g => `<option value="${esc(g)}" ${normName(g) === normName(current) ? 'selected' : ''}>${esc(g)}</option>`).join('') +
    `<option value="__new__">＋ New genre…</option>`;
}

function openItemModal(itemId, prefillISBN, prefillTitle) {
  const item = itemId ? itemById(itemId) : null;
  const d = item || { barcode: '', isbn: prefillISBN || '', title: prefillTitle || '', author: '', publisher: '', year: '', cover: '', genre: '', tags: [], notes: '' };

  openModal(item ? 'Edit book' : 'Add a book', `
    <div class="lookup-row">
      ${field('ISBN', 'isbn', d.isbn, { placeholder: 'Scan or type the ISBN' })}
      <button type="button" class="btn" id="do-lookup">Look up</button>
    </div>
    <p class="hint" id="lookup-status">${item ? 'Looking up an ISBN fills in any empty details.'
      : 'Scan the ISBN, then the barcode label, then pick a genre and press Enter. The details fill in while you scan.'}</p>
    <div class="grid-2 scan-fields">
      ${field('Barcode', 'barcode', d.barcode, { placeholder: 'Scan the label, or leave blank for ' + (S().barcodePrefix || 'CL') + '-####' })}
      <div class="field">
        <label><span class="field-label">Genre</span>
          <span class="genre-pick"><select name="genre">${genreOptionsHTML(d.genre)}</select><span class="genre-pick-art" id="genre-art-now">${genreArt(d.genre, 20)}</span></span></label>
        <p class="genre-hints" id="genre-hints" hidden></p>
      </div>
      ${item ? `<label class="field"><span>Needs attention</span>
        <input name="attention" value="${esc(item.attentionNote || '')}" placeholder="${item.attention ? '' : 'e.g. taped spine — leave blank for none'}" autocomplete="off"></label>` : ''}
      ${item ? `<label class="field"><span>Condition</span>
        <select name="status">
          <option value="">On the shelf</option>
          ${Object.keys(ITEM_STATUSES).map(k => `<option value="${k}" ${item.status === k ? 'selected' : ''}>${esc(ITEM_STATUSES[k])}</option>`).join('')}
        </select></label>` : ''}
    </div>
    <div class="grid-2">
      ${field('Title *', 'title', d.title)}
      ${field('Author', 'author', d.author)}
      ${field('Publisher', 'publisher', d.publisher)}
      ${field('Year', 'year', d.year)}
      ${field('Tags', 'tags', (d.tags || []).join(', '), { placeholder: 'comma separated' })}
      ${field('Cover image URL', 'cover', d.cover)}
    </div>
    <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(d.notes)}</textarea></label>
    ${item && itemRating(item.id) ? `<p class="hint">Students rated this ${starsHTML(itemRating(item.id).avg)} ${itemRating(item.id).avg.toFixed(1)} from ${plural(itemRating(item.id).count, 'rating')}.</p>` : ''}
    <div class="actions">
      <button type="button" class="btn btn-primary" id="save-item">${item ? 'Save changes' : 'Add to collection'}</button>
      ${item ? '' : '<button type="button" class="btn" id="save-item-again">Add &amp; add another</button>'}
      <button type="button" class="btn btn-quiet" data-close>Cancel</button>
    </div>
  `, body => {
    const get = n => body.querySelector('[name="' + n + '"]');
    const status = body.querySelector('#lookup-status');
    const genreSel = get('genre');
    let prevGenre = genreSel.value;

    genreSel.addEventListener('change', () => {
      if (genreSel.value !== '__new__') { prevGenre = genreSel.value; return; }
      const name = prompt('New genre name');
      const res = name ? addGenre(name) : null;
      if (!res || !res.ok) { genreSel.value = prevGenre; if (res) toast(res.error, 'error'); return; }
      genreSel.innerHTML = genreOptionsHTML(res.genre);
      prevGenre = res.genre;
      if (!res.existed) toast('Added the genre "' + res.genre + '".', 'ok');
    });

    const hintBox = body.querySelector('#genre-hints');
    function showGenreHints(list) {
      hintBox.hidden = !list.length;
      hintBox.innerHTML = list.length ? 'Maybe: ' + list.map(g =>
        `<button type="button" class="genre-tag" data-genre="${esc(g)}">${genreArt(g, 13)}${esc(g)}</button>`).join(' ') : '';
    }
    hintBox.addEventListener('click', e => {
      const b = e.target.closest('[data-genre]');
      if (!b) return;
      genreSel.value = b.dataset.genre;
      prevGenre = genreSel.value;
      showGenreHints([]);
      genreSel.focus(); // Enter there saves, same as picking from the menu
    });
    genreSel.addEventListener('change', () => {
      if (genreSel.value) showGenreHints([]);
      const art = body.querySelector('#genre-art-now');
      if (art) art.innerHTML = genreArt(genreSel.value, 20);
    });

    async function runLookup() {
      const isbnInput = get('isbn');
      const raw = isbnInput.value.trim();
      if (!raw && !item) {
        status.textContent = 'No ISBN — type the title and author below.';
        get('barcode').focus();
        return;
      }
      if (!looksLikeISBN(raw)) {
        status.textContent = 'That is not a 10- or 13-digit ISBN — scan it again.';
        isbnInput.focus();
        isbnInput.select();
        return;
      }
      // Hand the cursor to the barcode right away: if it waited for the lookup,
      // a label scanned in the meantime would land in (and overwrite) the ISBN.
      if (!item) get('barcode').focus();
      status.textContent = 'Searching Open Library…';
      try {
        const data = await lookupISBN(raw);
        if (!data) { status.textContent = 'No record found for that ISBN — type the title and author below.'; return; }
        ['title', 'author', 'publisher', 'year', 'cover'].forEach(k => { if (data[k] && !get(k).value.trim()) get(k).value = data[k]; });
        if (data.tags && data.tags.length && !get('tags').value.trim()) get('tags').value = data.tags.join(', ');
        status.textContent = 'Found in ' + data.source + '. Check it, then save.';
        showGenreHints(genreSel.value ? [] : suggestGenres(data.subjects, S().genres));
      } catch (e) {
        status.textContent = e.message === 'offline'
          ? 'No internet connection — you can still type the details in.'
          : 'The book lookup services are not responding right now — try again later, or type the details in.';
      }
    }

    body.querySelector('#do-lookup').addEventListener('click', runLookup);
    get('isbn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runLookup(); } });

    function save(again) {
      const fields = {
        isbn: get('isbn').value, title: get('title').value, author: get('author').value,
        publisher: get('publisher').value, year: get('year').value, barcode: get('barcode').value,
        genre: genreSel.value === '__new__' ? '' : genreSel.value, cover: get('cover').value, notes: get('notes').value,
        tags: get('tags').value.split(',').map(s => s.trim()).filter(Boolean)
      };
      const res = item ? updateItem(item.id, fields) : addItem(fields);
      if (!res.ok) { toast(res.error, 'error'); return; }
      const statusSel = get('status');
      if (statusSel && statusSel.value !== (item.status || '')) setItemStatus(item.id, statusSel.value, item.statusNote);
      const att = get('attention');
      if (att) {
        const wanted = att.value.trim();
        // Any text means it needs attention; clearing the box means it is fixed.
        if (wanted) setAttention(item.id, true, wanted, item.attentionBy);
        else if (item.attention) setAttention(item.id, false);
      }
      toast(item ? 'Saved.' : 'Added "' + res.item.title + '" (' + res.item.barcode + ').', 'ok');
      if (again) {
        openItemModal(null); // starts blank, so the next book gets its own genre suggestions
        return;
      }
      closeModal();
      if (!item && route === 'circulation') { circ.item = res.item; circ.matches = null; }
      render();
    }

    body.querySelector('#save-item').addEventListener('click', () => save(false));
    const againBtn = body.querySelector('#save-item-again');
    if (againBtn) againBtn.addEventListener('click', () => save(true));

    get('barcode').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const input = e.target;
      const clash = findItemByCode(input.value);
      // Same rule addItem/updateItem apply on save, caught now so the label can be rescanned.
      if (input.value.trim() && clash && (!item || clash.id !== item.id)) {
        toast('Barcode ' + input.value.trim() + ' is already on "' + clash.title + '". Scan a different label.', 'error');
        input.select();
        return;
      }
      genreSel.focus();
    });
    genreSel.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); save(false); }
    });
    body.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.name !== 'isbn' && e.target.name !== 'barcode') { e.preventDefault(); save(false); }
    });

    if (item) get('title').focus();
    else if (prefillISBN && looksLikeISBN(prefillISBN)) { get('isbn').focus(); runLookup(); }
    else get('isbn').focus();
  });
}

/* --- student record --- */
function openPatronModal(patronId) {
  const p = patronById(patronId);
  if (!p) return;
  const out = activeLoansForPatron(p.id);
  const all = loansForPatron(p.id);
  const holds = openHolds().filter(h => h.patronId === p.id);

  openModal(p.name, `
    <div class="grid-2">
      ${field('Name', 'name', p.name)}
      ${field('Class / group', 'group', p.group, { placeholder: 'optional' })}
      ${field('Student ID or card barcode', 'barcode', p.barcode, { placeholder: 'optional — scannable' })}
      <div class="stat-inline">
        <div><strong>${out.length}</strong><span>out now</span></div>
        <div><strong>${all.length}</strong><span>lifetime</span></div>
        <div><strong>${out.filter(isOverdue).length}</strong><span>overdue</span></div>
      </div>
    </div>
    <h3 class="section-title">Checked out</h3>
    ${out.length ? `<ul class="mini-list">${out.map(l => {
      const it = itemById(l.itemId);
      return `<li>
        <span>${esc(it ? it.title : '?')}</span>
        <span class="${isOverdue(l) ? 'danger' : 'muted'}">${esc(relativeDue(l.dueAt))}</span>
        <span class="row-actions">
          <button type="button" class="link" data-mact="renew" data-id="${l.id}">Renew</button>
          <button type="button" class="link" data-mact="checkin" data-id="${l.itemId}">Check in</button>
        </span></li>`;
    }).join('')}</ul>` : '<p class="muted">Nothing out right now.</p>'}
    ${holds.length ? `<h3 class="section-title">Waiting for</h3><ul class="mini-list">${holds.map(h => {
      const it = itemById(h.itemId);
      return `<li><span>${esc(it ? it.title : '?')}</span><span class="muted">since ${esc(fmtDate(h.placedAt))}</span>
        <span class="row-actions"><button type="button" class="link" data-mact="cancel-hold" data-id="${h.id}">Cancel</button></span></li>`;
    }).join('')}</ul>` : ''}
    ${all.length > out.length ? `<h3 class="section-title">History</h3><ul class="mini-list">${all.filter(l => l.returnedAt).slice(-8).reverse().map(l => {
      const it = itemById(l.itemId);
      return `<li><span>${esc(it ? it.title : '?')}</span><span class="muted">returned ${esc(fmtDate(l.returnedAt))}</span></li>`;
    }).join('')}</ul>` : ''}
    <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(p.notes || '')}</textarea></label>
    <div class="actions">
      <button type="button" class="btn btn-primary" id="save-patron">Save</button>
      <button type="button" class="btn" id="merge-patron">Merge into another student…</button>
      <button type="button" class="btn btn-danger" id="delete-patron">Delete</button>
      <button type="button" class="btn btn-quiet" data-close>Close</button>
    </div>
  `, body => {
    const get = n => body.querySelector('[name="' + n + '"]');
    body.querySelector('#save-patron').addEventListener('click', () => {
      const res = updatePatron(p.id, { name: get('name').value, group: get('group').value, barcode: get('barcode').value, notes: get('notes').value });
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast('Saved.', 'ok'); closeModal(); render();
    });
    body.querySelector('#delete-patron').addEventListener('click', () => {
      if (!confirm('Delete ' + p.name + ' and their borrowing history? This cannot be undone.')) return;
      const res = deletePatron(p.id);
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast('Deleted.', 'ok'); closeModal(); render();
    });
    body.querySelector('#merge-patron').addEventListener('click', () => openMergeModal(p.id));
    body.addEventListener('click', e => {
      const b = e.target.closest('[data-mact]');
      if (!b) return;
      const act = b.dataset.mact, id = b.dataset.id;
      const res = act === 'renew' ? renew(id) : act === 'checkin' ? checkin(id) : cancelHold(id);
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast('Done.', 'ok');
      openPatronModal(p.id);
      render();
    });
  });
}

function openMergeModal(fromId) {
  const from = patronById(fromId);
  const others = DB.patrons.filter(p => p.id !== fromId).sort(byName);
  if (!others.length) { toast('There is no one to merge into yet.', 'error'); return; }
  openModal('Merge ' + from.name, `
    <p>All of <strong>${esc(from.name)}</strong>'s loans, history and holds move to the student you pick, and the duplicate record is removed.</p>
    <label class="field"><span>Merge into</span>
      <select name="into">${others.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
    </label>
    <div class="actions">
      <button type="button" class="btn btn-primary" id="do-merge">Merge</button>
      <button type="button" class="btn btn-quiet" data-close>Cancel</button>
    </div>
  `, body => {
    body.querySelector('#do-merge').addEventListener('click', () => {
      const res = mergePatrons(fromId, body.querySelector('[name="into"]').value);
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast('Merged into ' + res.patron.name + '.', 'ok');
      closeModal(); render();
    });
  });
}

/* --- lost or damaged --- */
function openTroubleModal(itemId) {
  const item = itemById(itemId);
  if (!item) return;
  const loan = activeLoanForItem(itemId);
  const holder = loan ? patronById(loan.patronId) : null;
  openModal('Lost or damaged', `
    <p><strong>${esc(item.title)}</strong></p>
    ${holder ? `<p class="note">${esc(holder.name)} has this book out. Marking it will close their loan, so it stops counting as overdue — their borrowing history keeps the reason.</p>` : ''}
    <label class="field"><span>What happened</span>
      <select name="status">
        ${Object.keys(ITEM_STATUSES).map(k => `<option value="${k}" ${item.status === k ? 'selected' : ''}>${esc(ITEM_STATUSES[k])}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>Note (optional)</span>
      <input name="note" value="${esc(item.statusNote || '')}" placeholder="e.g. water damage, cover missing" autocomplete="off">
    </label>
    <p class="hint">The book stays in the catalog with its history. It will not be checked out or fill holds until you put it back on the shelf.</p>
    <div class="actions">
      <button type="button" class="btn btn-primary" id="do-mark">Mark it</button>
      ${item.status ? '<button type="button" class="btn" id="do-clear">Back on the shelf</button>' : ''}
      <button type="button" class="btn btn-quiet" data-close>Cancel</button>
    </div>
  `, body => {
    body.querySelector('#do-mark').addEventListener('click', () => {
      const status = body.querySelector('[name="status"]').value;
      const res = setItemStatus(itemId, status, body.querySelector('[name="note"]').value);
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast('"' + item.title + '" marked ' + statusLabel(status).toLowerCase() +
        (res.closedLoan ? ' — ' + (res.holder ? res.holder.name : 'the borrower') + "'s loan was closed." : '.'), 'ok');
      closeModal();
      if (route === 'circulation') resetCirc(); else render();
    });
    const clear = body.querySelector('#do-clear');
    if (clear) clear.addEventListener('click', () => { ACTIONS['unmark'](itemId); closeModal(); });
  });
}

/* --- place a hold --- */
function openHoldModal(itemId) {
  const item = itemById(itemId);
  if (!item) return;
  const people = DB.patrons.slice().sort(byName);
  openModal('Place a hold', `
    <p><strong>${esc(item.title)}</strong></p>
    ${people.length ? `<label class="field"><span>For</span>
      <select name="who">${people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>`
      : `<label class="field"><span>New student's name</span><input name="newname" autocomplete="off"></label>`}
    ${people.length ? `<label class="field"><span>…or a student not in the list yet</span><input name="newname" autocomplete="off" placeholder="Type a new name"></label>` : ''}
    ${holdsForItem(itemId).length ? `<p class="hint">Already waiting: ${holdsForItem(itemId).map(h => esc((patronById(h.patronId) || {}).name || '?')).join(', ')}</p>` : ''}
    <div class="actions">
      <button type="button" class="btn btn-primary" id="do-hold">Place hold</button>
      <button type="button" class="btn btn-quiet" data-close>Cancel</button>
    </div>
  `, body => {
    body.querySelector('#do-hold').addEventListener('click', () => {
      const newName = (body.querySelector('[name="newname"]') || {}).value;
      let patronId;
      if (newName && newName.trim()) {
        const made = addPatron(newName);
        if (!made.ok) { toast(made.error, 'error'); return; }
        patronId = made.patron.id;
      } else {
        const sel = body.querySelector('[name="who"]');
        if (!sel) { toast('Enter a name.', 'error'); return; }
        patronId = sel.value;
      }
      const res = placeHold(itemId, patronId);
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast(res.available ? 'Hold placed — the book is on the shelf now.' : 'Hold placed — number ' + res.position + ' in line.', 'ok');
      closeModal(); render();
    });
  });
}

/* ============================== CATALOG ============================== */

/* What the catalog is showing right now, after the search box and both filters. */
function currentCatalogItems() {
  let items = searchItems(ui.catalogQuery);
  if (ui.catalogFilter === 'out') items = items.filter(i => activeLoanForItem(i.id));
  if (ui.catalogFilter === 'in') items = items.filter(i => !activeLoanForItem(i.id) && !i.status);
  if (ui.catalogFilter === 'overdue') items = items.filter(i => isOverdue(activeLoanForItem(i.id)));
  if (ui.catalogFilter === 'trouble') items = items.filter(i => i.status || i.attention);
  if (ui.catalogGenre === '__none__') items = items.filter(i => !i.genre);
  else if (ui.catalogGenre) items = items.filter(i => normName(i.genre) === normName(ui.catalogGenre));
  return items;
}

VIEWS.catalog = function () {
  const items = currentCatalogItems();

  const used = genreList().filter(g => booksInGenre(g).length);
  const untagged = DB.items.filter(i => !i.genre).length;

  return `
  <section class="pane">
    <div class="toolbar">
      <input id="catalog-q" class="search" placeholder="Search title, author, genre, tag or barcode" value="${esc(ui.catalogQuery)}" autocomplete="off">
      <select id="catalog-genre" class="select" aria-label="Genre">
        <option value="">All genres</option>
        ${used.map(g => `<option value="${esc(g)}" ${normName(g) === normName(ui.catalogGenre) ? 'selected' : ''}>${esc(g)} (${booksInGenre(g).length})</option>`).join('')}
        ${untagged ? `<option value="__none__" ${ui.catalogGenre === '__none__' ? 'selected' : ''}>No genre yet (${untagged})</option>` : ''}
      </select>
      <div class="chips" role="group" aria-label="Filter">
        ${[['all', 'All'], ['in', 'On the shelf'], ['out', 'Checked out'], ['overdue', 'Overdue'], ['trouble', 'Needs a look']].map(([k, label]) =>
          `<button class="chip ${ui.catalogFilter === k ? 'active' : ''}" data-act="cat-filter" data-id="${k}">${label}</button>`).join('')}
      </div>
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="new-item">Add a book</button>
      <button class="btn btn-quiet" data-act="print-labels">Print labels</button>
      <button class="btn btn-quiet" data-act="print-shelflist">Print list</button>
    </div>
    ${items.length ? `
    <table class="table">
      <thead><tr><th></th><th>Title</th><th>Author</th><th>Genre</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${items.map(i => {
          const loan = activeLoanForItem(i.id);
          const who = loan ? patronById(loan.patronId) : null;
          const late = isOverdue(loan);
          const waiting = holdsForItem(i.id).length;
          return `<tr>
            <td>${coverHTML(i, 'cover-xs')}</td>
            <td><button class="link strong" data-act="desk-item" data-id="${i.id}">${esc(i.title)}</button>
                ${waiting ? `<span class="pill">${waiting} waiting</span>` : ''}
                <div class="mono small muted">${esc(i.barcode)}</div>
                ${ratingLineHTML(i)}
                ${i.attention && !i.status ? `<div class="small"><span class="badge badge-warn">Needs attention</span></div>` : ''}</td>
            <td>${esc(i.author || '—')}</td>
            <td>${i.genre ? `<button class="genre-tag" data-act="cat-genre" data-id="${esc(i.genre)}">${genreArt(i.genre, 13)}${esc(i.genre)}</button>` : '<span class="muted">—</span>'}</td>
            <td>${i.status
              ? `<span class="badge badge-danger">${esc(statusLabel(i.status))}</span>
                 ${i.statusWith ? `<span class="muted small">last with ${esc(i.statusWith)}</span>` : ''}`
              : loan
                ? `<span class="badge ${late ? 'badge-danger' : 'badge-warn'}">${late ? 'Overdue' : 'Out'}</span>
                   <span class="muted small">${esc(who ? who.name : '?')} &middot; ${esc(fmtDate(loan.dueAt))}</span>`
                : `<span class="badge badge-ok">On the shelf</span>`}</td>
            <td class="row-actions">
              <button class="link" data-act="edit-item" data-id="${i.id}">Edit</button>
              <button class="link" data-act="hold-for" data-id="${i.id}">Hold</button>
              <button class="link danger" data-act="del-item" data-id="${i.id}">Delete</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : emptyState(DB.items.length ? 'No books match that search.' : 'The collection is empty.', DB.items.length ? '' : 'Add a book')}
  </section>`;
};

AFTER.catalog = function () {
  document.getElementById('catalog-genre').addEventListener('change', e => { ui.catalogGenre = e.target.value; render(); });
  const q = document.getElementById('catalog-q');
  q.addEventListener('input', debounce(e => { ui.catalogQuery = e.target.value; render(); document.getElementById('catalog-q').focus(); }, 180));
  q.focus();
  q.setSelectionRange(q.value.length, q.value.length);
};

/* A genre always travels with its drawing, so the picture on a spine label
   is the same one students see on screen. */
function genreTagHTML(genre) {
  if (!genre) return '';
  return `<span class="genre-tag">${genreArt(genre, 13)}${esc(genre)}</span>`;
}

function ratingLineHTML(item) {
  const r = itemRating(item.id);
  if (!r) return '';
  return `<div class="small muted">${starsHTML(r.avg)} ${r.avg.toFixed(1)} <span class="muted">(${plural(r.count, 'rating')})</span></div>`;
}

function emptyState(message, cta) {
  return `<div class="empty">
    <p>${esc(message)}</p>
    ${cta ? `<button class="btn btn-primary" data-act="new-item">${esc(cta)}</button>` : ''}
  </div>`;
}

/* ============================== STUDENTS ============================== */

VIEWS.patrons = function () {
  const people = searchPatrons(ui.patronQuery, 500);
  return `
  <section class="pane">
    <div class="toolbar">
      <input id="patron-q" class="search" placeholder="Search students" value="${esc(ui.patronQuery)}" autocomplete="off">
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="new-patron">Add a student</button>
    </div>
    ${people.length ? `
    <table class="table">
      <thead><tr><th>Name</th><th>Class</th><th>Out</th><th>Overdue</th><th>Lifetime</th><th>Since</th></tr></thead>
      <tbody>
        ${people.map(p => {
          const out = activeLoansForPatron(p.id);
          const late = out.filter(isOverdue).length;
          return `<tr>
            <td><button class="link strong" data-act="open-patron" data-id="${p.id}">${esc(p.name)}</button></td>
            <td class="muted">${esc(p.group || '—')}</td>
            <td>${out.length || '—'}</td>
            <td class="${late ? 'danger strong' : 'muted'}">${late || '—'}</td>
            <td class="muted">${loansForPatron(p.id).length}</td>
            <td class="muted small">${esc(fmtDate(p.createdAt))}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : emptyState(DB.patrons.length ? 'No students match that search.' : 'No students yet — they are added automatically the first time they borrow a book.', '')}
  </section>`;
};

AFTER.patrons = function () {
  const q = document.getElementById('patron-q');
  q.addEventListener('input', debounce(e => { ui.patronQuery = e.target.value; render(); document.getElementById('patron-q').focus(); }, 180));
  q.focus();
  q.setSelectionRange(q.value.length, q.value.length);
};

/* =============================== HOLDS =============================== */

VIEWS.holds = function () {
  const ready = readyHolds();
  const waiting = openHolds().filter(h => !ready.includes(h));
  const row = (h, isReady) => {
    const it = itemById(h.itemId), p = patronById(h.patronId);
    const loan = activeLoanForItem(h.itemId);
    const pos = holdsForItem(h.itemId).findIndex(x => x.id === h.id) + 1;
    return `<tr>
      <td>${coverHTML(it || {}, 'cover-xs')}</td>
      <td><strong>${esc(it ? it.title : 'deleted item')}</strong><div class="muted small">${esc(it ? it.author : '')}</div></td>
      <td>${esc(p ? p.name : '?')}${pos > 1 ? ` <span class="muted small">#${pos} in line</span>` : ''}</td>
      <td class="muted small">${esc(fmtDate(h.placedAt))}</td>
      <td class="muted small">${isReady ? 'On the shelf now' : (loan ? esc(relativeDue(loan.dueAt)) : 'waiting')}</td>
      <td class="row-actions">
        ${isReady ? `<button class="link strong" data-act="fill-hold" data-id="${h.id}">Check out</button>` : ''}
        <button class="link danger" data-act="cancel-hold" data-id="${h.id}">Cancel</button>
      </td>
    </tr>`;
  };
  if (!ready.length && !waiting.length) return `<section class="pane">${emptyState('No holds right now. Place one from the catalog or the circulation desk.', '')}</section>`;
  return `
  <section class="pane">
    ${ready.length ? `<h2 class="section-title">Ready for pickup</h2>
      <table class="table"><tbody>${ready.map(h => row(h, true)).join('')}</tbody></table>` : ''}
    ${waiting.length ? `<h2 class="section-title">Waiting</h2>
      <table class="table"><tbody>${waiting.map(h => row(h, false)).join('')}</tbody></table>` : ''}
  </section>`;
};

/* ============================== REPORTS ============================== */

VIEWS.reports = function () {
  const out = activeLoans();
  const over = overdueLoans();
  const monthAgo = addDays(new Date(), -30).getTime();
  const recentCheckouts = DB.loans.filter(l => new Date(l.checkedOutAt).getTime() >= monthAgo).length;

  const counts = {};
  DB.loans.forEach(l => { counts[l.itemId] = (counts[l.itemId] || 0) + 1; });
  const popular = Object.keys(counts).map(id => ({ item: itemById(id), n: counts[id] }))
    .filter(x => x.item).sort((a, b) => b.n - a.n).slice(0, 10);
  const never = DB.items.filter(i => !counts[i.id]).sort(byTitle);

  const byPatron = {};
  DB.loans.forEach(l => { byPatron[l.patronId] = (byPatron[l.patronId] || 0) + 1; });
  const readers = Object.keys(byPatron).map(id => ({ p: patronById(id), n: byPatron[id] }))
    .filter(x => x.p).sort((a, b) => b.n - a.n).slice(0, 10);

  return `
  <section class="pane">
    <div class="tiles">
      ${tile(DB.items.length, 'books')}
      ${tile(out.length, 'checked out')}
      ${tile(over.length, 'overdue', over.length ? 'danger' : '')}
      ${tile(DB.patrons.length, 'students')}
      ${tile(recentCheckouts, 'checkouts, 30 days')}
      ${tile(openHolds().length, 'open holds')}
      ${tile(troubledItems().length, 'lost or damaged', troubledItems().length ? 'danger' : '')}
      ${tile(attentionItems().length, 'need attention')}
    </div>

    <h2 class="section-title">Overdue <button class="btn btn-quiet" data-act="print-notices" ${over.length ? '' : 'disabled'}>Print notices</button></h2>
    ${over.length ? `<table class="table">
      <thead><tr><th>Book</th><th>Student</th><th>Due</th><th>Late by</th><th></th></tr></thead>
      <tbody>${over.map(l => {
        const it = itemById(l.itemId), p = patronById(l.patronId);
        return `<tr>
          <td><strong>${esc(it ? it.title : '?')}</strong> <span class="mono small muted">${esc(it ? it.barcode : '')}</span></td>
          <td><button class="link" data-act="open-patron" data-id="${l.patronId}">${esc(p ? p.name : '?')}</button></td>
          <td class="muted">${esc(fmtDate(l.dueAt))}</td>
          <td class="danger strong">${plural(Math.abs(daysBetween(new Date(), l.dueAt)), 'day')}</td>
          <td class="row-actions">
            <button class="link" data-act="checkin" data-id="${l.itemId}">Check in</button>
            <button class="link" data-act="renew" data-id="${l.id}">Renew</button>
          </td></tr>`;
      }).join('')}</tbody></table>` : '<p class="muted">Nothing is overdue. </p>'}

    <div class="grid-2 wide">
      <div>
        <h2 class="section-title">Most borrowed</h2>
        ${popular.length ? `<ol class="rank">${popular.map(x => `<li><span>${esc(x.item.title)}</span><span class="muted">${plural(x.n, 'time')}</span></li>`).join('')}</ol>` : '<p class="muted">No checkouts yet.</p>'}
      </div>
      <div>
        <h2 class="section-title">Busiest readers</h2>
        ${readers.length ? `<ol class="rank">${readers.map(x => `<li><button class="link" data-act="open-patron" data-id="${x.p.id}">${esc(x.p.name)}</button><span class="muted">${plural(x.n, 'book')}</span></li>`).join('')}</ol>` : '<p class="muted">No checkouts yet.</p>'}
      </div>
    </div>

    ${troubledItems().length ? `<h2 class="section-title">Lost and damaged</h2>
    <table class="table">
      <thead><tr><th>Book</th><th>What happened</th><th>Since</th><th>Last with</th><th></th></tr></thead>
      <tbody>${troubledItems().map(i => `<tr>
        <td><button class="link strong" data-act="desk-item" data-id="${i.id}">${esc(i.title)}</button>
            <div class="mono small muted">${esc(i.barcode)}</div></td>
        <td><span class="badge badge-danger">${esc(statusLabel(i.status))}</span>${i.statusNote ? ` <span class="muted small">${esc(i.statusNote)}</span>` : ''}</td>
        <td class="muted small">${esc(fmtDate(i.statusAt))}</td>
        <td class="muted small">${esc(i.statusWith || '—')}</td>
        <td class="row-actions"><button class="link" data-act="unmark" data-id="${i.id}">Back on the shelf</button></td>
      </tr>`).join('')}</tbody>
    </table>` : ''}

    ${attentionItems().length ? `<h2 class="section-title">Needs attention</h2>
    <p class="hint">These still go out as normal — this is just a list of what wants doing.</p>
    <table class="table">
      <thead><tr><th>Book</th><th>What needs doing</th><th>Since</th><th></th></tr></thead>
      <tbody>${attentionItems().map(i => `<tr>
        <td><button class="link strong" data-act="desk-item" data-id="${i.id}">${esc(i.title)}</button>
            <div class="mono small muted">${esc(i.barcode)}</div></td>
        <td>${esc(i.attentionNote || '—')}${i.attentionBy ? `<div class="muted small">reported by ${esc(i.attentionBy)}</div>` : ''}</td>
        <td class="muted small">${esc(fmtDate(i.attentionAt))}</td>
        <td class="row-actions"><button class="link" data-act="attention-clear" data-id="${i.id}">Mark it fixed</button></td>
      </tr>`).join('')}</tbody>
    </table>` : ''}

    <h2 class="section-title">What students thought</h2>
    ${ratedReportHTML()}

    <h2 class="section-title">By genre</h2>
    ${genreReportHTML(counts)}

    <h2 class="section-title">Never borrowed <span class="muted">(${never.length})</span></h2>
    ${never.length ? `<ul class="tag-list">${never.slice(0, 40).map(i => `<li><button class="link" data-act="desk-item" data-id="${i.id}">${esc(i.title)}</button></li>`).join('')}</ul>` : '<p class="muted">Every book has circulated at least once.</p>'}

    <h2 class="section-title">Export</h2>
    <div class="actions">
      <button class="btn" data-act="export-catalog-csv">Catalog (CSV)</button>
      <button class="btn" data-act="export-loans-csv">Loan history (CSV)</button>
      <button class="btn" data-act="export-json">Full backup (JSON)</button>
    </div>
  </section>`;
};

/* Books students have rated, best first. Two ratings is a low bar, but with
   one class it is the difference between a shelf favourite and one opinion. */
function ratedReportHTML() {
  const rated = DB.items.map(i => ({ item: i, r: itemRating(i.id) })).filter(x => x.r);
  if (!rated.length) return '<p class="muted">No ratings yet. Students give these at the station when they return a book.</p>';
  rated.sort((a, b) => b.r.avg - a.r.avg || b.r.count - a.r.count);
  return `<table class="table">
    <thead><tr><th>Book</th><th>Rating</th><th>Ratings</th></tr></thead>
    <tbody>${rated.slice(0, 15).map(x => `<tr>
      <td><button class="link strong" data-act="desk-item" data-id="${x.item.id}">${esc(x.item.title)}</button></td>
      <td>${starsHTML(x.r.avg)} <span class="muted">${x.r.avg.toFixed(1)}</span></td>
      <td class="muted">${x.r.count}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* Which kinds of books actually move — useful when deciding what to buy next. */
function genreReportHTML(counts) {
  if (!DB.items.length) return '<p class="muted">No books yet.</p>';
  const rows = {};
  DB.items.forEach(i => {
    const g = i.genre || '';
    const r = rows[g] = rows[g] || { books: 0, out: 0, loans: 0 };
    r.books++;
    if (activeLoanForItem(i.id)) r.out++;
    r.loans += counts[i.id] || 0;
  });
  const names = Object.keys(rows).sort((a, b) => rows[b].loans - rows[a].loans || rows[b].books - rows[a].books);
  return `<table class="table">
    <thead><tr><th>Genre</th><th>Books</th><th>Out now</th><th>Times borrowed</th><th>Per book</th></tr></thead>
    <tbody>${names.map(g => {
      const r = rows[g];
      return `<tr>
        <td>${g ? `<button class="genre-tag" data-act="report-genre" data-id="${esc(g)}">${genreArt(g, 13)}${esc(g)}</button>` : '<span class="muted">No genre yet</span>'}</td>
        <td>${r.books}</td>
        <td class="muted">${r.out || '—'}</td>
        <td>${r.loans}</td>
        <td class="muted">${(r.loans / r.books).toFixed(1)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function tile(n, label, cls) {
  return `<div class="tile ${cls || ''}"><strong>${n}</strong><span>${esc(label)}</span></div>`;
}

/* ============================== SETTINGS ============================== */

VIEWS.settings = function () {
  const s = S();
  return `
  <section class="pane narrow">
    <h2 class="section-title">Library</h2>
    <div class="grid-2">
      ${field('Library name', 'libraryName', s.libraryName)}
      ${field('Barcode prefix', 'barcodePrefix', s.barcodePrefix)}
      ${field('Loan length (days)', 'loanDays', s.loanDays, { type: 'number' })}
      ${field('Grace days before "overdue"', 'graceDays', s.graceDays, { type: 'number' })}
      ${field('Renewals allowed', 'maxRenewals', s.maxRenewals, { type: 'number' })}
      ${field('Books out at once (0 = no limit)', 'maxItems', s.maxItems, { type: 'number' })}
    </div>
    <label class="check">
      <input type="checkbox" name="autoCreatePatrons" ${s.autoCreatePatrons ? 'checked' : ''}>
      <span>Add a student automatically the first time their name is typed at checkout</span>
    </label>
    <div class="actions"><button class="btn btn-primary" data-act="save-settings">Save settings</button></div>

    <h2 class="section-title">Sync across devices</h2>
    ${syncSettingsHTML()}

    <h2 class="section-title">Who can sign in</h2>
    <p class="hint">Each person unlocks the library with their own password, on any computer, without the access key.
      A new person signs in here on this computer and picks a password the first time.
      Accounts live in <code>${esc(Accounts.repo())}</code>; the password is never stored anywhere.</p>
    <div id="accounts-list" class="muted">Loading…</div>

    <h2 class="section-title">Genres</h2>
    <p class="hint">These are the choices in the Genre menu when you add a book. Renaming a genre updates every book in it; renaming one onto another merges them.</p>
    <ul class="genre-admin">
      ${genreList().map(g => {
        const n = booksInGenre(g).length;
        return `<li>
          ${genreTagHTML(g)}
          <span class="muted small">${n ? plural(n, 'book') : 'unused'}</span>
          <span class="row-actions">
            <button class="link" data-act="genre-rename" data-id="${esc(g)}">Rename</button>
            <button class="link danger" data-act="genre-delete" data-id="${esc(g)}">Delete</button>
          </span>
        </li>`;
      }).join('') || '<li class="muted">No genres yet.</li>'}
    </ul>
    <div class="lookup-row">
      <label class="field"><span>New genre</span><input id="new-genre" autocomplete="off" placeholder="e.g. Animal Stories"></label>
      <button class="btn" data-act="genre-add">Add</button>
    </div>
    <div class="actions"><button class="btn btn-quiet" data-act="genre-defaults">Restore default genres</button></div>

    <h2 class="section-title">Backup</h2>
    <p class="hint">${Sync.configured()
      ? 'The books themselves are safe: they live in GitHub as well as here, with every earlier version kept. Clearing this browser\'s cookies and site data empties its copy and forgets the key — opening your saved setup link or recovery file brings both straight back. (Clearing only the <em>cache</em> changes nothing.)'
      : 'Everything lives in this browser on this computer, and clearing cookies and site data erases it for good. Turn on sync above, or export a backup regularly — and always before clearing browsing data or switching machines.'}</p>
    <p class="hint" id="persist-line"></p>
    <div class="actions">
      <button class="btn" data-act="export-json">Download backup</button>
      <button class="btn" data-act="import-json">Restore from backup…</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>

    <h2 class="section-title">Danger zone</h2>
    <div class="actions">
      <button class="btn" data-act="load-sample" ${DB.items.length || Sync.configured() ? 'disabled title="Only available on an empty library that is not syncing"' : ''}>Load sample data</button>
      <button class="btn btn-danger" data-act="reset-all">Erase everything</button>
    </div>
    <p class="hint">Storage in use: ${esc(storageSize())}</p>
  </section>`;
};

AFTER.settings = function () {
  showPersistence();
  drawAccounts();
  view.querySelectorAll('.key-form').forEach(form => form.addEventListener('submit', e => {
    e.preventDefault();
    connectWithKey(form.querySelector('#sync-key').value, form.querySelector('button[type="submit"]'));
  }));
  document.getElementById('new-genre').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); ACTIONS['genre-add'](); }
  });
  const file = document.getElementById('import-file');
  file.addEventListener('change', () => {
    const f = file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const mode = confirm('OK = replace everything with this backup' + (Sync.configured() ? ' (on every synced device)' : '') + '.\nCancel = merge it into the current library.') ? 'replace' : 'merge';
      const res = importJSON(String(reader.result), mode);
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast(mode === 'replace' ? 'Backup restored.' : 'Merged: ' + res.added.items + ' books, ' + res.added.patrons + ' students.', 'ok');
      render();
    };
    reader.readAsText(f);
    file.value = '';
  });
};

function storageSize() {
  try {
    const bytes = new Blob([JSON.stringify(DB)]).size;
    return bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
  } catch (e) { return 'unknown'; }
}

/* ============================== ACTIONS ============================== */

Object.assign(ACTIONS, {
  'clear-desk': () => resetCirc(),

  'pick-item': id => { circ.item = itemById(id); circ.matches = null; render(); },

  'desk-item': id => { circ.item = itemById(id); circ.matches = null; go('circulation'); },

  'checkin': itemId => {
    const res = checkin(itemId);
    if (!res.ok) { toast(res.error, 'error'); return; }
    const item = itemById(itemId);
    if (res.nextHold) {
      const who = patronById(res.nextHold.patronId);
      toast('Checked in. Set it aside — ' + (who ? who.name : 'someone') + ' has a hold on it.', 'ok');
    } else {
      toast('Checked in' + (res.wasOverdue ? ' (was overdue)' : '') + ': ' + (item ? item.title : ''), 'ok');
    }
    resetCirc();
  },

  'renew': loanId => {
    let res = renew(loanId);
    if (!res.ok && res.soft) {
      if (!confirm(res.error + '\n\nRenew anyway?')) return;
      res = forceRenew(loanId);
    }
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Renewed — now due ' + fmtDateFull(res.loan.dueAt) + '.', 'ok');
    if (route === 'circulation') resetCirc(); else render();
  },

  'do-checkout': () => {
    if (!circ.item) { toast('Scan a book first.', 'error'); return; }
    const input = document.getElementById('patron-input');
    const typed = input ? input.value.trim() : '';
    let patron = circ.patron;
    if (!patron && typed) {
      patron = findPatronByName(typed);
      if (!patron) {
        if (!S().autoCreatePatrons) { toast('No student called "' + typed + '". Add them on the Students tab.', 'error'); return; }
        const made = addPatron(typed);
        if (!made.ok) { toast(made.error, 'error'); return; }
        patron = made.patron;
        toast('Added ' + patron.name + ' as a new student.', 'info');
      }
    }
    if (!patron) { toast('Type a student name.', 'error'); if (input) input.focus(); return; }

    let res = checkout(circ.item.id, patron.id);
    if (!res.ok && res.soft) {
      if (!confirm(res.error + '\n\nCheck it out anyway?')) return;
      res = forceCheckout(circ.item.id, patron.id);
    }
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(circ.item.title + ' → ' + patron.name + ', due ' + fmtDateFull(res.loan.dueAt) + '.', 'ok');
    resetCirc();
  },

  'undo': actId => {
    const res = undoActivity(actId);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Undone.', 'ok');
    resetCirc();
  },

  'new-item': () => openItemModal(null),
  'edit-item': id => openItemModal(id),
  'del-item': id => {
    const item = itemById(id);
    if (!item) return;
    if (!confirm('Remove "' + item.title + '" from the collection? Its loan history goes too.')) return;
    const res = deleteItem(id);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('Removed.', 'ok'); render();
  },

  'new-patron': () => {
    const name = prompt('Student name');
    if (!name) return;
    const res = addPatron(name);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(res.existed ? res.patron.name + ' is already on the list.' : 'Added ' + res.patron.name + '.', 'ok');
    render();
    openPatronModal(res.patron.id);
  },
  'open-patron': id => openPatronModal(id),

  'hold-for': itemId => openHoldModal(itemId),

  'mark-trouble': itemId => openTroubleModal(itemId),
  'attention-set': itemId => {
    const item = itemById(itemId);
    const note = prompt('What needs doing to "' + item.title + '"?', item.attentionNote || '');
    if (note === null) return;
    setAttention(itemId, true, note);
    toast('Added to the attention list.', 'ok');
    if (route === 'circulation') resetCirc(); else render();
  },
  'attention-clear': itemId => {
    setAttention(itemId, false);
    toast('Marked fixed.', 'ok');
    if (route === 'circulation') resetCirc(); else render();
  },
  'unmark': itemId => {
    const res = setItemStatus(itemId, '');
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('"' + res.item.title + '" is back on the shelf.', 'ok');
    if (route === 'circulation') resetCirc(); else render();
  },
  'cancel-hold': id => { const res = cancelHold(id); if (!res.ok) { toast(res.error, 'error'); return; } toast('Hold cancelled.', 'ok'); render(); },
  'fill-hold': id => {
    const h = DB.holds.find(x => x.id === id);
    if (!h) return;
    circ.item = itemById(h.itemId);
    circ.patron = patronById(h.patronId);
    go('circulation');
    const input = document.getElementById('patron-input');
    if (input && circ.patron) { input.value = circ.patron.name; }
    const primary = document.getElementById('primary-action');
    if (primary) primary.focus();
  },

  'cat-filter': key => { ui.catalogFilter = key; render(); },
  'cat-genre': genre => { ui.catalogGenre = genre; render(); },
  'report-genre': genre => { ui.catalogGenre = genre; ui.catalogFilter = 'all'; ui.catalogQuery = ''; go('catalog'); },

  'genre-add': () => {
    const input = document.getElementById('new-genre');
    const res = addGenre(input.value);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(res.existed ? '"' + res.genre + '" is already on the list.' : 'Added "' + res.genre + '".', res.existed ? 'info' : 'ok');
    render();
    document.getElementById('new-genre').focus();
  },
  'genre-rename': name => {
    const to = prompt('Rename "' + name + '" to:', name);
    if (to == null || to.trim() === name) return;
    const res = renameGenre(name, to);
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast(res.merged ? 'Merged into "' + res.genre + '".' : 'Renamed to "' + res.genre + '".', 'ok');
    render();
  },
  'genre-delete': name => {
    const n = booksInGenre(name).length;
    if (n && !confirm(plural(n, 'book is', 'books are') + ' in "' + name + '". Delete the genre and leave ' + (n === 1 ? 'that book' : 'those books') + ' without one?')) return;
    deleteGenre(name);
    toast('Deleted "' + name + '".', 'ok');
    render();
  },
  'genre-defaults': () => {
    const missing = DEFAULT_SETTINGS.genres.filter(g => !S().genres.some(x => normName(x) === normName(g)));
    if (!missing.length) { toast('Every default genre is already on your list.', 'info'); return; }
    missing.forEach(g => addGenre(g, true));
    saveDB();
    toast('Added back ' + plural(missing.length, 'default genre') + '.', 'ok');
    render();
  },

  'export-json': () => download('classroom-library-backup-' + stamp() + '.json', exportJSON(), 'application/json'),
  'import-json': () => document.getElementById('import-file').click(),

  'export-catalog-csv': () => {
    const rows = [['Barcode', 'ISBN', 'Title', 'Author', 'Publisher', 'Year', 'Genre', 'Tags', 'Status', 'With', 'Due', 'Times borrowed', 'Added']];
    const counts = {};
    DB.loans.forEach(l => { counts[l.itemId] = (counts[l.itemId] || 0) + 1; });
    DB.items.slice().sort(byTitle).forEach(i => {
      const loan = activeLoanForItem(i.id);
      const p = loan ? patronById(loan.patronId) : null;
      rows.push([i.barcode, i.isbn, i.title, i.author, i.publisher, i.year, i.genre, (i.tags || []).join('; '),
        loan ? (isOverdue(loan) ? 'Overdue' : 'Checked out') : 'On the shelf',
        p ? p.name : '', loan ? String(loan.dueAt).slice(0, 10) : '', counts[i.id] || 0, String(i.addedAt).slice(0, 10)]);
    });
    download('catalog-' + stamp() + '.csv', toCSV(rows), 'text/csv');
  },

  'export-loans-csv': () => {
    const rows = [['Title', 'Barcode', 'Student', 'Checked out', 'Due', 'Returned', 'Renewals', 'Status']];
    DB.loans.slice().sort((a, b) => new Date(b.checkedOutAt) - new Date(a.checkedOutAt)).forEach(l => {
      const i = itemById(l.itemId), p = patronById(l.patronId);
      rows.push([i ? i.title : '(deleted)', i ? i.barcode : '', p ? p.name : '(deleted)',
        String(l.checkedOutAt).slice(0, 10), String(l.dueAt).slice(0, 10),
        l.returnedAt ? String(l.returnedAt).slice(0, 10) : '', l.renewals || 0,
        l.returnedAt ? 'Returned' : (isOverdue(l) ? 'Overdue' : 'Out')]);
    });
    download('loans-' + stamp() + '.csv', toCSV(rows), 'text/csv');
  },

  'save-settings': () => {
    const get = n => view.querySelector('[name="' + n + '"]');
    const num = (n, min, dflt) => {
      const v = parseInt(get(n).value, 10);
      return isNaN(v) || v < min ? dflt : v;
    };
    Object.assign(S(), {
      libraryName: get('libraryName').value.trim() || 'Classroom Library',
      barcodePrefix: get('barcodePrefix').value.trim().toUpperCase() || 'CL',
      loanDays: num('loanDays', 1, 14),
      graceDays: num('graceDays', 0, 0),
      maxRenewals: num('maxRenewals', 0, 2),
      maxItems: num('maxItems', 0, 3),
      autoCreatePatrons: get('autoCreatePatrons').checked
    });
    saveDB();
    toast('Settings saved.', 'ok');
    render();
  },

  'sync-connect': (id, btn) => connectWithKey(document.getElementById('sync-key').value, btn),
  'pair-show': () => {
    const panel = document.getElementById('pair-panel');
    panel.hidden = !panel.hidden;
  },
  'pair-copy': async which => {
    const input = document.getElementById('pair-' + which);
    try {
      await navigator.clipboard.writeText(input.value);
      toast('Link copied. Open it on the other device.', 'ok');
    } catch (e) {
      input.select();
      toast('Press Cmd+C to copy the selected link.', 'info');
    }
  },
  'pair-qr': which => drawPairingQR(which),
  'pair-file': which => {
    const url = Sync.pairingURL(which);
    const label = which === 'student' ? 'the student station' : 'the library';
    download('open-' + (which === 'student' ? 'student-station' : 'classroom-library') + '.html',
      `<!doctype html>
<meta charset="utf-8">
<title>Open ${esc(label)}</title>
<meta http-equiv="refresh" content="0;url=${esc(url)}">
<body style="font: 16px/1.6 system-ui, sans-serif; padding: 40px; max-width: 34em">
<h1 style="font-size: 20px">Opening ${esc(label)}…</h1>
<p><a href="${esc(url)}">Open it now</a> if nothing happens by itself.</p>
<p style="color: #777">Double-clicking this file opens your library and sets this computer up again —
useful if its browser data is ever cleared. It carries the key to your library, so keep it off
shared drives and out of the hands of students.</p>
`, 'text/html');
    toast('Saved. Keep it somewhere safe — double-click it to get back in.', 'ok');
  },
  'sync-now': async (id, btn) => {
    btn.disabled = true;
    await Sync.syncNow();
    const st = Sync.status();
    toast(st.state === 'ok' ? 'Up to date.' : st.detail, st.state === 'ok' ? 'ok' : 'error');
    render();
  },
  'account-reset': async user => {
    if (!confirm('Reset ' + user + "'s password? They pick a new one next time they sign in on a computer that is already connected.")) return;
    try {
      await Accounts.remove(user);
      toast('Password reset.', 'ok');
      if (Accounts.norm(user) === Accounts.norm(Auth.me() || '')) Auth.signOut();
      else drawAccounts();
    } catch (e) { toast(e.message, 'error'); }
  },

  'sign-out': () => Auth.signOut(),

  'sync-disconnect': () => {
    if (!confirm('Stop syncing on this computer? Its copy of the library stays here; other devices keep the shared library.')) return;
    Sync.disconnect();
    toast('This computer no longer syncs.', 'ok');
    render();
  },

  'reset-all': () => {
    if (!confirm(Sync.configured()
      ? 'Erase every book, student and loan — in the SHARED library, on every device and the student station? (Earlier versions stay in the GitHub history.)'
      : 'Erase every book, student and loan? Export a backup first if you might want any of it back.')) return;
    if (!confirm('Really erase everything? This cannot be undone.')) return;
    resetDB();
    toast('Library erased.', 'ok');
    go('circulation');
  },

  'load-sample': () => {
    if (DB.items.length) { toast('Sample data only loads into an empty library.', 'error'); return; }
    loadSampleData();
    toast('Sample data loaded — erase it from Settings when you are done trying things out.', 'ok');
    go('circulation');
  },

  'print-notices': () => printOverdueNotices(),
  'print-labels': () => openLabelsModal(),
  'print-shelflist': () => printShelfList()
});

/* ============================== PRINTING ============================== */

function printHTML(html) {
  const area = document.getElementById('print-area');
  area.innerHTML = html;
  window.print();
}

function printOverdueNotices() {
  const over = overdueLoans();
  if (!over.length) { toast('Nothing is overdue.', 'info'); return; }
  const byPatron = {};
  over.forEach(l => { (byPatron[l.patronId] = byPatron[l.patronId] || []).push(l); });
  const html = Object.keys(byPatron).map(pid => {
    const p = patronById(pid);
    const loans = byPatron[pid];
    return `<section class="notice">
      <h1>${esc(S().libraryName)}</h1>
      <h2>Overdue notice</h2>
      <p><strong>${esc(p ? p.name : '?')}</strong>${p && p.group ? ' — ' + esc(p.group) : ''}</p>
      <p>Please return ${loans.length === 1 ? 'this book' : 'these books'} to the classroom library:</p>
      <table>
        <thead><tr><th>Title</th><th>Was due</th><th>Days late</th></tr></thead>
        <tbody>${loans.map(l => {
          const i = itemById(l.itemId);
          return `<tr><td>${esc(i ? i.title : '?')}</td><td>${esc(fmtDateFull(l.dueAt))}</td><td>${Math.abs(daysBetween(new Date(), l.dueAt))}</td></tr>`;
        }).join('')}</tbody>
      </table>
      <p class="notice-foot">Printed ${esc(fmtDateFull(nowISO()))}</p>
    </section>`;
  }).join('');
  printHTML(html);
}

/* Grouped by genre, so the printout doubles as a checklist for sorting bins. */
function printShelfList() {
  let items = searchItems(ui.catalogQuery);
  if (ui.catalogGenre === '__none__') items = items.filter(i => !i.genre);
  else if (ui.catalogGenre) items = items.filter(i => normName(i.genre) === normName(ui.catalogGenre));
  const groups = {};
  items.forEach(i => { (groups[i.genre || ''] = groups[i.genre || ''] || []).push(i); });
  const names = Object.keys(groups).sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));
  const html = `<section class="notice">
    <h1>${esc(S().libraryName)}</h1>
    <h2>Shelf list — ${plural(items.length, 'book')}</h2>
    ${names.map(g => `
    <h3>${esc(g || 'No genre yet')} <span class="notice-count">(${groups[g].length})</span></h3>
    <table>
      <thead><tr><th>Barcode</th><th>Title</th><th>Author</th><th>Status</th></tr></thead>
      <tbody>${groups[g].map(i => {
        const loan = activeLoanForItem(i.id);
        const p = loan ? patronById(loan.patronId) : null;
        return `<tr><td>${esc(i.barcode)}</td><td>${esc(i.title)}</td><td>${esc(i.author)}</td><td>${loan ? 'Out — ' + esc(p ? p.name : '?') : 'Shelf'}</td></tr>`;
      }).join('')}</tbody>
    </table>`).join('')}
    <p class="notice-foot">Printed ${esc(fmtDateFull(nowISO()))}</p>
  </section>`;
  printHTML(html);
}

/* ----------------------------- spine labels -----------------------------
   0.66in wide, 1in tall: the genre drawing, its name in small type, the
   call letters big enough to read on a shelf, and the barcode number for
   the desk. Printed butt-joined on a full label sheet so one cut with a
   paper trimmer serves both neighbours.
   ----------------------------------------------------------------------- */

const LABELS_PER_ROW = 11;

/* The order labels come off the sheet should match the order the books are
   stacked when you sit down to stick them on. */
const LABEL_ORDERS = [
  ['barcode', 'Barcode number — the order you catalogued them',
    (a, b) => normCode(a.barcode).localeCompare(normCode(b.barcode), undefined, { numeric: true })],
  ['genre', 'Genre, then title — one bin at a time',
    (a, b) => normName(a.genre || '~').localeCompare(normName(b.genre || '~')) || byTitle(a, b)],
  ['title', 'Title', byTitle],
  ['author', 'Author, then title',
    (a, b) => normName(a.author || '~').localeCompare(normName(b.author || '~')) || byTitle(a, b)]
];

function labelHTML(item) {
  return `<div class="spine-label">
    <span class="sl-art">${genreArt(item.genre, '0.26in')}</span>
    <span class="sl-genre">${esc(item.genre || '').replace(/-/g, '\u2011')}</span>
    <span class="sl-code">${esc(callLetters(item.title))}</span>
    <span class="sl-num">${esc(item.barcode)}</span>
  </div>`;
}

function printLabels(items, skip) {
  const blanks = Array(Math.max(0, skip || 0)).fill('<div class="spine-label blank"></div>').join('');
  printHTML(`<div class="label-sheet">${blanks}${items.map(labelHTML).join('')}</div>`);
}

/* Books with no genre: ask the lookup services what they are, and take the
   top suggestion. Flagged as a guess so they can be checked later. */
async function guessMissingGenres(items, say) {
  const todo = items.filter(i => !i.genre && i.isbn);
  const noIsbn = items.filter(i => !i.genre && !i.isbn).length;
  const done = [];
  let offline = false;
  for (let i = 0; i < todo.length; i++) {
    say('Looking up ' + (i + 1) + ' of ' + todo.length + '…');
    try {
      const data = await lookupISBN(todo[i].isbn);
      const g = data && suggestGenres(data.subjects, S().genres)[0];
      if (g) { updateItem(todo[i].id, { genre: g, genreGuessed: true }); done.push(todo[i].title + ' → ' + g); }
    } catch (e) { offline = true; break; }
  }
  return { done: done, offline: offline, noIsbn: noIsbn, tried: todo.length };
}

/* Keeps only the books whose barcode number falls between the two ends,
   either of which may be left blank for "no limit". */
function withinBarcodeRange(items, fromText, toText) {
  const from = barcodeNumber(fromText), to = barcodeNumber(toText);
  if (from === null && to === null) return items;
  return items.filter(i => {
    const n = barcodeNumber(i.barcode);
    if (n === null) return false;              // nothing to compare against
    return (from === null || n >= from) && (to === null || n <= to);
  });
}

function openLabelsModal() {
  const listed = currentCatalogItems();
  const scopes = [
    ['listed', 'The ' + plural(listed.length, 'book') + ' listed in the catalog now', listed],
    ['all', 'Every book (' + DB.items.length + ')', DB.items.slice()]
  ];

  function draw(scopeKey, skip, summary, orderKey, fromText, toText) {
    const scope = scopes.find(x => x[0] === scopeKey) || scopes[0];
    const order = LABEL_ORDERS.find(o => o[0] === orderKey) || LABEL_ORDERS[0];
    const inRange = withinBarcodeRange(scope[2], fromText, toText);
    const items = inRange.slice().sort(order[2]);
    const backwards = barcodeNumber(fromText) !== null && barcodeNumber(toText) !== null
      && barcodeNumber(fromText) > barcodeNumber(toText);
    const missing = items.filter(i => !i.genre).length;
    openModal('Print spine labels', `
      <label class="field"><span>Which books</span>
        <select name="scope">${scopes.map(x => `<option value="${x[0]}" ${x[0] === scopeKey ? 'selected' : ''}>${esc(x[1])}</option>`).join('')}</select>
      </label>
      <div class="grid-2">
        ${field('Barcodes from', 'from', fromText || '', { placeholder: 'first' })}
        ${field('up to and including', 'to', toText || '', { placeholder: 'last' })}
      </div>
      <p class="hint" id="range-note">${backwards
        ? 'The first number is higher than the second.'
        : (barcodeNumber(fromText) !== null || barcodeNumber(toText) !== null)
          ? esc(plural(items.length, 'book') + ' of the ' + scope[2].length + ' selected fall in that range.')
          : 'Leave these blank for all of them, or set one end to run from or up to a number.'}</p>
      <label class="field"><span>In what order</span>
        <select name="order">${LABEL_ORDERS.map(o => `<option value="${o[0]}" ${o[0] === order[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Skip this many spaces on the sheet</span>
        <input name="skip" type="number" min="0" max="109" value="${skip}">
      </label>
      <p class="hint">Starts at the top-left of the sheet. Skip spaces to carry on down a part-used sheet.</p>
      ${summary ? `<p class="note">${esc(summary)}</p>` : ''}
      ${missing ? `<p class="note" id="guess-note">${plural(missing, 'book has', 'books have')} no genre, so ${missing === 1 ? 'its label' : 'their labels'} would print without a picture.
        <button type="button" class="btn" id="guess-genres">Guess from the internet</button></p>` : ''}
      <h3 class="section-title">How they will print — actual size</h3>
      <div class="label-preview">${items.slice(0, 5).map(labelHTML).join('') || '<p class="muted">No books to label.</p>'}</div>
      <div class="actions">
        <button type="button" class="btn btn-primary" id="do-print" ${items.length ? '' : 'disabled'}>Print ${plural(items.length, 'label')}</button>
        <button type="button" class="btn btn-quiet" data-close>Cancel</button>
      </div>
      <p class="hint">Print onto full-sheet label paper, then cut along the guide lines. ${LABELS_PER_ROW} across, 10 down — ${LABELS_PER_ROW * 10} to a sheet.</p>
    `, body => {
      const scopeSel = body.querySelector('[name="scope"]');
      const skipInput = body.querySelector('[name="skip"]');
      const orderSel = body.querySelector('[name="order"]');
      const fromInput = body.querySelector('[name="from"]');
      const toInput = body.querySelector('[name="to"]');
      const redraw = () => draw(scopeSel.value, Math.max(0, Number(skipInput.value) || 0), summary,
        orderSel.value, fromInput.value, toInput.value);
      scopeSel.addEventListener('change', redraw);
      skipInput.addEventListener('change', redraw);
      orderSel.addEventListener('change', redraw);
      // A full redraw on every keystroke would steal the cursor, so while someone
      // is still typing a number only the count and the button are updated.
      [fromInput, toInput].forEach(input => {
        input.addEventListener('change', redraw);
        input.addEventListener('input', () => {
          const picked = withinBarcodeRange(scope[2], fromInput.value, toInput.value);
          const note = body.querySelector('#range-note');
          const high = barcodeNumber(fromInput.value), low = barcodeNumber(toInput.value);
          note.textContent = (high !== null && low !== null && high > low)
            ? 'The first number is higher than the second.'
            : (high !== null || low !== null)
              ? plural(picked.length, 'book') + ' of the ' + scope[2].length + ' selected fall in that range.'
              : 'Leave these blank for all of them, or set one end to run from or up to a number.';
          const go = body.querySelector('#do-print');
          go.textContent = 'Print ' + plural(picked.length, 'label');
          go.disabled = !picked.length;
        });
      });
      body.querySelector('#do-print').addEventListener('click', () => {
        // Read the boxes again in case they were typed in and never left.
        const picked = withinBarcodeRange(scope[2], fromInput.value, toInput.value).slice().sort(order[2]);
        if (!picked.length) { toast('No books in that range.', 'error'); return; }
        closeModal();
        printLabels(picked, Math.max(0, Number(skipInput.value) || 0));
      });
      const guess = body.querySelector('#guess-genres');
      if (guess) guess.addEventListener('click', async () => {
        guess.disabled = true;
        const res = await guessMissingGenres(items, msg => { guess.textContent = msg; });
        render();
        draw(scopeSel.value, Math.max(0, Number(skipInput.value) || 0),
          (res.done.length ? 'Filled in ' + plural(res.done.length, 'genre') + ': ' + res.done.join(', ') + '. Worth checking in the catalog.' : 'No genres could be worked out.') +
          (res.offline ? ' The lookup services could not be reached, so the rest were left alone.' : '') +
          (res.noIsbn ? ' ' + plural(res.noIsbn, 'book has', 'books have') + ' no ISBN to look up — set those by hand.' : ''),
          orderSel.value, fromInput.value, toInput.value);
      });
    });
  }
  draw('listed', 0, '', 'barcode', '', '');
}

/* ============================ SAMPLE DATA ============================ */

function loadSampleData() {
  const books = [
    ['Charlotte’s Web', 'E. B. White', '9780064400558', '1952', 'Fantasy / Sci-Fi'],
    ['Bridge to Terabithia', 'Katherine Paterson', '9780064401845', '1977', 'Realistic Fiction'],
    ['Holes', 'Louis Sachar', '9780440414803', '1998', 'Adventure'],
    ['The Giver', 'Lois Lowry', '9780544336261', '1993', 'Dystopian'],
    ['Brown Girl Dreaming', 'Jacqueline Woodson', '9780147515827', '2014', 'Biography'],
    ['Wonder', 'R. J. Palacio', '9780375869020', '2012', 'Realistic Fiction'],
    ['Hatchet', 'Gary Paulsen', '9781416936473', '1986', 'Adventure'],
    ['Esperanza Rising', 'Pam Muñoz Ryan', '9780439120425', '2000', 'Historical Fiction']
  ];
  books.forEach(b => addItem({ title: b[0], author: b[1], isbn: b[2], year: b[3], genre: b[4] }));
  ['Ava Nguyen', 'Marcus Bell', 'Priya Raman', 'Sam Ortiz'].forEach(n => addPatron(n));

  // A couple of live loans, one of them already late.
  const [a, m] = [findPatronByName('Ava Nguyen'), findPatronByName('Marcus Bell')];
  const holes = DB.items.find(i => i.title === 'Holes');
  const giver = DB.items.find(i => i.title === 'The Giver');
  if (a && holes) checkout(holes.id, a.id);
  if (m && giver) {
    checkout(giver.id, m.id);
    const l = activeLoanForItem(giver.id);
    if (l) {
      l.dueAt = endOfDay(addDays(new Date(), -5)).toISOString();
      l.checkedOutAt = addDays(new Date(), -19).toISOString();
    }
  }
  const priya = findPatronByName('Priya Raman');
  if (priya && holes) placeHold(holes.id, priya.id);
  DB.activity = [];
  saveDB();
}

/* =============================== BOOT =============================== */

render();
if (route === 'circulation') focusScan();

/* Opened from a pairing link: set this computer up without anyone typing. */
if (!Sync.configured() && Sync.handedOver()) connectWithKey(Sync.handedOver());

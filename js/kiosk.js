/* ---------------------------------------------------------------
   Student station. A student types their name (new names are added
   on the spot), then scans books to check them out or return them,
   and can find a book and get in line for it.

   Built for a shared classroom device: big targets, one box that
   takes either typing or a barcode scan, nobody else's borrowing
   is ever shown, and it signs the student out after a quiet spell.
   --------------------------------------------------------------- */

const IDLE_SECONDS = 90;
const K = { student: null, result: null, idle: null };
const main = document.getElementById('kiosk');

/* ------------------------------ screens ------------------------------ */

function kRender() {
  document.getElementById('brand-name').textContent = S().libraryName || 'Library';
  document.title = S().libraryName || 'Library';
  renderSyncPill();

  if (K.student) K.student = patronById(K.student.id); // merged or deleted meanwhile
  const hasLocal = DB.items.length > 0;

  if (!Sync.configured() && !hasLocal) screenSetup();
  else if (Sync.configured() && !Sync.hasEverSynced()) screenLoading();
  else if (!K.student) screenWelcome();
  else screenStudent();
  mountResult();
}

/* A redraw (e.g. when another device's changes arrive) rebuilds the result card from
   K.result, so its buttons have to be wired up again every time. */
function mountResult() {
  const box = document.getElementById('k-result');
  if (box && K.result && K.result.mount) K.result.mount(box);
}

function screenSetup(message) {
  main.innerHTML = `
  <section class="k-card k-setup">
    <h1>Set up the student station</h1>
    <p>Teacher: paste the library's GitHub access key to connect this device. Students never see it.</p>
    <label class="field"><span>GitHub access key</span>
      <input id="k-key" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
    <div class="actions"><button class="btn btn-primary" id="k-connect">Connect</button></div>
    <p class="danger" id="k-setup-msg">${esc(message || '')}</p>
  </section>`;
  const input = document.getElementById('k-key');
  const btn = document.getElementById('k-connect');
  const go = async () => {
    btn.disabled = true; btn.textContent = 'Connecting…';
    try {
      const res = await Sync.connect(input.value);
      if (res.next === 'ask') {
        const keep = confirm('This device already has a library of its own.\n\nOK = add it to the shared library.\nCancel = use only the shared library.');
        Sync.adopt(res.summary, keep ? 'merge' : 'shared');
      }
      await Sync.syncNow();
      const st = Sync.status();
      if (st.state !== 'ok') throw new Error(st.detail);
      kRender();
    } catch (e) {
      screenSetup(e.message);
    }
  };
  btn.addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  input.focus();
}

function screenLoading() {
  const st = Sync.status();
  main.innerHTML = `
  <section class="k-card k-center">
    <h1>Loading the library…</h1>
    ${st.detail ? `<p class="danger">${esc(st.detail)}</p><p class="muted">Ask your teacher.</p>` : '<p class="muted">One moment.</p>'}
  </section>`;
}

function screenWelcome() {
  main.innerHTML = `
  <section class="k-welcome">
    <h1>Welcome to the ${esc(S().libraryName || 'library')}!</h1>
    <p class="k-lead">Type your name to borrow a book — or scan a book to return it.</p>
    <div class="k-box">
      <input id="k-input" class="k-input" autocomplete="off" spellcheck="false"
             placeholder="Your name, or scan a book" aria-label="Your name, or scan a book"
             role="combobox" aria-controls="k-suggest" aria-expanded="false">
      <ul id="k-suggest" class="k-suggest" role="listbox" hidden></ul>
    </div>
    <div id="k-result">${resultHTML()}</div>
  </section>`;
  const input = document.getElementById('k-input');
  wireNameBox(input);
  input.focus();
}

function screenStudent() {
  const me = K.student;
  const mine = activeLoansForPatron(me.id).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const waiting = openHolds().filter(h => h.patronId === me.id);
  const ready = readyHolds().filter(h => h.patronId === me.id);
  const first = me.name.split(' ')[0];

  main.innerHTML = `
  <section class="k-student">
    <div class="k-hello">
      <h1>Hi, ${esc(first)}!</h1>
      <button class="btn k-done" id="k-done">I'm done</button>
    </div>
    ${ready.map(h => {
      const it = itemById(h.itemId);
      return `<p class="k-banner">🎉 <strong>${esc(it ? it.title : 'A book')}</strong> is back, and it's being saved for you. Ask your teacher for it!</p>`;
    }).join('')}
    <div class="k-box">
      <input id="k-input" class="k-input" autocomplete="off" spellcheck="false"
             placeholder="Scan a book — or type a title to find one" aria-label="Scan a book, or type a title to find one">
    </div>
    <div id="k-result">${resultHTML()}</div>
    <div class="k-columns">
      <section>
        <h2>Your books</h2>
        ${mine.length ? `<ul class="k-list">${mine.map(l => {
          const it = itemById(l.itemId);
          const late = isOverdue(l);
          return `<li>${coverImg(it)}<span class="k-list-text"><strong>${esc(it ? it.title : '?')}</strong>
            <span class="${late ? 'danger strong' : 'muted'}">${late ? 'Overdue — please bring it back' : 'Due ' + esc(fmtDateFull(l.dueAt))}</span></span></li>`;
        }).join('')}</ul>` : '<p class="muted">You don\'t have any books right now.</p>'}
      </section>
      <section>
        <h2>Books you're waiting for</h2>
        ${waiting.length ? `<ul class="k-list">${waiting.map(h => {
          const it = itemById(h.itemId);
          const isReady = ready.some(r => r.id === h.id);
          const pos = holdsForItem(h.itemId).findIndex(x => x.id === h.id) + 1;
          return `<li>${coverImg(it)}<span class="k-list-text"><strong>${esc(it ? it.title : '?')}</strong>
            <span class="muted">${isReady ? 'Ready for you!' : pos === 1 ? 'You\'re next in line' : 'Number ' + pos + ' in line'}</span></span>
            <button class="link" data-hold-cancel="${h.id}">Cancel</button></li>`;
        }).join('')}</ul>` : '<p class="muted">Find a book above and get in line if it\'s checked out.</p>'}
      </section>
    </div>
  </section>`;

  document.getElementById('k-done').addEventListener('click', signOut);
  const input = document.getElementById('k-input');
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value.trim();
    input.value = '';
    if (v) studentScan(v);
  });
  main.querySelectorAll('[data-hold-cancel]').forEach(b => b.addEventListener('click', () => {
    cancelHold(b.dataset.holdCancel);
    K.result = { tone: 'info', html: 'Okay — you\'re out of line for that book.' };
    kRender();
  }));
  input.focus();
}

/* ------------------------------ results ------------------------------ */

function resultHTML() {
  const r = K.result;
  if (!r) return '';
  return `<div class="k-result ${r.tone}">${r.html}${r.actions ? `<div class="actions">${r.actions}</div>` : ''}</div>`;
}

function showResult(tone, html, actions, onMount) {
  K.result = { tone: tone, html: html, actions: actions, mount: onMount };
  const box = document.getElementById('k-result');
  if (box) { box.innerHTML = resultHTML(); mountResult(); }
}

function coverImg(it) {
  if (it && it.cover) return `<img class="cover-sm" src="${esc(it.cover)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  return '<span class="cover-sm cover-blank" aria-hidden="true">📕</span>';
}

/* A scanner types letters/digits with no spaces; people type titles with spaces. */
function looksScanned(v) { return /^[\w-]+$/.test(v) && /\d/.test(v); }

/* ------------------------------ welcome: name box ------------------------------ */

function wireNameBox(input) {
  const list = document.getElementById('k-suggest');
  let options = [];

  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }

  function draw() {
    const q = input.value.trim();
    if (!q || findItemByCode(q)) { close(); return; }
    options = searchPatrons(q, 6);
    if (!options.length) { close(); return; }
    list.innerHTML = options.map((p, i) =>
      `<li role="option"><button type="button" data-i="${i}">${esc(p.name)}${p.group ? ` <span class="muted">· ${esc(p.group)}</span>` : ''}</button></li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  input.addEventListener('input', () => { K.result = null; const box = document.getElementById('k-result'); if (box) box.innerHTML = ''; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && !list.hidden) { e.preventDefault(); const b = list.querySelector('button'); if (b) b.focus(); }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    const item = findItemByCode(v);
    if (item) { input.value = ''; close(); returnFromWelcome(item); return; }
    const exact = findPatronByName(v);
    if (exact) { signIn(exact); return; }
    if (looksScanned(v)) { close(); input.value = ''; showResult('warn', 'That book isn\'t in our library yet. Please give it to your teacher.'); return; }
    close();
    offerNewStudent(v);
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (b) signIn(options[Number(b.dataset.i)]);
  });
  list.addEventListener('keydown', e => {
    const buttons = Array.from(list.querySelectorAll('button'));
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (buttons[i + 1] || buttons[i]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? buttons[i - 1] : input).focus(); }
  });
}

/* A name nobody has used: ask before adding, so a typo doesn't become a second student. */
function offerNewStudent(typed) {
  const name = tidyName(typed);
  const close = searchPatrons(typed, 3);
  if (!S().autoCreatePatrons) {
    showResult('warn', `We don't have a <strong>${esc(name)}</strong> yet. Ask your teacher to add you.`);
    return;
  }
  showResult('info',
    (close.length ? `Did you mean one of these?` : `Is this your first time borrowing? We'll add you as <strong>${esc(name)}</strong>.`),
    (close.length ? close.map((p, i) => `<button class="btn" data-pick="${i}">${esc(p.name)}</button>`).join('') : '') +
    `<button class="btn ${close.length ? '' : 'btn-primary'}" data-new="1">${close.length ? 'No — I\'m new: ' + esc(name) : 'Yes, add me'}</button>
     <button class="btn btn-quiet" data-fix="1">Let me fix my name</button>`,
    box => {
      box.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => signIn(close[Number(b.dataset.pick)])));
      box.querySelector('[data-new]').addEventListener('click', () => {
        const res = addPatron(name);
        if (!res.ok) { showResult('warn', esc(res.error)); return; }
        signIn(res.patron, !res.existed);
      });
      box.querySelector('[data-fix]').addEventListener('click', () => {
        K.result = null;
        box.innerHTML = '';
        const input = document.getElementById('k-input');
        input.focus();
        input.select();
      });
      const primary = box.querySelector('.btn-primary');
      if (primary) primary.focus();
    });
}

function returnFromWelcome(item) {
  const loan = activeLoanForItem(item.id);
  if (!loan) { showResult('info', `<strong>${esc(item.title)}</strong> is already checked in — you can put it back on the shelf${shelfHint(item)}.`); return; }
  const res = checkin(item.id);
  if (!res.ok) { showResult('warn', esc(res.error)); return; }
  showResult('ok', returnedMessage(item, res));
  clearResultSoon();
}

function returnedMessage(item, res) {
  if (res.nextHold) return `✓ Returned <strong>${esc(item.title)}</strong>. Someone is waiting for it — please give it to your teacher instead of the shelf.`;
  return `✓ Returned <strong>${esc(item.title)}</strong>. Thank you! Put it back on the shelf${shelfHint(item)}.`;
}

function shelfHint(item) {
  return item.genre ? ` with the <strong>${esc(item.genre)}</strong> books` : '';
}

/* ------------------------------ signed in ------------------------------ */

function signIn(patron, isNew) {
  K.student = patron;
  K.result = isNew ? { tone: 'ok', html: `Welcome, <strong>${esc(patron.name)}</strong>! You're all set. Scan a book to borrow it.` } : null;
  kRender();
}

function signOut() {
  K.student = null;
  K.result = null;
  kRender();
}

function studentScan(v) {
  const me = K.student;
  const item = findItemByCode(v);
  if (!item) {
    if (looksScanned(v)) { showResult('warn', 'That book isn\'t in our library yet. Please give it to your teacher.'); return; }
    showSearch(v);
    return;
  }
  const loan = activeLoanForItem(item.id);

  if (loan && loan.patronId === me.id) {
    const res = checkin(item.id);
    if (!res.ok) { showResult('warn', esc(res.error)); return; }
    K.result = { tone: 'ok', html: returnedMessage(item, res) };
    kRender();
    return;
  }

  if (loan) {
    showResult('info',
      `<strong>${esc(item.title)}</strong> is checked out by someone else right now. ` +
        (isOverdue(loan) ? 'It should be back soon.' : `It's due back ${esc(fmtDateFull(loan.dueAt))}.`),
      `<button class="btn btn-primary" data-hold="1">Get in line for it</button>
       <button class="btn" data-return="1">I'm returning it for them</button>`,
      box => {
        box.querySelector('[data-hold]').addEventListener('click', () => doHold(item));
        box.querySelector('[data-return]').addEventListener('click', () => {
          const res = checkin(item.id);
          K.result = { tone: res.ok ? 'ok' : 'warn', html: res.ok ? returnedMessage(item, res) : esc(res.error) };
          kRender();
        });
      });
    return;
  }

  const res = checkout(item.id, me.id);
  if (!res.ok) {
    // Limits and other people's holds are the teacher's call, never the student's.
    const msg = /limit/.test(res.error) || /already has/.test(res.error)
      ? `You already have ${plural(activeLoansForPatron(me.id).length, 'book')} out. Return one before borrowing another, or ask your teacher.`
      : /on hold/.test(res.error)
        ? `<strong>${esc(item.title)}</strong> is being saved for someone who asked for it first. Please give it to your teacher.`
        : esc(res.error);
    showResult('warn', msg);
    return;
  }
  K.result = { tone: 'ok', html: `📖 You checked out <strong>${esc(item.title)}</strong>! It's due ${esc(fmtDateFull(res.loan.dueAt))}.` };
  kRender();
}

function doHold(item) {
  const res = placeHold(item.id, K.student.id);
  if (!res.ok) { showResult('warn', esc(res.error)); return; }
  K.result = res.available
    ? { tone: 'info', html: `<strong>${esc(item.title)}</strong> is on the shelf right now${shelfHint(item)} — go grab it and scan it here!` }
    : { tone: 'ok', html: res.position === 1
        ? `You're next in line for <strong>${esc(item.title)}</strong>. We'll show it here when it's back.`
        : `You're number ${res.position} in line for <strong>${esc(item.title)}</strong>.` };
  kRender();
}

function showSearch(q) {
  const me = K.student;
  const found = searchItems(q).slice(0, 8);
  if (!found.length) { showResult('info', `No books match “${esc(q)}”. Try part of the title or the author's name.`); return; }
  const rows = found.map(it => {
    const loan = activeLoanForItem(it.id);
    const mineOut = loan && loan.patronId === me.id;
    const inLine = holdsForItem(it.id).findIndex(h => h.patronId === me.id) + 1;
    let status, action = '';
    if (mineOut) status = 'You have this one';
    else if (!loan) status = 'On the shelf' + (it.genre ? ` — look in <strong>${esc(it.genre)}</strong>` : '');
    else if (inLine) status = `Checked out · you're number ${inLine} in line`;
    else {
      status = 'Checked out · ' + (isOverdue(loan) ? 'should be back soon' : 'back ' + esc(fmtDate(loan.dueAt)));
      action = `<button class="btn" data-hold-item="${it.id}">Get in line</button>`;
    }
    return `<li>${coverImg(it)}<span class="k-list-text"><strong>${esc(it.title)}</strong>
      <span class="muted">${esc(it.author || '')}</span><span>${status}</span></span>${action}</li>`;
  }).join('');
  showResult('plain', `<ul class="k-list">${rows}</ul>`, '', box => {
    box.querySelectorAll('[data-hold-item]').forEach(b => b.addEventListener('click', () => doHold(itemById(b.dataset.holdItem))));
  });
}

let clearTimer = null;
function clearResultSoon() {
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (K.student) return;
    K.result = null;
    const box = document.getElementById('k-result');
    if (box) box.innerHTML = '';
  }, 8000);
}

/* ------------------------------ sync + idle ------------------------------ */

function renderSyncPill() {
  const pill = document.getElementById('sync-pill');
  const d = Sync.describe();
  // Students only need to know when something is wrong.
  pill.hidden = !(d.tone === 'warn' || d.tone === 'error');
  pill.className = 'sync-pill ' + d.tone;
  pill.textContent = d.tone === 'error' ? 'Not syncing — tell your teacher' : d.text;
}

window.addEventListener('sync:status', () => {
  renderSyncPill();
  if (Sync.configured() && !K.student && main.querySelector('.k-center')) kRender(); // loading → ready
});

/* New data from another device or tab: redraw, unless someone is typing. */
let redrawPending = false;
function refresh() {
  const a = document.activeElement;
  if (a && main.contains(a) && a.tagName === 'INPUT' && a.value) { redrawPending = true; return; }
  kRender();
}
window.addEventListener('library:reloaded', refresh);
main.addEventListener('focusout', () => setTimeout(() => {
  if (!redrawPending) return;
  const a = document.activeElement;
  if (a && main.contains(a) && a.tagName === 'INPUT' && a.value) return;
  redrawPending = false;
  kRender();
}, 0));

/* A shared device: sign the student out after a quiet spell. */
function poke() {
  clearTimeout(K.idle);
  K.idle = setTimeout(() => {
    if (K.student || K.result) { K.student = null; K.result = null; kRender(); }
  }, IDLE_SECONDS * 1000);
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, poke, true));

/* Keep the cursor in the box so a scan always lands somewhere. */
document.addEventListener('click', e => {
  if (e.target.closest('button, a, input, select, textarea, label')) return;
  const input = document.getElementById('k-input');
  if (input) input.focus();
});

kRender();
poke();

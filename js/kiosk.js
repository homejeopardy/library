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
    <p>Teacher: on the computer that runs the library, go to <strong>Settings → Sync across devices →
      Set up another device</strong> and open the student station link here. Nothing needs typing.</p>
    <p class="hint">Or paste the access key by hand. Students never see it.</p>
    <form class="key-form" autocomplete="on" id="k-form">
      <input class="sr-only" type="text" name="username" value="Classroom Library key"
             autocomplete="username" readonly tabindex="-1" aria-hidden="true">
      <label class="field"><span>GitHub access key</span>
        <input id="k-key" name="password" type="password" autocomplete="current-password"
               spellcheck="false" placeholder="github_pat_…"></label>
      <div class="actions"><button type="submit" class="btn btn-primary" id="k-connect">Connect</button></div>
    </form>
    <p class="danger" id="k-setup-msg">${esc(message || '')}</p>
  </section>`;
  const input = document.getElementById('k-key');
  const btn = document.getElementById('k-connect');
  const go = async (key, which) => {
    which = which || btn;
    which.disabled = true; which.textContent = 'Connecting…';
    try {
      const res = await Sync.connect(key != null ? key : input.value);
      if (res.next === 'ask') {
        const keep = confirm('This device already has a library of its own.\n\nOK = add it to the shared library.\nCancel = use only the shared library.');
        Sync.adopt(res.summary, keep ? 'merge' : 'shared');
      }
      await Sync.syncNow();
      const st = Sync.status();
      if (st.state !== 'ok') throw new Error(st.detail);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (err) { /* not supported */ }
      kRender();
    } catch (e) {
      screenSetup(e.message);
    }
  };
  document.getElementById('k-form').addEventListener('submit', e => { e.preventDefault(); go(); });
  // Arrived from a pairing link: connect without anyone touching the keyboard.
  if (Sync.handedOver()) go(Sync.handedOver(), btn);
  else input.focus();
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
    ${genreTilesHTML()}
  </section>`;
  const input = document.getElementById('k-input');
  wireNameBox(input);
  wireBrowse();
  input.focus();
}

/* Tiles for a student with nothing particular in mind. */
function genreTilesHTML() {
  const counts = {};
  DB.items.forEach(i => {
    if (!i.genre || i.status || activeLoanForItem(i.id)) return;
    counts[i.genre] = (counts[i.genre] || 0) + 1;
  });
  const genres = Object.keys(counts).sort();
  if (!genres.length) return '';
  return `<div class="k-browse">
    <span class="k-browse-head">Browse the shelves</span>
    <div class="k-tiles">
      ${genres.map(g => `<button type="button" class="k-tile" data-browse="${esc(g)}">
        ${genreArt(g, 26)}<span class="k-tile-name">${esc(g)}</span><span class="k-tile-count">${counts[g]} in</span>
      </button>`).join('')}
      <button type="button" class="k-tile k-tile-wish" data-wish="1">＋<span class="k-tile-name">Ask for a book</span></button>
    </div>
  </div>`;
}

function wireBrowse() {
  main.querySelectorAll('[data-browse]').forEach(b => b.addEventListener('click', () => showGenre(b.dataset.browse)));
  const wish = main.querySelector('[data-wish]');
  if (wish) wish.addEventListener('click', askForBook);
}

function showGenre(genre) {
  const here = DB.items.filter(i => normName(i.genre) === normName(genre) && !i.status && !activeLoanForItem(i.id));
  const read = new Set(K.student ? loansForPatron(K.student.id).map(l => l.itemId) : []);
  const picks = here.map(i => ({ item: i, rating: itemRating(i.id) }))
    .sort((a, b) => (read.has(a.item.id) ? 1 : 0) - (read.has(b.item.id) ? 1 : 0) ||
      (b.rating ? b.rating.avg : 0) - (a.rating ? a.rating.avg : 0) || byTitle(a.item, b.item));
  showResult('plain', `<span class="k-also-head">${esc(genre)} — ${plural(here.length, 'book')} on the shelf now</span>
    <ul class="k-list">${picks.slice(0, 12).map(p => `<li>${coverImg(p.item)}<span class="k-list-text">
      <strong>${esc(p.item.title)}</strong><span class="muted">${esc(p.item.author || '')}</span>
      ${p.rating ? `<span class="k-rating">${starsHTML(p.rating.avg)} <span class="muted">${p.rating.avg.toFixed(1)}</span></span>` : ''}
      ${read.has(p.item.id) ? '<span class="muted">you have read this</span>' : ''}
      ${p.item.shelfId && shelfById(p.item.shelfId) ? `<span class="muted">Shelf <strong>${esc(shelfById(p.item.shelfId).code)}</strong></span>` : ''}
    </span></li>`).join('')}</ul>
    ${picks.length > 12 ? `<p class="muted">…and ${picks.length - 12} more. Type a title above to find one.</p>` : ''}`);
}

function askForBook() {
  showResult('info', `<span class="k-rate-ask">Is there a book you wish we had?</span>
    <div class="k-box"><input id="k-wish" class="k-input" placeholder="Book title, and the author if you know it" autocomplete="off"></div>`,
    `<button type="button" class="btn btn-primary" data-send="1">Ask for it</button>`,
    box => {
      const input = box.querySelector('#k-wish');
      const send = () => {
        const res = addRequest(input.value, K.student ? K.student.id : null);
        if (!res.ok) { toast(res.error, 'error'); input.focus(); return; }
        showResult('ok', res.seconded
          ? `Someone had already asked for <strong>${esc(res.request.what)}</strong> — you have added your name to it.`
          : `Thanks! <strong>${esc(res.request.what)}</strong> is on the list for your teacher to see.`);
      };
      box.querySelector('[data-send]').addEventListener('click', send);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
      input.focus();
    });
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
      return `<p class="k-banner">🎉 <strong>${esc(it ? it.title : 'A book')}</strong> is back, and it's being saved for you.
        ${S().holdSpot ? 'Look on ' + esc(S().holdSpot) + '.' : 'Ask your teacher for it!'}</p>`;
    }).join('')}
    <div class="k-box">
      <input id="k-input" class="k-input" autocomplete="off" spellcheck="false"
             placeholder="Scan a book — or type a title to find one" aria-label="Scan a book, or type a title to find one">
    </div>
    <div id="k-result">${resultHTML()}</div>
    ${genreTilesHTML()}
    <div class="k-columns">
      <section>
        <h2>Your books</h2>
        ${mine.length ? `<ul class="k-list">${mine.map(l => {
          const it = itemById(l.itemId);
          const late = isOverdue(l);
          const renewable = (S().maxRenewals < 0 || (l.renewals || 0) < S().maxRenewals) && !nextHoldForItem(l.itemId);
          return `<li>${coverImg(it)}<span class="k-list-text"><strong>${esc(it ? it.title : '?')}</strong>
            <span class="${late ? 'danger strong' : 'muted'}">${late ? 'Overdue — please bring it back' : 'Due ' + esc(fmtDateFull(l.dueAt))}</span>
            ${l.renewals ? `<span class="muted">Kept on ${l.renewals} time${l.renewals > 1 ? 's' : ''}</span>` : ''}</span>
            ${renewable ? `<button class="btn" data-renew="${l.id}">Keep it longer</button>`
              : `<span class="muted small">${nextHoldForItem(l.itemId) ? 'someone is waiting' : 'cannot be kept again'}</span>`}</li>`;
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
  wireBrowse();
  main.querySelectorAll('[data-renew]').forEach(b => b.addEventListener('click', () => {
    const res = renew(b.dataset.renew);
    if (!res.ok) {
      K.result = { tone: 'warn', html: /waiting|hold/i.test(res.error)
        ? 'Someone else is waiting for that one, so it needs to come back.'
        : "You've kept that one as long as you can. Bring it in and your teacher can help." };
    } else {
      K.result = { tone: 'ok', html: `Kept until <strong>${esc(fmtDateFull(res.loan.dueAt))}</strong>.` };
    }
    kRender();
  }));
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
  if (item.status) { showResult('warn', `<strong>${esc(item.title)}</strong> is marked ${esc(statusLabel(item.status).toLowerCase())} — please give it to your teacher.`); return; }
  const loan = activeLoanForItem(item.id);
  if (!loan) { showResult('info', `<strong>${esc(item.title)}</strong> is already checked in.` + putItBackHTML(item)); return; }
  const res = checkin(item.id);
  if (!res.ok) { showResult('warn', esc(res.error)); return; }
  showResult('ok', returnedMessage(item, res));
  clearResultSoon();
}

function returnedMessage(item, res) {
  if (res.nextHold) return `✓ Returned <strong>${esc(item.title)}</strong>. Someone is waiting for it —
    ${S().holdSpot ? 'please put it on <strong>' + esc(S().holdSpot) + '</strong>' : 'please give it to your teacher'} instead of the shelf.`;
  return `✓ Returned <strong>${esc(item.title)}</strong>. Thank you!` + putItBackHTML(item);
}

/* Where this goes, in type a student can read while holding the book. */
function putItBackHTML(item) {
  const shelf = item.shelfId && typeof shelfById === 'function' ? shelfById(item.shelfId) : null;
  if (!shelf && !item.genre) return ' Put it back on the shelf.';
  return `<div class="k-putback">
    <span class="k-putback-say">Put it back${shelf ? ' on' : ' with the'}</span>
    ${shelf ? `<span class="k-putback-code">${esc(shelf.code)}</span>` : ''}
    <span class="k-putback-genre">${genreArt(item.genre, 26)}${esc(item.genre || '')}</span>
    ${shelf && shelf.name ? `<span class="k-putback-where">${esc(shelf.name)}</span>` : ''}
  </div>`;
}

function shelfHint(item) {
  const shelf = item.shelfId && typeof shelfById === 'function' ? shelfById(item.shelfId) : null;
  if (shelf) return ` on shelf <strong>${esc(shelf.code)}</strong>${item.genre ? ' with the ' + esc(item.genre) + ' ' + genreArt(item.genre, 15) + ' books' : ''}`;
  return item.genre ? ` with the <strong>${esc(item.genre)}</strong> ${genreArt(item.genre, 15)} books` : '';
}

/* The moment a student finishes a book is the only moment they will
   reliably rate it, so the prompt rides along with the return. */
function ratePromptHTML(item) {
  const mine = reviewBy(item.id, K.student.id);
  return `<div class="k-rate" data-item="${item.id}">
    <span class="k-rate-ask">${mine ? 'You rated this' : 'How was it?'}</span>
    <span class="k-stars">${[1, 2, 3, 4, 5].map(n =>
      `<button type="button" class="k-star ${mine && n <= mine.stars ? 'on' : ''}" data-star="${n}"
         aria-label="${n} star${n > 1 ? 's' : ''}">\u2605</button>`).join('')}</span>
  </div>`;
}

/* What to read next, offered at the one moment a student is between books. */
function alsoLikedHTML(item) {
  const picks = similarBooks(item.id, K.student.id, 3);
  if (!picks.length) return '';
  const sameGenre = item.genre && picks.every(p => normName(p.item.genre) === normName(item.genre));
  return `<div class="k-also">
    <span class="k-also-head">${sameGenre ? 'More ' + esc(item.genre) + ' on the shelf' : 'On the shelf right now'}</span>
    <ul class="k-list">${picks.map(p => `<li>${coverImg(p.item)}<span class="k-list-text">
      <strong>${esc(p.item.title)}</strong>
      <span class="muted">${esc(p.item.author || '')}</span>
      ${p.rating ? `<span class="k-rating">${starsHTML(p.rating.avg)} <span class="muted">${p.rating.avg.toFixed(1)} from ${plural(p.rating.count, 'reader')}</span></span>`
                 : '<span class="muted">No ratings yet — be the first</span>'}
      ${p.item.genre ? `<span class="muted">Look in <strong>${esc(p.item.genre)}</strong> ${genreArt(p.item.genre, 15)}</span>` : ''}
    </span></li>`).join('')}</ul>
  </div>`;
}

/* Students notice damage before anyone else does; this puts it on the
   teacher's list without taking the book out of circulation. */
function reportProblemHTML(item) {
  return `<div class="k-report" data-item="${item.id}">
    <button type="button" class="link" data-report="1">Something's wrong with this book</button>
  </div>`;
}

function wireReport(box) {
  const row = box.querySelector('.k-report');
  if (!row) return;
  const btn = row.querySelector('[data-report]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const item = itemById(row.dataset.item);
    row.innerHTML = `<span class="k-report-ask">What's wrong with it?</span>
      <span class="k-report-opts">${['Pages torn or missing', 'Cover damaged', 'Something spilled on it', 'Something else']
        .map(w => `<button type="button" class="btn" data-why="${esc(w)}">${esc(w)}</button>`).join('')}</span>`;
    row.querySelectorAll('[data-why]').forEach(b => b.addEventListener('click', () => {
      setAttention(item.id, true, b.dataset.why, K.student.name);
      row.innerHTML = '<span class="k-report-ask">Thanks for telling us — your teacher will take a look.</span>';
    }));
  });
}

function wireRating(box) {
  const row = box.querySelector('.k-rate');
  if (!row) return;
  const itemId = row.dataset.item;
  const stars = [...row.querySelectorAll('.k-star')];
  const paint = upTo => stars.forEach((b, i) => b.classList.toggle('on', i < upTo));
  const saved = () => { const r = reviewBy(itemId, K.student.id); return r ? r.stars : 0; };
  // Once a rating is in, hovering must not repaint it: the thank-you message
  // reflows the row, and a star can slide under a cursor that never moved.
  let locked = !!saved();
  stars.forEach(b => {
    const n = Number(b.dataset.star);
    b.addEventListener('pointerenter', () => { if (!locked) paint(n); });
    b.addEventListener('focus', () => { if (!locked) paint(n); });
    b.addEventListener('click', () => {
      const res = rateItem(itemId, K.student.id, n);
      if (!res.ok) { toast(res.error, 'error'); return; }
      locked = true;
      paint(n);
      row.querySelector('.k-rate-ask').textContent = n >= 4 ? 'Thanks — glad you liked it!' : 'Thanks for telling us!';
    });
  });
  row.addEventListener('pointerleave', () => paint(saved()));
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
  if (item.status && !activeLoanForItem(item.id)) {
    showResult('warn', `<strong>${esc(item.title)}</strong> is marked ${esc(statusLabel(item.status).toLowerCase())} right now. Please give it to your teacher.`);
    return;
  }

  const loan = activeLoanForItem(item.id);

  if (loan && loan.patronId === me.id) {
    const res = checkin(item.id);
    if (!res.ok) { showResult('warn', esc(res.error)); return; }
    kRender();
    showResult('ok', returnedMessage(item, res) + ratePromptHTML(item) + reportProblemHTML(item) + alsoLikedHTML(item),
      '', box => { wireRating(box); wireReport(box); });
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
    const rating = itemRating(it.id);
    let status, action = '';
    if (it.status) status = 'Not on the shelf right now';
    else if (mineOut) status = 'You have this one';
    else if (!loan) {
      const shelf = it.shelfId && typeof shelfById === 'function' ? shelfById(it.shelfId) : null;
      status = 'On the shelf' + (it.genre ? ` — look in <strong>${esc(it.genre)}</strong> ${genreArt(it.genre, 15)}` : '')
        + (shelf ? ` <span class="mono">${esc(shelf.code)}</span>` : '');
    }
    else if (inLine) status = `Checked out · you're number ${inLine} in line`;
    else {
      status = 'Checked out · ' + (isOverdue(loan) ? 'should be back soon' : 'back ' + esc(fmtDate(loan.dueAt)));
      action = `<button class="btn" data-hold-item="${it.id}">Get in line</button>`;
    }
    return `<li>${coverImg(it)}<span class="k-list-text"><strong>${esc(it.title)}</strong>
      <span class="muted">${esc(it.author || '')}</span>
      ${rating ? `<span class="k-rating">${starsHTML(rating.avg)} <span class="muted">${rating.avg.toFixed(1)} from ${plural(rating.count, 'reader')}</span></span>` : ''}
      <span>${status}</span></span>${action}</li>`;
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

/* ------------------------------ staff way in ------------------------------
   A small corner link, not a secret. The password is the lock, and the way
   in is temporary: leaving the admin page signs you straight back out, so a
   classroom device is never left open.
   -------------------------------------------------------------------------- */

const STAFF_STEP = { step: 'name', name: '', account: null, error: '' };

function openStaffGate(state) {
  const g = Object.assign({}, STAFF_STEP, state || {});
  const body = g.step === 'name'
    ? `<label class="field"><span>Your name</span>
         <input name="who" autocomplete="username" value="${esc(g.name)}" placeholder="e.g. Catherine"></label>`
    : `<input class="sr-only" type="text" name="username" value="${esc(g.name)}" autocomplete="username" readonly tabindex="-1" aria-hidden="true">
       <label class="field"><span>Password for ${esc(g.name)}</span>
         <input name="password" type="password" autocomplete="current-password"></label>`;
  main.innerHTML = `
  <section class="k-card k-setup">
    <h1>Staff sign in</h1>
    <p class="hint">This signs you in only until you leave the library pages. Students carry on with
      <button type="button" class="link" id="staff-cancel">the student screen</button>.</p>
    <form class="key-form" id="staff-form" autocomplete="on">
      ${body}
      <div class="actions">
        <button type="submit" class="btn btn-primary">${g.step === 'name' ? 'Continue' : 'Sign in'}</button>
        <button type="button" class="btn btn-quiet" id="staff-back">Back</button>
      </div>
      ${g.error ? `<p class="danger">${esc(g.error)}</p>` : ''}
    </form>
  </section>`;

  const form = document.getElementById('staff-form');
  const fail = message => openStaffGate(Object.assign({}, g, { error: message }));
  document.getElementById('staff-cancel').addEventListener('click', kRender);
  document.getElementById('staff-back').addEventListener('click', () => g.step === 'name' ? kRender() : openStaffGate({ name: g.name }));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      if (g.step === 'name') {
        const typed = form.who.value.trim();
        if (!typed) return fail('Type your name.');
        const account = await Accounts.find(typed);
        if (!account) return fail('There is no account for ' + typed + '.');
        return openStaffGate({ step: 'password', name: account.name, account: account });
      }
      await Accounts.unlock(g.account, form.password.value);   // throws if the password is wrong
      try {
        localStorage.setItem('classroom-library-me', g.account.name);
        localStorage.setItem('classroom-library-me-temp', '1');
        /* Carry the person's permissions over, or the staff page would open with the
           run of the place for anyone who can reach the station. */
        if (Array.isArray(g.account.can)) {
          localStorage.setItem('classroom-library-can', JSON.stringify(g.account.can));
        } else {
          localStorage.removeItem('classroom-library-can');
        }
      } catch (err) { /* private mode */ }
      location.href = '../';
    } catch (err) {
      fail(err.message);
    }
  });
  const first = form.querySelector('input:not([readonly])');
  if (first) first.focus();
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

document.getElementById('staff-link').addEventListener('click', () => openStaffGate());

/* Keep the cursor in the box so a scan always lands somewhere. */
document.addEventListener('click', e => {
  if (e.target.closest('button, a, input, select, textarea, label')) return;
  const input = document.getElementById('k-input');
  if (input) input.focus();
});

kRender();
poke();

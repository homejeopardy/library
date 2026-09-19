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
      <div class="actions">
        <button class="btn btn-primary" data-act="checkin" data-id="${item.id}" id="primary-action">Check in</button>
        <button class="btn" data-act="renew" data-id="${loan.id}">Renew</button>
        <button class="btn btn-quiet" data-act="hold-for" data-id="${item.id}">Place hold</button>
        <button class="btn btn-quiet" data-act="clear-desk">Cancel</button>
      </div>
    </div>`;
  }

  return `
  <div class="card">
    ${itemHeadHTML(item)}
    <div class="status-row">
      <span class="badge badge-ok">Available</span>
      ${hold ? `<span>&middot; held for <strong>${esc((patronById(hold.patronId) || {}).name || '?')}</strong></span>` : ''}
    </div>
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
      <button class="btn btn-quiet" data-act="clear-desk">Cancel</button>
    </div>
    <p class="hint">${S().autoCreatePatrons ? 'A student who has never borrowed before is added automatically.' : 'New students must be added on the Students tab first.'}</p>
  </div>`;
}

function itemHeadHTML(item) {
  return `
  <div class="item-head">
    ${coverHTML(item, 'cover-md')}
    <div>
      <h2 class="item-title">${esc(item.title)}</h2>
      <p class="item-sub">${esc(item.author || 'Unknown author')}${item.year ? ' &middot; ' + esc(item.year) : ''}</p>
      <p class="item-meta mono">${esc(item.barcode)}${item.isbn ? ' &middot; ISBN ' + esc(item.isbn) : ''}</p>
      ${item.genre ? `<p class="item-genre"><span class="genre-tag">${esc(item.genre)}</span></p>` : ''}
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

/* stickyGenre: "Add & add another" keeps the genre, since books usually arrive in stacks of one kind. */
function openItemModal(itemId, prefillISBN, prefillTitle, stickyGenre) {
  const item = itemId ? itemById(itemId) : null;
  const d = item || { barcode: '', isbn: prefillISBN || '', title: prefillTitle || '', author: '', publisher: '', year: '', cover: '', genre: stickyGenre || '', tags: [], notes: '' };

  openModal(item ? 'Edit book' : 'Add a book', `
    <div class="lookup-row">
      ${field('ISBN', 'isbn', d.isbn, { placeholder: 'Scan or type the ISBN' })}
      <button type="button" class="btn" id="do-lookup">Look up</button>
    </div>
    <p class="hint" id="lookup-status">Looking up an ISBN fills in the title, author and cover automatically. Needs internet; everything can also be typed by hand.</p>
    <div class="grid-2">
      ${field('Title *', 'title', d.title)}
      ${field('Author', 'author', d.author)}
      ${field('Publisher', 'publisher', d.publisher)}
      ${field('Year', 'year', d.year)}
      ${field('Barcode', 'barcode', d.barcode, { placeholder: 'Blank = generate ' + (S().barcodePrefix || 'CL') + '-0000' })}
      <div class="field">
        <label><span class="field-label">Genre</span><select name="genre">${genreOptionsHTML(d.genre)}</select></label>
        <p class="genre-hints" id="genre-hints" hidden></p>
      </div>
      ${field('Tags', 'tags', (d.tags || []).join(', '), { placeholder: 'comma separated' })}
      ${field('Cover image URL', 'cover', d.cover)}
    </div>
    <label class="field"><span>Notes</span><textarea name="notes" rows="2">${esc(d.notes)}</textarea></label>
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
        `<button type="button" class="genre-tag" data-genre="${esc(g)}">${esc(g)}</button>`).join(' ') : '';
    }
    hintBox.addEventListener('click', e => {
      const b = e.target.closest('[data-genre]');
      if (!b) return;
      genreSel.value = b.dataset.genre;
      prevGenre = genreSel.value;
      showGenreHints([]);
    });
    genreSel.addEventListener('change', () => { if (genreSel.value) showGenreHints([]); });

    async function runLookup() {
      const raw = get('isbn').value.trim();
      if (!looksLikeISBN(raw)) { status.textContent = 'That is not a 10- or 13-digit ISBN.'; return; }
      status.textContent = 'Searching Open Library…';
      try {
        const data = await lookupISBN(raw);
        if (!data) { status.textContent = 'No record found for that ISBN — type the details in by hand.'; return; }
        ['title', 'author', 'publisher', 'year', 'cover'].forEach(k => { if (data[k] && !get(k).value.trim()) get(k).value = data[k]; });
        if (data.tags && data.tags.length && !get('tags').value.trim()) get('tags').value = data.tags.join(', ');
        status.textContent = 'Found in ' + data.source + '. Check it, then save.';
        showGenreHints(genreSel.value ? [] : suggestGenres(data.subjects, S().genres));
        get('title').focus();
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
      toast(item ? 'Saved.' : 'Added "' + res.item.title + '" (' + res.item.barcode + ').', 'ok');
      if (again) {
        openItemModal(null, '', '', fields.genre);
        return;
      }
      closeModal();
      if (!item && route === 'circulation') { circ.item = res.item; circ.matches = null; }
      render();
    }

    body.querySelector('#save-item').addEventListener('click', () => save(false));
    const againBtn = body.querySelector('#save-item-again');
    if (againBtn) againBtn.addEventListener('click', () => save(true));
    body.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.name !== 'isbn') { e.preventDefault(); save(false); }
    });

    if (prefillISBN && looksLikeISBN(prefillISBN)) runLookup();
    else (get('title').value ? get('author') : get('title')).focus();
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

VIEWS.catalog = function () {
  let items = searchItems(ui.catalogQuery);
  if (ui.catalogFilter === 'out') items = items.filter(i => activeLoanForItem(i.id));
  if (ui.catalogFilter === 'in') items = items.filter(i => !activeLoanForItem(i.id));
  if (ui.catalogFilter === 'overdue') items = items.filter(i => isOverdue(activeLoanForItem(i.id)));
  if (ui.catalogGenre === '__none__') items = items.filter(i => !i.genre);
  else if (ui.catalogGenre) items = items.filter(i => normName(i.genre) === normName(ui.catalogGenre));

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
        ${[['all', 'All'], ['in', 'On the shelf'], ['out', 'Checked out'], ['overdue', 'Overdue']].map(([k, label]) =>
          `<button class="chip ${ui.catalogFilter === k ? 'active' : ''}" data-act="cat-filter" data-id="${k}">${label}</button>`).join('')}
      </div>
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="new-item">Add a book</button>
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
                <div class="mono small muted">${esc(i.barcode)}</div></td>
            <td>${esc(i.author || '—')}</td>
            <td>${i.genre ? `<button class="genre-tag" data-act="cat-genre" data-id="${esc(i.genre)}">${esc(i.genre)}</button>` : '<span class="muted">—</span>'}</td>
            <td>${loan
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
        <td>${g ? `<button class="genre-tag" data-act="report-genre" data-id="${esc(g)}">${esc(g)}</button>` : '<span class="muted">No genre yet</span>'}</td>
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

    <h2 class="section-title">Genres</h2>
    <p class="hint">These are the choices in the Genre menu when you add a book. Renaming a genre updates every book in it; renaming one onto another merges them.</p>
    <ul class="genre-admin">
      ${genreList().map(g => {
        const n = booksInGenre(g).length;
        return `<li>
          <span class="genre-tag">${esc(g)}</span>
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
    <div class="actions"><button class="btn btn-quiet" data-act="genre-defaults">Restore suggested genres</button></div>

    <h2 class="section-title">Backup</h2>
    <p class="hint">Everything lives in this browser on this computer. Export a backup regularly — and always before clearing browsing data or switching machines.</p>
    <div class="actions">
      <button class="btn" data-act="export-json">Download backup</button>
      <button class="btn" data-act="import-json">Restore from backup…</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>

    <h2 class="section-title">Danger zone</h2>
    <div class="actions">
      <button class="btn" data-act="load-sample" ${DB.items.length ? 'disabled title="Only available on an empty library"' : ''}>Load sample data</button>
      <button class="btn btn-danger" data-act="reset-all">Erase everything</button>
    </div>
    <p class="hint">Storage in use: ${esc(storageSize())}</p>
  </section>`;
};

AFTER.settings = function () {
  document.getElementById('new-genre').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); ACTIONS['genre-add'](); }
  });
  const file = document.getElementById('import-file');
  file.addEventListener('change', () => {
    const f = file.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const mode = confirm('OK = replace everything with this backup.\nCancel = merge it into the current library.') ? 'replace' : 'merge';
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
    if (!missing.length) { toast('Every suggested genre is already on your list.', 'info'); return; }
    missing.forEach(g => addGenre(g, true));
    saveDB();
    toast('Added back ' + plural(missing.length, 'suggested genre') + '.', 'ok');
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

  'reset-all': () => {
    if (!confirm('Erase every book, student and loan? Export a backup first if you might want any of it back.')) return;
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

/* ============================ SAMPLE DATA ============================ */

function loadSampleData() {
  const books = [
    ['Charlotte’s Web', 'E. B. White', '9780064400558', '1952', 'Fantasy'],
    ['Bridge to Terabithia', 'Katherine Paterson', '9780064401845', '1977', 'Realistic Fiction'],
    ['Holes', 'Louis Sachar', '9780440414803', '1998', 'Adventure'],
    ['The Giver', 'Lois Lowry', '9780544336261', '1993', 'Science Fiction'],
    ['Brown Girl Dreaming', 'Jacqueline Woodson', '9780147515827', '2014', 'Poetry & Novels in Verse'],
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

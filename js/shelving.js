/* ---------------------------------------------------------------
   Shelving: scan a shelf card, then scan the books that are on it.

   Meant to be used standing at the shelf with a laptop and the USB
   scanner, so everything is keyboard-driven and the window can be
   narrow. Each scan files the book and plays a short sound — a soft
   click when all is well, a buzz when something wants looking at, so
   you can keep your eyes on the shelf rather than the screen.
   --------------------------------------------------------------- */

/* Two tones, built on the fly: no audio files to load, works offline. */
const Chime = (function () {
  let ctx = null;
  function context() {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) ctx = new Ctor();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, seconds, type, gain) {
    const c = context();
    if (!c) return;
    const osc = c.createOscillator(), vol = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain == null ? 0.07 : gain, c.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + seconds);
    osc.connect(vol).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + seconds);
  }
  return {
    ok: () => tone(880, 0.07, 'sine', 0.05),
    /* Lower, longer and rougher, so it carries across a room. */
    problem: () => { tone(220, 0.18, 'square', 0.06); setTimeout(() => tone(165, 0.22, 'square', 0.06), 150); },
    unknown: () => { tone(160, 0.3, 'sawtooth', 0.05); },
    wake: () => context()
  };
})();

const shelving = { shelfId: null, viewId: null, scanned: [], muted: false, mode: 'file' };

VIEWS.shelves = function () {
  const shelf = shelving.shelfId ? shelfById(shelving.shelfId) : null;
  if (shelf) return shelvingSessionHTML(shelf);
  const viewing = shelving.viewId ? shelfById(shelving.viewId) : null;
  return viewing ? shelfPageHTML(viewing) : shelfListHTML();
};

/* ----------------------------- the shelf list ----------------------------- */

function shelfListHTML() {
  const shelves = shelvesList();
  const unshelved = DB.items.filter(i => !i.shelfId).length;
  return `
  <section class="pane">
    <div class="scan-wrap">
      <label class="scan-label" for="scan">Scan a shelf card to start filing — or pick one below</label>
      <input id="scan" class="scan" autocomplete="off" spellcheck="false" placeholder="Scan the shelf card">
      <p class="hint">${shelves.length
        ? plural(shelves.length, 'shelf', 'shelves') + ' &middot; ' + plural(unshelved, 'book') + ' not on a shelf yet'
        : 'No shelves yet. Add one below, print its card, and stick it on the shelf.'}</p>
    </div>

    ${shelves.length ? `<div class="tiles">
      ${tile(unshelvedItems().length, 'not on a shelf')}
      ${tile(strayItems().length, 'in the wrong genre', strayItems().length ? 'danger' : '')}
      ${tile(shelves.filter(shelfCardStale).length, 'cards to reprint')}
    </div>
    ${strayItems().length ? `<div class="actions"><button class="btn btn-quiet" data-act="shelf-strays">See the strays</button></div>` : ''}

    <table class="table">
      <thead><tr><th>Code</th><th>Where</th><th>Genre</th><th>Letters</th><th>Books</th><th>Last filed</th><th></th></tr></thead>
      <tbody>${shelves.map(s => `<tr>
        <td><button class="link strong mono" data-act="shelf-page" data-id="${s.id}">${esc(s.code)}</button>
            ${shelfCardStale(s) ? '<div class="small"><span class="badge badge-warn">card out of date</span></div>' : ''}</td>
        <td class="muted">${esc(s.name || '—')}</td>
        <td>${s.genre ? genreTagHTML(s.genre) : '<span class="muted">any</span>'}</td>
        <td class="muted mono small">${s.fromLetters || s.toLetters ? esc((s.fromLetters || '…') + ' – ' + (s.toLetters || '…')) : '—'}</td>
        <td>${itemsOnShelf(s.id).length}</td>
        <td class="muted small">${s.lastFiledAt ? esc(fmtDate(s.lastFiledAt)) : 'never'}</td>
        <td class="row-actions">
          <button class="link" data-act="shelf-open" data-id="${s.id}">File</button>
          <button class="link" data-act="shelf-page" data-id="${s.id}">Open</button>
        </td>
      </tr>`).join('')}</tbody>
    </table>` : ''}

    <div class="actions">
      <button class="btn btn-primary" data-act="shelf-new">Add a shelf</button>
      ${shelves.length ? '<button class="btn" data-act="shelf-print">Print shelf cards</button>' : ''}
      ${shelves.filter(shelfCardStale).length ? '<button class="btn" data-act="shelf-print-stale">Print only the out-of-date cards</button>' : ''}
      ${unshelvedItems().length ? `<button class="btn btn-quiet" data-act="shelf-unshelved">${plural(unshelvedItems().length, 'book')} with no shelf</button>` : ''}
    </div>
  </section>`;
}

/* ------------------------------ one shelf ------------------------------ */

function shelfPageHTML(shelf) {
  const books = shelfContents(shelf.id);
  const strays = books.filter(i => shelf.genre && i.genre && normName(i.genre) !== normName(shelf.genre));
  return `
  <section class="pane">
    <div class="shelf-head">
      <div>
        <h2 class="shelf-code">${esc(shelf.code)}</h2>
        <p class="item-sub">${esc(shelf.name || '')}${shelf.genre ? (shelf.name ? ' &middot; ' : '') + esc(shelf.genre) : ''}
          ${shelf.fromLetters || shelf.toLetters ? ' &middot; ' + esc((shelf.fromLetters || '…') + ' – ' + (shelf.toLetters || '…')) : ''}</p>
        <p class="hint">${books.length ? plural(books.length, 'book') : 'Nothing filed here yet'}${shelf.lastFiledAt ? ' &middot; last filed ' + esc(fmtDateFull(shelf.lastFiledAt)) : ''}
          ${shelfCardStale(shelf) ? ' &middot; <strong class="danger">the printed card is out of date</strong>' : ''}</p>
      </div>
      <div class="shelf-tally">
        <div><strong>${books.length}</strong><span>books</span></div>
        <div class="${strays.length ? 'danger' : ''}"><strong>${strays.length}</strong><span>wrong genre</span></div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" data-act="shelf-open" data-id="${shelf.id}">File this shelf</button>
      <button class="btn" data-act="shelf-read" data-id="${shelf.id}">Shelf-read it</button>
      <button class="btn" data-act="shelf-print-one" data-id="${shelf.id}">Print its card</button>
      <button class="btn" data-act="shelf-print-list" data-id="${shelf.id}">Print the list</button>
      <button class="btn btn-quiet" data-act="shelf-edit" data-id="${shelf.id}">Edit</button>
      <button class="btn btn-quiet" data-act="shelf-move" data-id="${shelf.id}">Move it all</button>
      <button class="btn btn-quiet" data-act="shelf-split" data-id="${shelf.id}">Split it</button>
      <button class="btn btn-quiet" data-act="shelf-back">All shelves</button>
    </div>

    ${books.length ? `<table class="table">
      <thead><tr><th>In shelf order</th><th>Genre</th><th>Status</th><th></th></tr></thead>
      <tbody>${books.map(i => {
        const loan = activeLoanForItem(i.id);
        const stray = shelf.genre && i.genre && normName(i.genre) !== normName(shelf.genre);
        return `<tr class="${stray ? 'row-problem' : ''}">
          <td><span class="mono small muted">${esc(callLetters(i.title))}</span>
              <button class="link strong" data-act="desk-item" data-id="${i.id}">${esc(i.title)}</button>
              <div class="mono small muted">${esc(i.barcode)}</div></td>
          <td>${i.genre ? genreTagHTML(i.genre) : '<span class="muted">—</span>'}</td>
          <td>${i.status ? `<span class="badge badge-danger">${esc(statusLabel(i.status))}</span>`
            : loan ? `<span class="badge badge-warn">Out</span>` : '<span class="badge badge-ok">Here</span>'}</td>
          <td class="row-actions">${stray ? `<span class="danger small">belongs in ${esc(i.genre)}</span>` : ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>` : ''}
  </section>`;
}

AFTER.shelves = function () {
  const box = document.getElementById('scan');
  if (box) {
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      Chime.wake();
      const value = box.value.trim();
      box.value = '';
      if (!value) return;
      shelving.shelfId ? shelveScan(value) : openShelfByScan(value);
    });
    box.focus();
  }
};

function openShelfByScan(text) {
  const shelf = findShelfByScan(text);
  if (!shelf) {
    Chime.unknown();
    toast('No shelf with that code. Scan a shelf card, or add the shelf first.', 'error');
    return;
  }
  ACTIONS['shelf-open'](shelf.id);
}

/* --------------------------- filing at the shelf --------------------------- */

function shelvingSessionHTML(shelf) {
  const problems = shelving.scanned.filter(s => s.issues.length).length;
  const expected = itemsOnShelf(shelf.id).length;
  const seen = new Set(shelving.scanned.filter(s => s.item).map(s => s.item.id));
  const missing = itemsOnShelf(shelf.id).filter(i => !seen.has(i.id));

  return `
  <section class="pane">
    <div class="shelf-head">
      <div>
        <h2 class="shelf-code">${esc(shelf.code)}</h2>
        <p class="item-sub">${esc(shelf.name || '')}${shelf.genre ? (shelf.name ? ' &middot; ' : '') + esc(shelf.genre) : ''}</p>
      </div>
      <div class="shelf-tally">
        <div><strong>${shelving.scanned.length}</strong><span>scanned</span></div>
        <div class="${problems ? 'danger' : ''}"><strong>${problems}</strong><span>to look at</span></div>
        <div><strong>${expected}</strong><span>on this shelf</span></div>
      </div>
    </div>

    <div class="scan-wrap">
      <label class="scan-label" for="scan">${shelving.mode === 'read'
        ? 'Scan the books left to right, in the order they sit'
        : 'Scan each book on the shelf'}</label>
      <input id="scan" class="scan" autocomplete="off" spellcheck="false" placeholder="Scan a book">
      <p class="hint">${shelving.mode === 'read'
        ? 'Each scan is filed here and checked against the one before it, so a book out of order gets flagged.'
        : 'Every scan files the book here.'} ${shelving.muted ? 'Sound is off.' : 'A buzz means look at the screen.'}</p>
    </div>

    <div class="actions">
      <button class="btn ${shelving.mode === 'file' ? 'btn-primary' : ''}" data-act="shelf-mode" data-id="file">Filing</button>
      <button class="btn ${shelving.mode === 'read' ? 'btn-primary' : ''}" data-act="shelf-mode" data-id="read">Shelf-read</button>
      <button class="btn" data-act="shelf-mute">${shelving.muted ? 'Turn sound on' : 'Turn sound off'}</button>
      <button class="btn" data-act="shelf-finish">Finish with ${esc(shelf.code)}</button>
      ${missing.length ? `<button class="btn btn-quiet" data-act="shelf-missing" data-id="${shelf.id}">${plural(missing.length, 'book')} not seen yet</button>` : ''}
    </div>

    ${shelving.scanned.length ? `<table class="table scan-log">
      <tbody>${shelving.scanned.map((s, n) => `<tr class="${s.issues.length ? 'row-problem' : ''}">
        <td class="muted small">${shelving.scanned.length - n}</td>
        <td>${s.item
          ? `<strong>${esc(s.item.title)}</strong><div class="mono small muted">${esc(s.item.barcode)}</div>`
          : `<strong class="danger">Not in the library</strong><div class="mono small muted">${esc(s.code)}</div>`}</td>
        <td>${s.item && s.item.genre ? genreTagHTML(s.item.genre) : ''}</td>
        <td>${s.issues.length
          ? s.issues.map(i => `<div class="danger small">${esc(i.text)}</div>`).join('')
          : '<span class="badge badge-ok">Filed</span>'}</td>
        <td class="row-actions">${s.item
          ? `<button class="link" data-act="edit-item" data-id="${s.item.id}">Open</button>`
          : `<button class="link" data-act="shelf-add-book" data-id="${esc(s.code)}">Add it</button>`}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="muted">Nothing scanned yet.</p>'}
  </section>`;
}

function shelveScan(code) {
  const shelf = shelfById(shelving.shelfId);
  if (!shelf) return;

  // A second shelf card means "I have moved on to the next shelf".
  const asShelf = findShelfByScan(code);
  if (asShelf) {
    if (asShelf.id === shelf.id) { Chime.ok(); return; }
    ACTIONS['shelf-open'](asShelf.id);
    toast('Now filing ' + asShelf.code + '.', 'info');
    return;
  }

  const item = findItemByCode(code);
  if (!item) {
    shelving.scanned.unshift({ code: code, item: null, issues: [{ kind: 'unknown', text: 'This barcode is not in the library.' }] });
    if (!shelving.muted) Chime.unknown();
    render();
    return;
  }

  const already = shelving.scanned.find(s => s.item && s.item.id === item.id);
  if (already) {
    if (!shelving.muted) Chime.problem();
    toast('"' + item.title + '" was already scanned onto this shelf.', 'error');
    return;
  }

  const res = fileToShelf(item.id, shelf.id);
  const issues = res.issues.slice();
  if (res.movedFrom) issues.push({ kind: 'moved', text: 'Moved here from ' + res.movedFrom.code + '.' });

  // Shelf-reading: each book should sort at or after the one before it.
  if (shelving.mode === 'read') {
    const previous = shelving.scanned.find(s => s.item);
    if (previous) {
      const here = callLetters(item.title), before = callLetters(previous.item.title);
      if (here < before) issues.push({ kind: 'order', text: 'Out of order — ' + here + ' sorts before ' + before + ', which you just scanned.' });
    }
  }
  shelving.scanned.unshift({ code: code, item: item, issues: issues });
  if (!shelving.muted) (issues.length ? Chime.problem() : Chime.ok());
  render();
}

/* ------------------------------- the dialogs ------------------------------- */

function openShelfModal(shelfId) {
  const shelf = shelfId ? shelfById(shelfId) : null;
  const d = shelf || { code: '', name: '', genre: '', fromLetters: '', toLetters: '' };
  openModal(shelf ? 'Shelf ' + shelf.code : 'Add a shelf', `
    <div class="grid-2">
      ${field('Code *', 'code', d.code, { placeholder: 'A3' })}
      ${field('Where it is', 'name', d.name, { placeholder: 'Bookcase A, third shelf' })}
    </div>
    <label class="field"><span>Genre on this shelf</span>
      <select name="genre">${genreOptionsHTML(d.genre)}</select></label>
    <div class="grid-2">
      ${field('Letters from', 'fromLetters', d.fromLetters, { placeholder: 'ADA' })}
      ${field('up to', 'toLetters', d.toLetters, { placeholder: 'KIN' })}
    </div>
    <p class="hint">A genre can fill several shelves. The letters are optional — set them and a
      book that sorts outside the range gets flagged when you file it.</p>
    <div class="actions">
      <button type="button" class="btn btn-primary" id="save-shelf">${shelf ? 'Save' : 'Add it'}</button>
      <button type="button" class="btn btn-quiet" data-close>Cancel</button>
    </div>
  `, body => {
    const get = n => body.querySelector('[name="' + n + '"]');
    body.querySelector('#save-shelf').addEventListener('click', () => {
      const fields = {
        code: get('code').value, name: get('name').value,
        genre: get('genre').value === '__new__' ? '' : get('genre').value,
        fromLetters: get('fromLetters').value, toLetters: get('toLetters').value
      };
      const res = shelf ? updateShelf(shelf.id, fields) : addShelf(fields);
      if (!res.ok) { toast(res.error, 'error'); return; }
      toast(shelf ? 'Saved.' : 'Shelf ' + res.shelf.code + ' added. Print its card and stick it on.', 'ok');
      closeModal();
      render();
    });
    get('code').focus();
  });
}

function openMissingModal(shelfId) {
  const shelf = shelfById(shelfId);
  const seen = new Set(shelving.scanned.filter(s => s.item).map(s => s.item.id));
  const missing = itemsOnShelf(shelfId).filter(i => !seen.has(i.id));
  openModal('Not seen on ' + shelf.code, `
    <p>The app has ${plural(missing.length, 'book')} on this shelf that you haven't scanned this time.
      They may be checked out, mis-shelved, or simply not reached yet.</p>
    <ul class="mini-list">${missing.map(i => {
      const loan = activeLoanForItem(i.id);
      const who = loan ? patronById(loan.patronId) : null;
      return `<li><span>${esc(i.title)}</span>
        <span class="muted small">${loan ? 'out with ' + esc(who ? who.name : '?') : i.status ? esc(statusLabel(i.status)) : 'should be here'}</span></li>`;
    }).join('')}</ul>
    <div class="actions"><button type="button" class="btn btn-quiet" data-close>Close</button></div>
  `);
}

/* ------------------------------- shelf cards ------------------------------- */

/* Design A: the code reads from across the room, the barcode is for the scanner.
   3in x 1in, two across and ten down on a letter sheet. */
function shelfCardHTML(shelf) {
  return `<div class="shelf-card">
    <span class="sc-code">${esc(shelf.code)}</span>
    <span class="sc-mid">
      <span class="sc-genre">${esc(shelf.genre || 'Any genre')}</span>
      <span class="sc-where">${esc(shelf.name || '')}</span>
      ${shelf.fromLetters || shelf.toLetters ? `<span class="sc-where mono">${esc((shelf.fromLetters || '…') + ' – ' + (shelf.toLetters || '…'))}</span>` : ''}
    </span>
    <span class="sc-art">${genreArt(shelf.genre, '0.34in')}</span>
    <span class="sc-code39">${code39SVG(shelfBarcode(shelf))}</span>
  </div>`;
}

function printShelfCards(shelves) {
  printHTML(`<div class="shelf-sheet">${shelves.map(shelfCardHTML).join('')}</div>`);
}

Object.assign(ACTIONS, {
  'shelf-new': () => openShelfModal(null),
  'shelf-edit': id => openShelfModal(id),
  'shelf-delete': id => {
    const shelf = shelfById(id);
    const n = itemsOnShelf(id).length;
    if (!confirm('Delete shelf ' + shelf.code + '?' + (n ? ' ' + plural(n, 'book') + ' will be left without a shelf.' : ''))) return;
    deleteShelf(id);
    toast('Shelf deleted.', 'ok');
    render();
  },
  'shelf-open': id => {
    shelving.shelfId = id;
    shelving.viewId = null;
    shelving.scanned = [];
    shelving.mode = 'file';
    go('shelves');
  },
  'shelf-finish': () => {
    const shelf = shelfById(shelving.shelfId);
    const problems = shelving.scanned.filter(s => s.issues.length).length;
    const n = shelving.scanned.length;
    shelving.shelfId = null;
    shelving.scanned = [];
    render();
    if (n) toast(plural(n, 'book') + ' filed on ' + shelf.code + (problems ? ', ' + problems + ' to look at.' : '.'), problems ? 'info' : 'ok');
  },
  'shelf-mute': () => { shelving.muted = !shelving.muted; render(); },
  'shelf-missing': id => openMissingModal(id),
  'shelf-add-book': code => openItemModal(null, '', '', code),
  'shelf-print': () => { printShelfCards(shelvesList()); markShelfCardsPrinted(shelvesList()); render(); },
  'shelf-print-stale': () => {
    const stale = shelvesList().filter(shelfCardStale);
    printShelfCards(stale);
    markShelfCardsPrinted(stale);
    toast(plural(stale.length, 'card') + ' reprinted.', 'ok');
    render();
  },
  'shelf-print-one': id => { printShelfCards([shelfById(id)]); markShelfCardsPrinted([shelfById(id)]); render(); },

  'shelf-page': id => { shelving.viewId = id; shelving.shelfId = null; go('shelves'); },
  'shelf-back': () => { shelving.viewId = null; go('shelves'); },
  'shelf-read': id => {
    shelving.shelfId = id; shelving.viewId = null; shelving.scanned = []; shelving.mode = 'read';
    go('shelves');
  },
  'shelf-mode': mode => { shelving.mode = mode; render(); },

  'shelf-print-list': id => {
    const shelf = shelfById(id);
    const books = shelfContents(id);
    printHTML(`<section class="notice">
      <h1>${esc(S().libraryName)}</h1>
      <h2>Shelf ${esc(shelf.code)}${shelf.genre ? ' — ' + esc(shelf.genre) : ''} &middot; ${plural(books.length, 'book')}</h2>
      <table><thead><tr><th>✓</th><th>Letters</th><th>Title</th><th>Barcode</th><th>Where it should be</th></tr></thead>
      <tbody>${books.map(i => {
        const loan = activeLoanForItem(i.id);
        const stray = shelf.genre && i.genre && normName(i.genre) !== normName(shelf.genre);
        return `<tr><td>☐</td><td>${esc(callLetters(i.title))}</td><td>${esc(i.title)}</td><td>${esc(i.barcode)}</td>
          <td>${stray ? esc(i.genre) : loan ? 'out on loan' : i.status ? esc(statusLabel(i.status)) : 'here'}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="notice-foot">Printed ${esc(fmtDateFull(nowISO()))}</p>
    </section>`);
  },

  'shelf-strays': () => {
    const strays = strayItems();
    openModal('Books in the wrong genre', `
      <p>${plural(strays.length, 'book is', 'books are')} on a shelf that holds a different genre.</p>
      <ul class="mini-list">${strays.map(i => {
        const shelf = shelfById(i.shelfId);
        return `<li><span>${esc(i.title)}</span>
          <span class="muted small">on ${esc(shelf.code)} (${esc(shelf.genre)}) &middot; belongs in ${esc(i.genre)}</span></li>`;
      }).join('')}</ul>
      <div class="actions"><button type="button" class="btn btn-quiet" data-close>Close</button></div>`);
  },

  'shelf-unshelved': () => {
    ui.catalogShelf = '__none__'; ui.catalogGenre = ''; ui.catalogQuery = ''; ui.catalogFilter = 'all';
    go('catalog');
  },

  'shelf-move': id => {
    const from = shelfById(id);
    const others = shelvesList().filter(s => s.id !== id);
    if (!others.length) { toast('There is nowhere to move them to yet.', 'error'); return; }
    openModal('Move everything off ' + from.code, `
      <p>${plural(itemsOnShelf(id).length, 'book')} will be recorded as living on the shelf you pick. ${esc(from.code)} itself stays.</p>
      <label class="field"><span>Move to</span>
        <select name="to">${others.map(s => `<option value="${s.id}">${esc(s.code)}${s.genre ? ' — ' + esc(s.genre) : ''}</option>`).join('')}</select></label>
      <div class="actions">
        <button type="button" class="btn btn-primary" id="do-move">Move them</button>
        <button type="button" class="btn btn-quiet" data-close>Cancel</button>
      </div>`, body => {
      body.querySelector('#do-move').addEventListener('click', () => {
        const res = moveShelfContents(id, body.querySelector('[name="to"]').value);
        if (!res.ok) { toast(res.error, 'error'); return; }
        toast(plural(res.count, 'book') + ' moved from ' + res.from.code + ' to ' + res.to.code + '.', 'ok');
        closeModal();
        render();
      });
    });
  },

  'shelf-split': id => {
    const shelf = shelfById(id);
    const books = shelfContents(id);
    const middle = books.length ? callLetters(books[Math.floor(books.length / 2)].title) : '';
    openModal('Split ' + shelf.code, `
      <p>Everything sorting at or after the letters you give moves to a new shelf. Both shelves end up with
        matching letter ranges, and both cards will want reprinting.</p>
      <div class="grid-2">
        ${field('Letters that move', 'letter', middle, { placeholder: 'LET' })}
        ${field('New shelf code', 'code', '', { placeholder: shelf.code + 'B' })}
      </div>
      ${field('Where the new shelf is', 'name', '', { placeholder: 'Bookcase B, next shelf down' })}
      <div class="actions">
        <button type="button" class="btn btn-primary" id="do-split">Split it</button>
        <button type="button" class="btn btn-quiet" data-close>Cancel</button>
      </div>`, body => {
      body.querySelector('#do-split').addEventListener('click', () => {
        const res = splitShelf(id, body.querySelector('[name="letter"]').value,
          body.querySelector('[name="code"]').value, body.querySelector('[name="name"]').value);
        if (!res.ok) { toast(res.error, 'error'); return; }
        toast(plural(res.moved, 'book') + ' moved onto ' + res.shelf.code + '. Reprint both cards.', 'ok');
        closeModal();
        shelving.viewId = res.shelf.id;
        render();
      });
    });
  }
});

/* This file registers its view after app.js has already drawn once, so if the
   page opened straight onto #shelves, draw it now. */
if (route === 'shelves') render();

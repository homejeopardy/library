/* ---------------------------------------------------------------
   Store: the whole library lives in one JSON object in localStorage.
   Every mutation goes through a function here, so swapping in a real
   backend later means reimplementing this file and nothing else.
   --------------------------------------------------------------- */

const DB_KEY = 'classroom-library';

const DEFAULT_SETTINGS = {
  libraryName: 'Classroom Library',
  loanDays: 14,
  maxRenewals: 2,
  maxItems: 3,
  graceDays: 0,
  autoCreatePatrons: true,
  barcodePrefix: 'CL',
  nextBarcode: 1,
  // The classroom's own categories — rename, add or delete in Settings.
  genres: [
    'Adventure', 'Biography', 'Dystopian', 'Fantasy / Sci-Fi',
    'Graphic Novels', 'Historical Fiction', 'Nonfiction', 'Realistic Fiction'
  ],
  genreSet: 2
};

/* Set 1 was a 15-genre starter list. Moving a saved library to set 2 folds every one of
   those into the classroom's eight, and keeps the old name as a tag wherever it changes
   (a mystery lands in Realistic Fiction tagged "Mystery"), so searching still finds it. */
const GENRE_SET_2_MAP = {
  'fantasy': 'Fantasy / Sci-Fi',
  'science fiction': 'Fantasy / Sci-Fi',
  'mythology & folktales': 'Fantasy / Sci-Fi',
  'scary stories': 'Fantasy / Sci-Fi',
  'biography & memoir': 'Biography',
  'mystery': 'Realistic Fiction',
  'humor': 'Realistic Fiction',
  'sports': 'Realistic Fiction',
  'poetry & novels in verse': 'Realistic Fiction',
  'picture books': 'Realistic Fiction'
};

function blankDB() {
  return { version: 1, items: [], patrons: [], loans: [], holds: [], activity: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
}

let DB = loadDB();

function loadDB() {
  let raw = null;
  try { raw = localStorage.getItem(DB_KEY); } catch (e) { /* private mode */ }
  if (!raw) return blankDB();
  try {
    const parsed = JSON.parse(raw);
    const db = migrate(parsed);
    // Persist a one-time conversion now rather than whenever something next changes.
    if ((parsed.settings || {}).genreSet !== db.settings.genreSet) {
      try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* saved on next change */ }
    }
    return db;
  } catch (e) {
    console.error('Could not read saved library; starting empty.', e);
    return blankDB();
  }
}

/* Fill gaps in older saves or backups so the rest of the app can assume the current shape. */
function migrate(parsed) {
  const db = Object.assign(blankDB(), parsed);
  db.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
  if (!Array.isArray(db.settings.genres)) db.settings.genres = DEFAULT_SETTINGS.genres.slice();
  ['items', 'patrons', 'loans', 'holds', 'activity'].forEach(k => { if (!Array.isArray(db[k])) db[k] = []; });

  // The free-text "shelf / location" field became a genre. A location that names a genre
  // becomes that genre; anything else is kept in the book's notes rather than lost.
  db.items.forEach(item => {
    if (!('location' in item)) { if (item.genre == null) item.genre = ''; return; }
    const loc = String(item.location || '').trim();
    const match = db.settings.genres.find(g => normName(g) === normName(loc));
    if (item.genre == null) item.genre = match || '';
    if (loc && !match) item.notes = (item.notes ? item.notes + '\n' : '') + 'Shelf: ' + loc;
    delete item.location;
  });

  if (((parsed.settings && parsed.settings.genreSet) || 1) < 2) {
    const target = DEFAULT_SETTINGS.genres;
    db.items.forEach(item => {
      if (!item.genre) return;
      const key = normName(item.genre);
      const same = target.find(g => normName(g) === key);
      if (same) { item.genre = same; return; }
      // A genre the teacher invented has no known home: it stays on the book as a tag.
      const next = GENRE_SET_2_MAP[key] || '';
      item.tags = Array.isArray(item.tags) ? item.tags : [];
      if (!item.tags.some(t => normName(t) === key)) item.tags.push(item.genre);
      item.genre = next;
    });
    db.settings.genres = target.slice();
    db.settings.genreSet = 2;
  }
  return db;
}

function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  } catch (e) {
    toast('Could not save — browser storage is full or blocked. Export a backup now.', 'error');
  }
}

const S = () => DB.settings;

/* --- lookups --- */
const itemById   = id => DB.items.find(i => i.id === id) || null;
const patronById = id => DB.patrons.find(p => p.id === id) || null;
const loanById   = id => DB.loans.find(l => l.id === id) || null;

function findItemByCode(code) {
  const c = normCode(code);
  if (!c) return null;
  return DB.items.find(i => normCode(i.barcode) === c) ||
         DB.items.find(i => normCode(i.isbn) === c) ||
         null;
}

function findPatronByCode(code) {
  const c = normCode(code);
  if (!c) return null;
  return DB.patrons.find(p => p.barcode && normCode(p.barcode) === c) || null;
}

function findPatronByName(name) {
  const n = normName(name);
  if (!n) return null;
  return DB.patrons.find(p => normName(p.name) === n) || null;
}

function searchPatrons(q, limit) {
  const n = normName(q);
  if (!n) return DB.patrons.slice().sort(byName).slice(0, limit || 8);
  return DB.patrons
    .filter(p => normName(p.name).includes(n) || (p.barcode && normCode(p.barcode).includes(normCode(q))))
    .sort((a, b) => {
      const as = normName(a.name).startsWith(n) ? 0 : 1;
      const bs = normName(b.name).startsWith(n) ? 0 : 1;
      return as - bs || byName(a, b);
    })
    .slice(0, limit || 8);
}

function byName(a, b) { return normName(a.name).localeCompare(normName(b.name)); }

function searchItems(q) {
  const n = normName(q);
  const c = normCode(q);
  if (!n) return DB.items.slice().sort(byTitle);
  return DB.items.filter(i =>
    normName(i.title).includes(n) ||
    normName(i.author).includes(n) ||
    normName(i.tags ? i.tags.join(' ') : '').includes(n) ||
    normName(i.genre).includes(n) ||
    (c && normCode(i.barcode).includes(c)) ||
    (c && normCode(i.isbn).includes(c))
  ).sort(byTitle);
}

function byTitle(a, b) { return normName(a.title).localeCompare(normName(b.title)); }

/* --- loans --- */
const activeLoans = () => DB.loans.filter(l => !l.returnedAt);
const activeLoanForItem = itemId => DB.loans.find(l => l.itemId === itemId && !l.returnedAt) || null;
const loansForPatron = patronId => DB.loans.filter(l => l.patronId === patronId);
const activeLoansForPatron = patronId => DB.loans.filter(l => l.patronId === patronId && !l.returnedAt);

function isOverdue(loan) {
  if (!loan || loan.returnedAt) return false;
  return Date.now() > new Date(loan.dueAt).getTime() + S().graceDays * 86400000;
}

const overdueLoans = () => activeLoans().filter(isOverdue).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

function dueDateFromNow() {
  return endOfDay(addDays(new Date(), S().loanDays)).toISOString();
}

/* --- activity / undo --- */
function logActivity(type, payload) {
  DB.activity.unshift(Object.assign({ id: uid('act'), type: type, at: nowISO() }, payload));
  DB.activity = DB.activity.slice(0, 60);
}

function undoActivity(actId) {
  const idx = DB.activity.findIndex(a => a.id === actId);
  if (idx === -1) return { ok: false, error: 'That action is no longer undoable.' };
  const act = DB.activity[idx];
  const loan = loanById(act.loanId);
  if (!loan) return { ok: false, error: 'The loan record is gone.' };

  if (act.type === 'checkout') {
    if (loan.returnedAt) return { ok: false, error: 'That book has already been checked in.' };
    DB.loans = DB.loans.filter(l => l.id !== loan.id);
  } else if (act.type === 'checkin') {
    if (activeLoanForItem(loan.itemId)) return { ok: false, error: 'That book is checked out to someone else now.' };
    loan.returnedAt = null;
    loan.dueAt = act.prevDueAt || loan.dueAt;
  } else if (act.type === 'renew') {
    loan.dueAt = act.prevDueAt;
    loan.renewals = Math.max(0, (loan.renewals || 0) - 1);
  }
  DB.activity.splice(idx, 1);
  saveDB();
  return { ok: true };
}

/* --- patrons --- */
function addPatron(name, extra) {
  const clean = tidyName(name);
  if (!clean) return { ok: false, error: 'Enter a name.' };
  const existing = findPatronByName(clean);
  if (existing) return { ok: true, patron: existing, existed: true };
  const p = Object.assign({
    id: uid('pat'), name: clean, barcode: '', group: '', notes: '', createdAt: nowISO()
  }, extra || {});
  DB.patrons.push(p);
  saveDB();
  return { ok: true, patron: p, existed: false };
}

function updatePatron(id, fields) {
  const p = patronById(id);
  if (!p) return { ok: false, error: 'Student not found.' };
  if (fields.name != null) {
    const clean = tidyName(fields.name);
    if (!clean) return { ok: false, error: 'Name cannot be blank.' };
    const clash = findPatronByName(clean);
    if (clash && clash.id !== id) return { ok: false, error: 'Another student already has that name. Use Merge instead.' };
    fields.name = clean;
  }
  Object.assign(p, fields);
  saveDB();
  return { ok: true, patron: p };
}

function deletePatron(id) {
  if (activeLoansForPatron(id).length) return { ok: false, error: 'That student still has books out. Check them in first.' };
  DB.patrons = DB.patrons.filter(p => p.id !== id);
  DB.loans = DB.loans.filter(l => l.patronId !== id);
  DB.holds = DB.holds.filter(h => h.patronId !== id);
  saveDB();
  return { ok: true };
}

/* Fold a duplicate record (typo, nickname) into the real one, keeping all history. */
function mergePatrons(fromId, intoId) {
  if (fromId === intoId) return { ok: false, error: 'Pick two different students.' };
  const from = patronById(fromId), into = patronById(intoId);
  if (!from || !into) return { ok: false, error: 'Student not found.' };
  DB.loans.forEach(l => { if (l.patronId === fromId) l.patronId = intoId; });
  DB.holds.forEach(h => { if (h.patronId === fromId) h.patronId = intoId; });
  if (!into.barcode && from.barcode) into.barcode = from.barcode;
  if (!into.group && from.group) into.group = from.group;
  if (from.notes) into.notes = (into.notes ? into.notes + '\n' : '') + from.notes;
  if (new Date(from.createdAt) < new Date(into.createdAt)) into.createdAt = from.createdAt;
  DB.patrons = DB.patrons.filter(p => p.id !== fromId);
  saveDB();
  return { ok: true, patron: into };
}

/* --- items --- */
function nextBarcode() {
  const s = S();
  let n = s.nextBarcode || 1;
  let code;
  do {
    code = (s.barcodePrefix || 'CL') + '-' + String(n).padStart(4, '0');
    n++;
  } while (findItemByCode(code));
  s.nextBarcode = n;
  return code;
}

function addItem(fields) {
  const title = String(fields.title || '').trim();
  if (!title) return { ok: false, error: 'A title is required.' };
  const barcode = String(fields.barcode || '').trim() || nextBarcode();
  const clash = findItemByCode(barcode);
  if (clash) return { ok: false, error: 'Barcode ' + barcode + ' is already on "' + clash.title + '".' };
  const item = {
    id: uid('itm'),
    barcode: barcode,
    isbn: String(fields.isbn || '').trim(),
    title: title,
    author: String(fields.author || '').trim(),
    publisher: String(fields.publisher || '').trim(),
    year: String(fields.year || '').trim(),
    cover: String(fields.cover || '').trim(),
    genre: String(fields.genre || '').trim(),
    tags: (fields.tags || []).filter(Boolean),
    notes: String(fields.notes || '').trim(),
    addedAt: nowISO()
  };
  DB.items.push(item);
  saveDB();
  return { ok: true, item: item };
}

function updateItem(id, fields) {
  const item = itemById(id);
  if (!item) return { ok: false, error: 'Item not found.' };
  if (fields.barcode != null) {
    const bc = String(fields.barcode).trim();
    if (!bc) return { ok: false, error: 'Barcode cannot be blank.' };
    const clash = findItemByCode(bc);
    if (clash && clash.id !== id) return { ok: false, error: 'Barcode ' + bc + ' is already on "' + clash.title + '".' };
  }
  if (fields.title != null && !String(fields.title).trim()) return { ok: false, error: 'A title is required.' };
  Object.assign(item, fields);
  saveDB();
  return { ok: true, item: item };
}

function deleteItem(id) {
  if (activeLoanForItem(id)) return { ok: false, error: 'That book is checked out. Check it in first.' };
  DB.items = DB.items.filter(i => i.id !== id);
  DB.loans = DB.loans.filter(l => l.itemId !== id);
  DB.holds = DB.holds.filter(h => h.itemId !== id);
  saveDB();
  return { ok: true };
}

/* --- circulation --- */
function checkout(itemId, patronId) {
  const item = itemById(itemId), patron = patronById(patronId);
  if (!item) return { ok: false, error: 'Item not found.' };
  if (!patron) return { ok: false, error: 'Student not found.' };

  const open = activeLoanForItem(itemId);
  if (open) {
    const who = patronById(open.patronId);
    if (open.patronId === patronId) return { ok: false, error: '"' + item.title + '" is already checked out to ' + patron.name + '.' };
    return { ok: false, error: '"' + item.title + '" is out to ' + (who ? who.name : 'someone else') + '. Check it in first.' };
  }

  const out = activeLoansForPatron(patronId);
  const max = S().maxItems;
  if (max > 0 && out.length >= max) {
    return { ok: false, error: patron.name + ' already has ' + plural(out.length, 'book') + ' out (limit ' + max + ').', soft: true };
  }

  const hold = nextHoldForItem(itemId);
  if (hold && hold.patronId !== patronId) {
    const holder = patronById(hold.patronId);
    return { ok: false, error: '"' + item.title + '" is on hold for ' + (holder ? holder.name : 'another student') + '.', soft: true };
  }

  const loan = {
    id: uid('loan'), itemId: itemId, patronId: patronId,
    checkedOutAt: nowISO(), dueAt: dueDateFromNow(), returnedAt: null, renewals: 0
  };
  DB.loans.push(loan);
  if (hold) hold.filledAt = nowISO();
  logActivity('checkout', { loanId: loan.id });
  saveDB();
  return { ok: true, loan: loan, warnings: [] };
}

function checkin(itemId) {
  const loan = activeLoanForItem(itemId);
  if (!loan) return { ok: false, error: 'That book is not checked out.' };
  const wasOverdue = isOverdue(loan);
  const prevDueAt = loan.dueAt;
  loan.returnedAt = nowISO();
  logActivity('checkin', { loanId: loan.id, prevDueAt: prevDueAt });
  saveDB();
  return { ok: true, loan: loan, wasOverdue: wasOverdue, nextHold: nextHoldForItem(itemId) };
}

function renew(loanId) {
  const loan = loanById(loanId);
  if (!loan || loan.returnedAt) return { ok: false, error: 'That loan is closed.' };
  const max = S().maxRenewals;
  if (max >= 0 && (loan.renewals || 0) >= max) return { ok: false, error: 'Renewal limit reached (' + max + ').', soft: true };
  const hold = nextHoldForItem(loan.itemId);
  if (hold) return { ok: false, error: 'Another student has a hold on this book.', soft: true };
  const prevDueAt = loan.dueAt;
  loan.dueAt = dueDateFromNow();
  loan.renewals = (loan.renewals || 0) + 1;
  logActivity('renew', { loanId: loan.id, prevDueAt: prevDueAt });
  saveDB();
  return { ok: true, loan: loan };
}

/* Force past a soft block (limits, holds) when the teacher says so. */
function forceCheckout(itemId, patronId) {
  const item = itemById(itemId);
  if (!item || activeLoanForItem(itemId)) return { ok: false, error: 'That book is already out.' };
  const loan = {
    id: uid('loan'), itemId: itemId, patronId: patronId,
    checkedOutAt: nowISO(), dueAt: dueDateFromNow(), returnedAt: null, renewals: 0, overridden: true
  };
  DB.loans.push(loan);
  const hold = nextHoldForItem(itemId);
  if (hold && hold.patronId === patronId) hold.filledAt = nowISO();
  logActivity('checkout', { loanId: loan.id });
  saveDB();
  return { ok: true, loan: loan };
}

function forceRenew(loanId) {
  const loan = loanById(loanId);
  if (!loan || loan.returnedAt) return { ok: false, error: 'That loan is closed.' };
  const prevDueAt = loan.dueAt;
  loan.dueAt = dueDateFromNow();
  loan.renewals = (loan.renewals || 0) + 1;
  logActivity('renew', { loanId: loan.id, prevDueAt: prevDueAt });
  saveDB();
  return { ok: true, loan: loan };
}

/* --- holds --- */
const openHolds = () => DB.holds.filter(h => !h.filledAt && !h.cancelledAt);
const holdsForItem = itemId => openHolds().filter(h => h.itemId === itemId).sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt));
const nextHoldForItem = itemId => holdsForItem(itemId)[0] || null;

function placeHold(itemId, patronId) {
  const item = itemById(itemId), patron = patronById(patronId);
  if (!item || !patron) return { ok: false, error: 'Item or student not found.' };
  const loan = activeLoanForItem(itemId);
  if (loan && loan.patronId === patronId) return { ok: false, error: patron.name + ' already has that book.' };
  if (holdsForItem(itemId).some(h => h.patronId === patronId)) return { ok: false, error: patron.name + ' is already in line for that book.' };
  const hold = { id: uid('hold'), itemId: itemId, patronId: patronId, placedAt: nowISO(), filledAt: null, cancelledAt: null };
  DB.holds.push(hold);
  saveDB();
  const position = holdsForItem(itemId).findIndex(h => h.id === hold.id) + 1;
  return { ok: true, hold: hold, position: position, available: !loan };
}

function cancelHold(holdId) {
  const h = DB.holds.find(x => x.id === holdId);
  if (!h) return { ok: false, error: 'Hold not found.' };
  h.cancelledAt = nowISO();
  saveDB();
  return { ok: true };
}

/* A hold is ready when nobody has the book out. */
function readyHolds() {
  const seen = {};
  return openHolds()
    .sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt))
    .filter(h => {
      if (activeLoanForItem(h.itemId)) return false;
      if (seen[h.itemId]) return false;
      seen[h.itemId] = true;
      return true;
    });
}

/* --- genres --- */
const genreList = () => S().genres.slice().sort((a, b) => a.localeCompare(b));
const booksInGenre = name => DB.items.filter(i => normName(i.genre) === normName(name));

function addGenre(name, quiet) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { ok: false, error: 'Enter a genre name.' };
  const existing = S().genres.find(g => normName(g) === normName(clean));
  if (existing) return { ok: true, genre: existing, existed: true };
  S().genres.push(clean);
  if (!quiet) saveDB();
  return { ok: true, genre: clean, existed: false };
}

/* Renaming onto an existing genre merges the two. Every book follows the rename. */
function renameGenre(from, to) {
  const clean = String(to || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { ok: false, error: 'Genre name cannot be blank.' };
  const target = S().genres.find(g => normName(g) === normName(clean) && normName(g) !== normName(from)) || clean;
  booksInGenre(from).forEach(i => { i.genre = target; });
  S().genres = S().genres.filter(g => normName(g) !== normName(from));
  if (!S().genres.some(g => normName(g) === normName(target))) S().genres.push(target);
  saveDB();
  return { ok: true, genre: target, merged: target !== clean };
}

function deleteGenre(name) {
  booksInGenre(name).forEach(i => { i.genre = ''; });
  S().genres = S().genres.filter(g => normName(g) !== normName(name));
  saveDB();
  return { ok: true };
}

/* --- backup --- */
function exportJSON() {
  return JSON.stringify(Object.assign({}, DB, { exportedAt: nowISO() }), null, 2);
}

function importJSON(text, mode) {
  let incoming;
  try { incoming = JSON.parse(text); } catch (e) { return { ok: false, error: 'That file is not valid JSON.' }; }
  if (!incoming || !Array.isArray(incoming.items) || !Array.isArray(incoming.patrons)) {
    return { ok: false, error: 'That does not look like a Classroom Library backup.' };
  }
  if (mode === 'replace') {
    DB = migrate(incoming);
    saveDB();
    return { ok: true, added: { items: DB.items.length, patrons: DB.patrons.length } };
  }
  // merge: skip anything whose id already exists
  const has = (arr, id) => arr.some(x => x.id === id);
  let added = { items: 0, patrons: 0, loans: 0, holds: 0 };
  (incoming.patrons || []).forEach(p => { if (!has(DB.patrons, p.id) && !findPatronByName(p.name)) { DB.patrons.push(p); added.patrons++; } });
  const items = migrate({ items: incoming.items || [], settings: { genres: S().genres, genreSet: (incoming.settings || {}).genreSet } }).items;
  items.forEach(i => { if (!has(DB.items, i.id) && !findItemByCode(i.barcode)) { DB.items.push(i); added.items++; } });
  items.forEach(i => { if (i.genre) addGenre(i.genre, true); });
  (incoming.loans || []).forEach(l => { if (!has(DB.loans, l.id) && itemById(l.itemId) && patronById(l.patronId)) { DB.loans.push(l); added.loans++; } });
  (incoming.holds || []).forEach(h => { if (!has(DB.holds, h.id) && itemById(h.itemId) && patronById(h.patronId)) { DB.holds.push(h); added.holds++; } });
  saveDB();
  return { ok: true, added: added };
}

function resetDB() {
  DB = blankDB();
  saveDB();
}

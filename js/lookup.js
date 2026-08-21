/* ---------------------------------------------------------------
   ISBN lookup. Tries Open Library first (no key, generous CORS),
   falls back to Google Books. Both are optional — every field can
   always be typed by hand, and the app works fully offline without
   this file ever succeeding.
   --------------------------------------------------------------- */

function isbnDigits(raw) {
  const s = normCode(raw);
  return /^(\d{9}[\dX]|\d{13})$/.test(s) ? s : null;
}

function looksLikeISBN(raw) {
  return !!isbnDigits(raw);
}

async function fetchJSON(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* Open Library sometimes lists the same author or publisher twice. */
function uniq(list) {
  const seen = {};
  return list.filter(x => {
    const k = String(x).trim().toLowerCase();
    if (!k || seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

async function lookupOpenLibrary(isbn) {
  const url = 'https://openlibrary.org/api/books?bibkeys=ISBN:' + encodeURIComponent(isbn) + '&format=json&jscmd=data';
  const data = await fetchJSON(url);
  const rec = data && data['ISBN:' + isbn];
  if (!rec) return null;
  return {
    isbn: isbn,
    title: rec.subtitle ? rec.title + ': ' + rec.subtitle : rec.title,
    author: uniq((rec.authors || []).map(a => a.name)).join(', '),
    publisher: uniq((rec.publishers || []).map(p => p.name)).join(', '),
    year: (String(rec.publish_date || '').match(/\d{4}/) || [''])[0],
    cover: (rec.cover && (rec.cover.medium || rec.cover.large || rec.cover.small)) || '',
    tags: uniq((rec.subjects || []).map(s => s.name)).slice(0, 4),
    source: 'Open Library'
  };
}

async function lookupGoogleBooks(isbn) {
  const url = 'https://www.googleapis.com/books/v1/volumes?q=isbn:' + encodeURIComponent(isbn);
  const data = await fetchJSON(url);
  const v = data && data.items && data.items[0] && data.items[0].volumeInfo;
  if (!v) return null;
  return {
    isbn: isbn,
    title: v.subtitle ? v.title + ': ' + v.subtitle : v.title,
    author: uniq(v.authors || []).join(', '),
    publisher: v.publisher || '',
    year: (String(v.publishedDate || '').match(/\d{4}/) || [''])[0],
    cover: (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail) || '').replace(/^http:/, 'https:'),
    tags: (v.categories || []).slice(0, 4),
    source: 'Google Books'
  };
}

/* Resolves to book data, or null if neither service knows the ISBN.
   Rejects only when both services are unreachable (offline). */
async function lookupISBN(raw) {
  const isbn = isbnDigits(raw);
  if (!isbn) return null;
  let reachable = false;
  for (const fn of [lookupOpenLibrary, lookupGoogleBooks]) {
    try {
      const res = await fn(isbn);
      reachable = true;
      if (res && res.title) return res;
    } catch (e) { /* try the next service */ }
  }
  if (!reachable) throw new Error('offline');
  return null;
}

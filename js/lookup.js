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
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
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

/* Open Library's search index: one request, CORS-enabled, includes author names.
   (Their older /api/books endpoint was retired in 2026 and now 404s.) */
async function lookupOpenLibrarySearch(isbn) {
  const url = 'https://openlibrary.org/search.json?isbn=' + encodeURIComponent(isbn) +
    '&fields=title,subtitle,author_name,publisher,first_publish_year,publish_year,cover_i,subject&limit=1';
  // The search index merges every edition of a book, so its publisher and year
  // can belong to some other printing. Ask for the exact edition alongside it.
  const [data, ed] = await Promise.all([
    fetchJSON(url),
    fetchJSON('https://openlibrary.org/isbn/' + encodeURIComponent(isbn) + '.json', 6000).catch(() => null)
  ]);
  const doc = data && data.docs && data.docs[0];
  if (!doc || !doc.title) return null;
  const edYear = ed && (String(ed.publish_date || '').match(/\d{4}/) || [''])[0];
  return {
    isbn: isbn,
    title: doc.subtitle ? doc.title + ': ' + doc.subtitle : doc.title,
    author: uniq(doc.author_name || []).join(', '),
    publisher: ed && ed.publishers ? uniq(ed.publishers).slice(0, 1).join('') : '',
    year: edYear || String(doc.first_publish_year || ''),
    cover: doc.cover_i ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-M.jpg' : '',
    tags: uniq(doc.subject || []).slice(0, 4),
    subjects: doc.subject || [],
    source: 'Open Library'
  };
}

/* The edition record itself. Catches brand-new books the search index hasn't
   picked up yet, at the cost of one extra request per author name. */
async function lookupOpenLibraryEdition(isbn) {
  let ed;
  try {
    ed = await fetchJSON('https://openlibrary.org/isbn/' + encodeURIComponent(isbn) + '.json');
  } catch (e) {
    if (e.status === 404) return null; // unknown ISBN, not an outage
    throw e;
  }
  if (!ed || !ed.title) return null;
  // Many editions only point at their "work"; the authors live there instead.
  let authorKeys = (ed.authors || []).map(a => a.key);
  if (!authorKeys.length && ed.works && ed.works[0]) {
    const work = await fetchJSON('https://openlibrary.org' + ed.works[0].key + '.json', 5000).catch(() => null);
    authorKeys = ((work && work.authors) || []).map(a => a.author && a.author.key).filter(Boolean);
  }
  const names = await Promise.all(authorKeys.slice(0, 3).map(key =>
    fetchJSON('https://openlibrary.org' + key + '.json', 5000).then(r => r.name).catch(() => '')));
  return {
    isbn: isbn,
    title: ed.subtitle ? ed.title + ': ' + ed.subtitle : ed.title,
    author: uniq(names).join(', '),
    publisher: uniq(ed.publishers || []).slice(0, 1).join(''),
    year: (String(ed.publish_date || '').match(/\d{4}/) || [''])[0],
    cover: ed.covers && ed.covers[0] > 0 ? 'https://covers.openlibrary.org/b/id/' + ed.covers[0] + '-M.jpg' : '',
    tags: (ed.subjects || []).slice(0, 4),
    subjects: ed.subjects || [],
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
    subjects: v.categories || [],
    source: 'Google Books'
  };
}

/* Resolves to book data, or null if no service knows the ISBN.
   Rejects with 'offline' when nothing could be reached at all, or
   'unavailable' when services answered but only with errors (outage,
   rate limit) — two different things to tell the teacher. */
async function lookupISBN(raw) {
  const isbn = isbnDigits(raw);
  if (!isbn) return null;
  let answered = false, healthy = false;
  for (const fn of [lookupOpenLibrarySearch, lookupOpenLibraryEdition, lookupGoogleBooks]) {
    try {
      const res = await fn(isbn);
      answered = healthy = true;
      if (res && res.title) return res;
    } catch (e) {
      if (e.status) answered = true; // the server replied, just not usefully
      console.warn('ISBN lookup: ' + fn.name + ' failed', e);
    }
  }
  if (healthy) return null;
  throw new Error(answered ? 'unavailable' : 'offline');
}

/* ---------------------------------------------------------------
   Genre hints. Open Library merges subject headings across every
   edition of a book, adaptations included (The Giver has graphic-novel
   editions, so it carries "Graphic novels" headings too). That makes a
   single confident answer unreliable, so this ranks genres by how many
   headings support them and offers the top two for the teacher to pick.
   It never chooses on its own.
   --------------------------------------------------------------- */
const GENRE_HINTS = [
  ['Graphic Novels', /graphic novel|comic books?, strips|\bcomics\b|\bmanga\b/],
  ['Biography', /biograph|memoir|autobiograph/],
  ['Dystopian', /dystopia|totalitarian|post-apocalyptic/, 'decisive'],
  ['Fantasy / Sci-Fi', /\bfantasy\b|\bmagic\b|dragons|wizards|science fiction|mytholog|folklore|fairy tales|horror|ghost stories|\bghosts\b|supernatural/],
  ['Historical Fiction', /historical fiction|history[^|]*fiction/],
  ['Adventure', /adventure|survival/],
  // Realistic Fiction is also where mysteries, funny books, sports and verse novels go.
  ['Realistic Fiction', /realistic fiction|mystery|mysteries|detective|humorous|\bhumor\b|\bsports\b|baseball|basketball|soccer|novels in verse|friendship[^|]*fiction|family[^|]*fiction|schools[^|]*fiction/]
  // No Nonfiction hint: informational subject headings look like everything else's.
];

/* 'decisive' marks headings that only ever appear on that kind of book. Dystopian novels
   also collect piles of generic Adventure / Science Fiction headings (The Hunger Games has
   eight "adventure" ones), so a single dystopia heading outranks any count of those. */
function suggestGenres(subjects, genres, max) {
  const score = {};
  (subjects || []).forEach(sub => {
    const t = String(sub).toLowerCase();
    GENRE_HINTS.forEach(([g, re, decisive]) => { if (re.test(t)) score[g] = (score[g] || 0) + (decisive ? 1000 : 1); });
  });
  return Object.keys(score)
    .sort((a, b) => score[b] - score[a])
    .map(g => (genres || []).find(x => normName(x) === normName(g)))
    .filter(Boolean)
    .slice(0, max || 2);
}

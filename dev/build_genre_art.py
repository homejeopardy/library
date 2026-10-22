"""Regenerates js/genre-art.js from the SVG files in genre-icons/.

Run from the project root after editing any icon:  python3 dev/build_genre_art.py
"""
import json, re, os

ORDER = [('Adventure', 'adventure'), ('Biography', 'biography'), ('Dystopian', 'dystopian'),
         ('Fantasy / Sci-Fi', 'fantasy-sci-fi'), ('Graphic Novels', 'graphic-novels'),
         ('Historical Fiction', 'historical-fiction'), ('Nonfiction', 'nonfiction'),
         ('Realistic Fiction', 'realistic-fiction'), ('Plays & Poems', 'plays-poems')]

HEADER = """/* ---------------------------------------------------------------
   The genre drawings, inlined so labels print with no network and no
   waiting on file loads. Source files live in genre-icons/ — edit
   those, then re-run the generator noted in the README.
   --------------------------------------------------------------- */

const GENRE_ART = {
%s
};

/* Draws one icon at whatever size the caller asks for. */
function genreArt(genre, size) {
  const body = GENRE_ART[genre];
  if (!body) return '';
  return '<svg class="genre-art" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}
"""

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = []
for label, slug in ORDER:
    path = os.path.join(root, 'genre-icons', slug + '.svg')
    body = ' '.join(re.search(r'</title>(.*)</svg>', open(path).read(), re.S).group(1).split())
    rows.append('  %s: %s' % (json.dumps(label), json.dumps(body)))

open(os.path.join(root, 'js', 'genre-art.js'), 'w').write(HEADER % ',\n'.join(rows))
print('wrote js/genre-art.js from %d icons' % len(ORDER))

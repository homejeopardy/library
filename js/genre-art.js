/* ---------------------------------------------------------------
   The genre drawings, inlined so labels print with no network and no
   waiting on file loads. Source files live in genre-icons/ — edit
   those, then re-run the generator noted in the README.
   --------------------------------------------------------------- */

const GENRE_ART = {
  "Adventure": "<circle cx=\"12\" cy=\"12\" r=\"9\"/> <path d=\"M15.6 8.4 13.4 13.4 8.4 15.6 10.6 10.6Z\"/>",
  "Biography": "<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"2.5\"/> <circle cx=\"12\" cy=\"10\" r=\"2.6\"/> <path d=\"M7.6 17.6c1-2.4 2.5-3.6 4.4-3.6s3.4 1.2 4.4 3.6\"/>",
  "Dystopian": "<path d=\"M2.5 12S6.1 6 12 6s9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z\"/> <circle cx=\"12\" cy=\"12\" r=\"2.7\"/>",
  "Fantasy / Sci-Fi": "<circle cx=\"12\" cy=\"12\" r=\"6.2\"/> <ellipse cx=\"12\" cy=\"12\" rx=\"10.6\" ry=\"3.4\" transform=\"rotate(-22 12 12)\"/>",
  "Graphic Novels": "<rect x=\"3\" y=\"3.5\" width=\"18\" height=\"17\" rx=\"2.2\"/> <path d=\"M8 8h8a1.8 1.8 0 0 1 1.8 1.8v2.9A1.8 1.8 0 0 1 16 14.5h-4.3L8.6 17v-2.5H8a1.8 1.8 0 0 1-1.8-1.8V9.8A1.8 1.8 0 0 1 8 8Z\"/>",
  "Historical Fiction": "<path d=\"M6 3h12M6 21h12\"/> <path d=\"M7.6 3v2.6c0 2 1.8 3.4 3.2 4.6.6.5.9.8.9 1.8s-.3 1.3-.9 1.8c-1.4 1.2-3.2 2.6-3.2 4.6V21\"/> <path d=\"M16.4 3v2.6c0 2-1.8 3.4-3.2 4.6-.6.5-.9.8-.9 1.8s.3 1.3.9 1.8c1.4 1.2 3.2 2.6 3.2 4.6V21\"/>",
  "Nonfiction": "<path d=\"M12 2.6a6.2 6.2 0 0 0-3.7 11.2c.7.5 1.1 1.3 1.2 2.2h5c.1-.9.5-1.7 1.2-2.2A6.2 6.2 0 0 0 12 2.6Z\"/> <path d=\"M9.5 19.2h5M10.8 22h2.4\"/>",
  "Realistic Fiction": "<circle cx=\"8.6\" cy=\"8\" r=\"3.1\"/> <path d=\"M3.2 19.8c0-3 2.4-5.4 5.4-5.4s5.4 2.4 5.4 5.4\"/> <circle cx=\"17.4\" cy=\"10.2\" r=\"2.4\"/> <path d=\"M15.6 19.8c0-2.5 1.3-4.2 3.4-4.2 1.9 0 2.8 1.7 2.8 4.2\"/>",
  "Plays & Poems": "<path d=\"M4.6 6.2C6.9 5 9.3 4.4 12 4.4s5.1.6 7.4 1.8c.2 6.6-2.4 13.4-7.4 13.4S4.4 12.8 4.6 6.2Z\"/> <ellipse cx=\"9.2\" cy=\"9.7\" rx=\"1\" ry=\"1.2\" fill=\"currentColor\" stroke=\"none\"/> <ellipse cx=\"14.8\" cy=\"9.7\" rx=\"1\" ry=\"1.2\" fill=\"currentColor\" stroke=\"none\"/> <path d=\"M9.1 13.9c.9.8 1.9 1.2 2.9 1.2s2-.4 2.9-1.2\"/>"
};

/* Draws one icon at whatever size the caller asks for. */
function genreArt(genre, size) {
  const body = GENRE_ART[genre];
  if (!body) return '';
  return '<svg class="genre-art" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}

/* ---------------------------------------------------------------
   Code 39 barcodes, drawn as SVG.

   Code 39 is the old library standard: every scanner reads it out of
   the box, it needs no check digit (the symbology is self-checking),
   and it carries letters, digits and "-" — so a label can hold the
   barcode exactly as it is stored, "CL-0042" and all. It is bulky
   compared to Code 128, which is why the spine label runs it along
   the long edge rather than across the narrow one.

   Each character is nine elements — five bars and four spaces,
   alternating, bar first — of which exactly three are wide. Widths
   here are in SVG units: narrow 2, wide 5, giving the 2.5:1 ratio
   printers hold most reliably at small sizes.
   --------------------------------------------------------------- */

const CODE39 = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  'A': 'wnnnnwnnw', 'B': 'nnwnnwnnw', 'C': 'wnwnnwnnn', 'D': 'nnnnwwnnw',
  'E': 'wnnnwwnnn', 'F': 'nnwnwwnnn', 'G': 'nnnnnwwnw', 'H': 'wnnnnwwnn',
  'I': 'nnwnnwwnn', 'J': 'nnnnwwwnn', 'K': 'wnnnnnnww', 'L': 'nnwnnnnww',
  'M': 'wnwnnnnwn', 'N': 'nnnnwnnww', 'O': 'wnnnwnnwn', 'P': 'nnwnwnnwn',
  'Q': 'nnnnnnwww', 'R': 'wnnnnnwwn', 'S': 'nnwnnnwwn', 'T': 'nnnnwnwwn',
  'U': 'wwnnnnnnw', 'V': 'nwwnnnnnw', 'W': 'wwwnnnnnn', 'X': 'nwnnwnnnw',
  'Y': 'wwnnwnnnn', 'Z': 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn'
};

const BAR_NARROW = 2, BAR_WIDE = 5, BAR_GAP = 2, BAR_QUIET = 20;

function code39Supports(text) {
  const up = String(text || '').trim().toUpperCase();
  return !!up && up.indexOf('*') === -1 && up.split('').every(c => CODE39[c]);
}

/* Returns an SVG whose viewBox is the symbol's true proportions, so the
   caller sets its printed length with width/height and the bar widths
   stay in step. Returns '' for anything Code 39 cannot carry. */
function code39SVG(text, barColor) {
  const up = String(text || '').trim().toUpperCase();
  if (!code39Supports(up)) return '';
  const chars = ('*' + up + '*').split('');
  const bars = [];
  let x = BAR_QUIET;
  chars.forEach((ch, n) => {
    const pattern = CODE39[ch];
    for (let i = 0; i < 9; i++) {
      const w = pattern[i] === 'w' ? BAR_WIDE : BAR_NARROW;
      if (i % 2 === 0) bars.push('<rect x="' + x + '" y="0" width="' + w + '" height="100"/>');
      x += w;
    }
    if (n < chars.length - 1) x += BAR_GAP;   // inter-character gap, one narrow space
  });
  const total = x + BAR_QUIET;
  return '<svg class="barcode" viewBox="0 0 ' + total + ' 100" preserveAspectRatio="none" ' +
    'shape-rendering="crispEdges" fill="' + (barColor || '#000') + '" aria-hidden="true">' + bars.join('') + '</svg>';
}

/* How many SVG units long the symbol is — used to work out the printed
   width of one narrow bar, which decides whether a scanner can read it. */
function code39Units(text) {
  const n = String(text || '').trim().length + 2;        // plus the two '*' guards
  return n * (6 * BAR_NARROW + 3 * BAR_WIDE) + (n - 1) * BAR_GAP + 2 * BAR_QUIET;
}

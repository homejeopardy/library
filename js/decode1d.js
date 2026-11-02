/* ---------------------------------------------------------------
   Reading a barcode out of a camera frame, in plain JavaScript.

   Chrome on Android has a barcode reader built in and we use it when
   it is there. Safari on the iPhone has none, so this file is the
   whole reader on that half of the school's phones. It is written out
   here rather than pulled from a library because the app has no build
   step and nothing it ships comes from anywhere else.

   It reads the two symbologies this library actually uses:

   - Code 39, which is what js/barcode.js prints on every spine label.
   - EAN-13, which is the ISBN on the back of a book. A UPC-A barcode
     is an EAN-13 with a leading zero, so those come out right too.

   The method is the old one: take a straight line of pixels across
   the picture, decide which stretches are dark, measure how long each
   stretch is, and read the widths. A line that crosses the barcode
   cleanly decodes; a line that misses it fails, which is why several
   are tried, down the frame and across it — a book held spine-up puts
   its barcode on its side, so the columns matter as much as the rows.
   --------------------------------------------------------------- */

const Decode1D = (function () {

  /* Pattern -> character, the reverse of the table js/barcode.js prints with. */
  const C39 = {};
  Object.keys(CODE39).forEach(ch => { C39[CODE39[ch]] = ch; });

  /* The ten EAN digits, as the widths of their four runs in modules. Each
     digit spans exactly seven modules. A left-hand digit carries these widths
     for odd parity and the same widths reversed for even; a right-hand digit
     is the mirror image in ink, which comes to the same widths again. */
  const EAN_DIGITS = [
    [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
    [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]
  ];

  /* EAN-13 holds thirteen digits in twelve digits' worth of bars: the first
     is spelled out by which of the left-hand six are odd and which even. */
  const EAN_PARITY = ['OOOOOO', 'OOEOEE', 'OOEEOE', 'OOEEEO', 'OEOOEE',
                      'OEEOOE', 'OEEEOO', 'OEOEOE', 'OEOEEO', 'OEEOEO'];

  /* ---------------- pixels to runs ---------------- */

  /* One straight line of brightness through the frame. `step` is how far
     apart two neighbouring samples sit in the pixel array, so the same
     routine reads a row (step 4) or a column (step 4 * width). */
  function line(data, start, step, count) {
    const out = new Uint8Array(count);
    let o = start;
    for (let i = 0; i < count; i++, o += step) {
      out[i] = (data[o] * 77 + data[o + 1] * 151 + data[o + 2] * 28) >> 8;
    }
    return out;
  }

  /* Alternating run lengths, dark and light. The cut between dark and light
     follows a moving average rather than one threshold for the whole line, so
     a shadow falling across half the label does not swallow every bar under
     it. A line with almost no contrast is paper or tabletop and is dropped
     before it can produce convincing nonsense. */
  function runsOf(px) {
    const n = px.length;
    if (n < 24) return null;
    let min = 255, max = 0;
    for (let i = 0; i < n; i++) { if (px[i] < min) min = px[i]; if (px[i] > max) max = px[i]; }
    if (max - min < 40) return null;

    const win = Math.max(10, n >> 5);
    const sum = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) sum[i + 1] = sum[i] + px[i];

    const counts = [];
    let dark = -1, len = 0, first = 0;
    for (let i = 0; i < n; i++) {
      const a = i - win < 0 ? 0 : i - win;
      const b = i + win + 1 > n ? n : i + win + 1;
      const here = px[i] * (b - a) < sum[b] - sum[a] ? 1 : 0;
      if (dark === -1) { dark = here; first = here; len = 1; continue; }
      if (here === dark) len++;
      else { counts.push(len); dark = here; len = 1; }
    }
    counts.push(len);
    return counts.length < 15 ? null : { counts: counts, startsDark: first === 1 };
  }

  /* ---------------- Code 39 ---------------- */

  /* One Code 39 character: nine runs, of which exactly three are wide. The
     line between narrow and wide is taken from the character itself — sort
     the nine and the split sits between the sixth and seventh — so the
     reader never needs to be told what ratio the label was printed at. */
  function c39Char(counts, i) {
    if (i + 9 > counts.length) return null;
    const nine = counts.slice(i, i + 9);
    const sorted = nine.slice().sort((a, b) => a - b);
    if (sorted[6] < sorted[5] * 1.25) return null;         // no clear split: noise
    const cut = (sorted[5] + sorted[6]) / 2;
    let wide = 0, pattern = '';
    for (let k = 0; k < 9; k++) {
      const w = nine[k] > cut;
      if (w) wide++;
      pattern += w ? 'w' : 'n';
    }
    return wide === 3 ? (C39[pattern] || null) : null;
  }

  /* The narrow bar this character is built from: nine runs spanning six narrow
     and three wide, which at the 2.5:1 ratio the labels print at is 13.5. */
  function c39Unit(counts, p) {
    let total = 0;
    for (let k = 0; k < 9; k++) total += counts[p + k];
    return total / 13.5;
  }

  /* A whole symbol, start marker to stop marker. Code 39 on its own is a loose
     thing to look for — any nine runs with three wide ones spell something —
     so the structure around each character does most of the work: the symbol
     sits in white paper, every character is built from the same narrow bar as
     the start marker, and the characters are a single narrow bar apart. */
  function code39(counts, startsDark) {
    for (let i = 0; i + 9 <= counts.length; i++) {
      if (((i % 2 === 0) === startsDark) === false) continue;   // a character opens on a bar
      if (c39Char(counts, i) !== '*') continue;
      const unit = c39Unit(counts, i);
      if (i < 1 || counts[i - 1] < unit * 3) continue;          // quiet zone before the symbol
      const out = [];
      for (let p = i + 10; p + 9 <= counts.length; p += 10) {   // nine runs, then the gap
        if (Math.abs(counts[p - 1] - unit) > unit * 0.75) break;   // the gap between characters
        const u = c39Unit(counts, p);
        if (u < unit * 0.65 || u > unit * 1.55) break;              // built to the same scale
        const ch = c39Char(counts, p);
        if (ch == null) break;
        if (ch !== '*') { out.push(ch); continue; }
        // Every barcode this library prints is at least three characters, and
        // demanding that costs nothing while ruling out a short fluke.
        if (out.length < 3) break;
        if (p + 9 < counts.length && counts[p + 9] < unit * 3) break;   // quiet zone after
        return out.join('');
      }
    }
    return null;
  }

  /* ---------------- EAN-13 ---------------- */

  /* How far four measured runs sit from a digit's pattern, in modules. Scoring
     the fit rather than rounding each run to a whole number of modules is what
     lets a soft or low-light photograph read: at an arm's length an EAN module
     is only two or three pixels wide, and a blurred edge moves a run by most of
     one of them. Returns null when any single run is too far out to believe. */
  const MAX_RUN_ERROR = 0.8;      // modules, for one run
  const MAX_MEAN_ERROR = 0.5;     // modules, averaged over the four

  function patternError(four, pattern, unit) {
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const off = Math.abs(four[k] - pattern[k] * unit) / unit;
      if (off > MAX_RUN_ERROR) return null;
      total += off;
    }
    const mean = total / 4;
    return mean > MAX_MEAN_ERROR ? null : mean;
  }

  /* Four runs spanning seven modules. The module width is measured from the
     digit rather than from the whole symbol, so a barcode photographed at an
     angle — where the far end is narrower than the near end — still reads. */
  function eanDigit(counts, p, rightHalf) {
    if (p + 4 > counts.length) return null;
    const four = [counts[p], counts[p + 1], counts[p + 2], counts[p + 3]];
    if (four[0] < 1 || four[1] < 1 || four[2] < 1 || four[3] < 1) return null;
    const unit = (four[0] + four[1] + four[2] + four[3]) / 7;
    let best = null, bestError = Infinity;
    for (let d = 0; d < 10; d++) {
      const pat = EAN_DIGITS[d];
      const odd = patternError(four, pat, unit);
      if (odd != null && odd < bestError) { bestError = odd; best = { digit: d, parity: 'O' }; }
      if (rightHalf) continue;
      const even = patternError(four, [pat[3], pat[2], pat[1], pat[0]], unit);
      if (even != null && even < bestError) { bestError = even; best = { digit: d, parity: 'E' }; }
    }
    return best;
  }

  /* Every EAN-13 ends in a check digit over the twelve before it. Nothing is
     reported unless that adds up, which is what keeps a half-seen barcode or a
     stripe of shirt from being read as a real ISBN. */
  function eanCheck(digits) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (+digits[i]) * (i % 2 ? 3 : 1);
    return (10 - sum % 10) % 10 === +digits[12];
  }

  /* A guard is some number of runs that should each be one module wide. */
  function guard(counts, p, n) {
    let total = 0;
    for (let k = 0; k < n; k++) {
      if (p + k >= counts.length || !counts[p + k]) return 0;
      total += counts[p + k];
    }
    const unit = total / n;
    for (let k = 0; k < n; k++) if (Math.abs(counts[p + k] - unit) > unit * 0.7) return 0;
    return unit;
  }

  /* Reading each digit on its own terms is what copes with a soft photograph,
     but on its own it is also loose enough that a frame of pure camera noise
     will, sooner or later, throw up thirteen digits whose check digit happens
     to add up. These are the checks that stop that: a real EAN-13 is 95
     modules wide end to end, its guards and its digits are all built from the
     same module, and it sits in white paper rather than butting against more
     bars. Noise satisfies one of those by luck and never all of them. */
  const EAN_MODULES = 95;

  function ean13At(counts, i) {
    const unit = guard(counts, i, 3);
    if (!unit) return null;

    // A quiet zone of white paper before the first bar.
    if (i < 1 || counts[i - 1] < unit * 3) return null;

    // 59 runs, which should span 95 modules of the width the start guard set.
    let span = 0;
    for (let k = 0; k < 59; k++) {
      if (i + k >= counts.length) return null;
      span += counts[i + k];
    }
    if (Math.abs(span - EAN_MODULES * unit) > EAN_MODULES * unit * 0.12) return null;

    const sized = p => {                          // a digit built from this symbol's module
      const w = (counts[p] + counts[p + 1] + counts[p + 2] + counts[p + 3]) / 7;
      return w > unit * 0.65 && w < unit * 1.5;
    };

    let p = i + 3;
    const left = [], parity = [];
    for (let d = 0; d < 6; d++, p += 4) {
      if (!sized(p)) return null;
      const hit = eanDigit(counts, p, false);
      if (!hit) return null;
      left.push(hit.digit);
      parity.push(hit.parity);
    }
    const mid = guard(counts, p, 5);
    if (!mid || mid < unit * 0.65 || mid > unit * 1.5) return null;
    p += 5;
    const right = [];
    for (let d = 0; d < 6; d++, p += 4) {
      if (!sized(p)) return null;
      const hit = eanDigit(counts, p, true);
      if (!hit) return null;
      right.push(hit.digit);
    }
    const end = guard(counts, p, 3);
    if (!end || end < unit * 0.65 || end > unit * 1.5) return null;
    if (p + 3 < counts.length && counts[p + 3] < unit * 3) return null;   // quiet zone after
    const first = EAN_PARITY.indexOf(parity.join(''));
    if (first < 0) return null;
    const digits = String(first) + left.join('') + right.join('');
    return eanCheck(digits) ? digits : null;
  }

  function ean13(counts, startsDark) {
    for (let i = 0; i + 59 <= counts.length; i++) {
      if (((i % 2 === 0) === startsDark) === false) continue;   // the symbol opens on a bar
      const hit = ean13At(counts, i);
      if (hit) return hit;
    }
    return null;
  }

  /* ---------------- putting one line through both readers ---------------- */

  /* A barcode pointed at the camera the other way up arrives as its own runs
     backwards, so every line is tried in both directions. Reversing the runs
     flips which end the reader starts from; whether the first run is dark then
     depends on whether there was an odd or an even number of them. */
  function readLine(px) {
    const r = runsOf(px);
    if (!r) return null;
    const back = { counts: r.counts.slice().reverse(),
                   startsDark: r.counts.length % 2 ? r.startsDark : !r.startsDark };
    return code39(r.counts, r.startsDark) || ean13(r.counts, r.startsDark) ||
           code39(back.counts, back.startsDark) || ean13(back.counts, back.startsDark);
  }

  /* Tries lines across the frame and down it, working outwards from the
     middle: a barcode held in the viewfinder's box is crossed by the middle
     lines first, so the ordinary case finishes soonest. Returns the text of
     the first barcode that decodes, or null. */
  function read(imageData, lines) {
    const data = imageData.data, w = imageData.width, h = imageData.height;
    const n = lines || 15;
    for (let i = 0; i < n; i++) {
      const away = Math.ceil(i / 2) * (i % 2 ? 1 : -1) / (n / 2);   // 0, +, -, ++, --
      const y = Math.round(h / 2 + away * h * 0.4);
      if (y > 0 && y < h) {
        const hit = readLine(line(data, y * w * 4, 4, w));
        if (hit) return hit;
      }
      const x = Math.round(w / 2 + away * w * 0.4);
      if (x > 0 && x < w) {
        const hit = readLine(line(data, x * 4, w * 4, h));
        if (hit) return hit;
      }
    }
    return null;
  }

  return { read: read, readLine: readLine, runsOf: runsOf, code39: code39, ean13: ean13 };
})();

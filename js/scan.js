/* ---------------------------------------------------------------
   Scanning with a phone's camera.

   The desk already takes barcodes from a USB scanner, which is just a
   keyboard that types very fast. This does the same job with a phone,
   so the shelves can be read, a returned book checked in, or an ISBN
   caught, without carrying a laptop around the room.

   Two readers sit behind one viewfinder:

   - Chrome on Android has BarcodeDetector built into the browser.
     Where it exists it is used, because it is written in C++ and
     finds a barcode anywhere in the picture at any angle.
   - Safari on the iPhone has nothing of the sort, so js/decode1d.js
     reads the frame instead.

   Both are told to look for the same two symbologies — Code 39 for a
   spine label, EAN-13 for an ISBN — so that a label which scans on one
   phone scans on the other. A reader that quietly handled more on
   Android would only make a failure on the iPhone baffling.

   The camera needs a secure page: it works on lib.catherine-crump.com
   and on localhost, and not from a file opened off the disk.
   --------------------------------------------------------------- */

const Scan = (function () {
  const FORMATS = ['code_39', 'ean_13'];
  const VERDICT = 'classroom-library-camera';   // 'yes' or 'no', once it is known
  const REPEAT_MS = 2500;                       // ignore the same code read again this soon

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  let detector = null, detectorTried = false;

  function nativeDetector() {
    if (detectorTried) return detector;
    detectorTried = true;
    try {
      if (typeof BarcodeDetector === 'function') detector = new BarcodeDetector({ formats: FORMATS });
    } catch (e) { detector = null; }
    return detector;
  }

  /* ---------------- is there a back camera ---------------- */

  /* Whether to offer a camera button at all. The honest answer needs the
     camera's name, and a browser hides those until some camera permission has
     been granted — asking outright would raise the permission prompt merely to
     decide whether to draw a button, which is a rude thing to do to someone
     who only opened the catalog. So: once the answer is known it is
     remembered, and until then a phone is told apart from a laptop by having
     more than one camera or a touch screen. The first real use settles it. */
  async function probe() {
    const remembered = lsGet(VERDICT);
    if (remembered) return remembered === 'yes';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    let cams = [];
    try {
      cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
    } catch (e) { return false; }
    if (!cams.length) return false;
    if (cams.some(d => d.label)) {
      const back = cams.some(d => /back|rear|environment/i.test(d.label));
      lsSet(VERDICT, back ? 'yes' : 'no');
      return back;
    }
    return cams.length > 1 || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  }

  /* The buttons are in the markup from the start and hidden by the stylesheet
     until this says otherwise, so no view has to be drawn twice. */
  async function announce() {
    const ok = await probe();
    document.documentElement.dataset.camera = ok ? 'yes' : 'no';
    return ok;
  }

  const available = () => document.documentElement.dataset.camera === 'yes';

  /* ---------------- a noise when something is read ---------------- */

  let audio = null;
  function beep(ok) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.frequency.value = ok ? 1180 : 320;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
      osc.connect(gain); gain.connect(audio.destination);
      osc.start(); osc.stop(audio.currentTime + 0.13);
    } catch (e) { /* a phone on silent, or no audio at all */ }
    try { if (navigator.vibrate) navigator.vibrate(ok ? 40 : [30, 40, 30]); } catch (e) { /* ignore */ }
  }

  /* ---------------- the viewfinder ---------------- */

  /* Opens the camera and keeps reading until it is closed.

       title    heading on the viewfinder
       hint     one line under it saying what to point at
       once     close as soon as something is read
       onCode   called with each barcode; whatever it returns (a string, or a
                promise of one) is shown in the viewfinder as the running log,
                so the person sees "Checked out to Amara" without looking away
                from the shelf. Returning nothing means "not interesting", and
                the same code can then be read again straight away.

     Returns a promise that settles when the viewfinder closes. */
  async function open(opts) {
    opts = opts || {};
    const box = document.createElement('dialog');
    box.className = 'cam';
    box.innerHTML = `
      <video class="cam-video" playsinline muted autoplay></video>
      <div class="cam-frame" aria-hidden="true"></div>
      <div class="cam-top">
        <h2 class="cam-title">${esc(opts.title || 'Scan')}</h2>
        ${opts.hint ? `<p class="cam-hint">${esc(opts.hint)}</p>` : ''}
      </div>
      <ul class="cam-log" aria-live="polite"></ul>
      <div class="cam-bar">
        <button type="button" class="btn cam-done">Done</button>
        <button type="button" class="btn btn-quiet cam-torch" hidden>Light</button>
      </div>`;
    document.body.appendChild(box);
    box.showModal();

    const video = box.querySelector('.cam-video');
    const log = box.querySelector('.cam-log');
    const torchBtn = box.querySelector('.cam-torch');
    let stream = null, frame = null, stop = false, done;
    const ending = new Promise(go => { done = go; });

    function say(text, kind) {
      const li = document.createElement('li');
      li.className = 'cam-line' + (kind ? ' cam-' + kind : '');
      li.textContent = text;
      log.insertBefore(li, log.firstChild);
      // Three. An answer about a book runs to four lines of its own, and a
      // taller stack than this starts covering the thing being pointed at.
      while (log.children.length > 3) log.removeChild(log.lastChild);
    }

    function close() {
      if (stop) return;
      stop = true;
      if (frame) cancelAnimationFrame(frame);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (box.open) box.close();
      box.remove();
      done();
    }
    box.querySelector('.cam-done').addEventListener('click', close);
    box.addEventListener('cancel', e => { e.preventDefault(); close(); });

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      lsSet(VERDICT, 'yes');
      document.documentElement.dataset.camera = 'yes';
    } catch (e) {
      // OverconstrainedError means there is a camera but none facing away —
      // a laptop, or a tablet with only a screen-side one. Worth remembering,
      // because it is the one answer that will not change.
      if (e && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
        lsSet(VERDICT, 'no');
        document.documentElement.dataset.camera = 'no';
        say('This device has no camera on its back. Use the scanner, or type the number.', 'bad');
      } else if (e && e.name === 'NotAllowedError') {
        say('The camera is blocked for this site. Allow it in the browser’s settings and try again.', 'bad');
      } else {
        say('The camera would not start.', 'bad');
      }
      beep(false);
      return ending;
    }

    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* some browsers resolve this late */ }

    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps && caps.torch) {
      torchBtn.hidden = false;
      let on = false;
      torchBtn.addEventListener('click', () => {
        on = !on;
        track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => { /* ignore */ });
        torchBtn.classList.toggle('on', on);
      });
    }

    const native = nativeDetector();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const seen = {};

    /* The square in the middle of the picture, taken at its own resolution
       rather than shrunk to fit: a barcode read across a squeezed frame has
       fewer pixels per bar, which is exactly what the reader needs most. The
       square covers a label held flat and a spine standing up. */
    function middle() {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return null;
      const side = Math.min(Math.min(vw, vh) * 0.92, 900);
      canvas.width = canvas.height = Math.round(side);
      ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, side, side);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    async function found(code) {
      const now = Date.now();
      if (seen[code] && now - seen[code] < REPEAT_MS) return;
      seen[code] = now;
      let message;
      try { message = await opts.onCode(code); } catch (e) { message = (e && e.message) || 'That did not work.'; }
      if (!message) { delete seen[code]; return; }      // not interesting: allow an immediate retry
      const bad = typeof message === 'object' && message.error;
      beep(!bad);
      say(bad ? message.error : String(message), bad ? 'bad' : 'good');
      if (opts.once && !bad) setTimeout(close, 350);    // long enough to be read
    }

    async function tick() {
      if (stop) return;
      try {
        if (native) {
          const hits = await native.detect(video);
          if (hits && hits.length) await found(String(hits[0].rawValue || '').trim());
        } else {
          const img = middle();
          if (img) {
            const hit = Decode1D.read(img);
            if (hit) await found(hit);
          }
        }
      } catch (e) { /* a frame that cannot be read is simply the next frame's problem */ }
      if (!stop) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return ending;
  }

  return { open: open, probe: probe, announce: announce, available: available, beep: beep };
})();

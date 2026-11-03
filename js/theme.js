/* ---------------------------------------------------------------
   Light and dark.

   The app is dark because that is its own look, not because the
   computer asked for it: on a Mac set to Light it still opens dark.
   The switch in Settings can pin it light instead, or hand the
   decision back to the computer.

   The choice belongs to the device and not to the library. It is
   about the screen in front of you, so it is kept in this browser
   and never synced — one person's dark page doesn't follow everyone
   else to their own laptop. The teacher's page and the student
   station keep separate choices, because the station often sits in a
   window where the dark screen is a mirror.

   Loaded from <head>, before the first paint, so a page that is
   meant to be light never flashes dark on its way there.
   --------------------------------------------------------------- */

const Theme = (function () {
  const CHOICES = ['dark', 'light', 'auto'];
  const KEYS = { admin: 'classroom-library-theme', station: 'classroom-library-theme-station' };
  const mine = document.documentElement.dataset.role === 'student' ? 'station' : 'admin';
  const keyFor = which => KEYS[which] || KEYS[mine];

  function get(which) {
    let raw = null;
    try { raw = localStorage.getItem(keyFor(which)); } catch (e) { /* private mode */ }
    return CHOICES.indexOf(raw) === -1 ? 'dark' : raw;
  }

  /* "Match this computer" is worked out here rather than in a media query, so the
     stylesheet keeps one dark palette and one light one and nothing in between. */
  function resolved() {
    const choice = get(mine);
    if (choice !== 'auto') return choice;
    const light = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
    return light ? 'light' : 'dark';
  }

  function apply() { document.documentElement.setAttribute('data-theme', resolved()); }

  function set(which, next) {
    if (CHOICES.indexOf(next) === -1) return get(which);
    try { localStorage.setItem(keyFor(which), next); } catch (e) { /* private mode: this page only */ }
    apply();
    return next;
  }

  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: light)');
    const follow = () => { if (get(mine) === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', follow);
    else if (mq.addListener) mq.addListener(follow);
  }

  /* The station is set from the teacher's page, which is a different tab on the
     same device — so the station follows along without being reloaded. */
  window.addEventListener('storage', e => { if (e.key === keyFor(mine)) apply(); });

  apply();
  return { get: get, set: set, apply: apply, mine: mine, choices: CHOICES.slice() };
})();

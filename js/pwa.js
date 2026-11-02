/* ---------------------------------------------------------------
   Installing the app on a phone.

   Two halves. Registering the service worker, which is what makes the
   app open offline; and remembering the browser's offer to install, so
   Settings can put a button in front of it instead of hoping someone
   finds the right menu.

   Safari makes no such offer, so there the Settings section explains
   the Share → Add to Home Screen route by hand. Opened straight off
   the disk there is no service worker at all — browsers only allow one
   on a secure page — and the app carries on exactly as it did before.
   --------------------------------------------------------------- */

let installPrompt = null;

/* This file is loaded as js/pwa.js?v=56, so the release number is right here
   and can be handed to the worker rather than written down twice. */
const RELEASE = (function () {
  try { return new URL(document.currentScript.src).searchParams.get('v') || '0'; }
  catch (e) { return '0'; }
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // One worker for the whole site, registered from the root so it covers the
  // student page too. The student page sits a level down, hence the ../.
  const onStudentPage = document.documentElement.dataset.role === 'student';
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register((onStudentPage ? '../sw.js?v=' : 'sw.js?v=') + RELEASE,
        { scope: onStudentPage ? '../' : './' })
      .catch(() => { /* an older browser, or a page served without https */ });
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();                 // keep the browser's own banner out of the way
  installPrompt = e;
  document.documentElement.dataset.installable = 'yes';
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  document.documentElement.dataset.installable = 'done';
});

/* True once the app is running from the home screen rather than a browser tab. */
function runningInstalled() {
  return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
}

const onApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

async function askToInstall() {
  if (!installPrompt) return false;
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  installPrompt = null;
  return choice && choice.outcome === 'accepted';
}

/* ---------------------------------------------------------------
   Where the shared library lives. The app itself is public; the data
   (students' names and what they've borrowed) goes in this separate,
   PRIVATE repository. Change dataRepo if you name it differently.
   --------------------------------------------------------------- */
const SYNC_CONFIG = {
  dataRepo: 'homejeopardy/library-data',
  apiBase: 'https://api.github.com',
  pollSeconds: 20
};

// Local testing only: point sync at a stand-in for GitHub (see dev/mock_github_api.py).
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  try { SYNC_CONFIG.apiBase = localStorage.getItem('classroom-library-dev-api') || SYNC_CONFIG.apiBase; } catch (e) { /* ignore */ }
}

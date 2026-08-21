/* Small helpers shared across the app. No dependencies, no build step. */

function uid(prefix) {
  return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function nowISO() { return new Date().toISOString(); }

/* End of the given day, local time — due dates are "by close of that day". */
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtDateFull(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/* Whole calendar days between two instants; negative means the first is earlier. */
function daysBetween(a, b) {
  const MS = 86400000;
  const da = new Date(a); da.setHours(12, 0, 0, 0);
  const db = new Date(b); db.setHours(12, 0, 0, 0);
  return Math.round((db - da) / MS);
}

function relativeDue(dueISO) {
  const d = daysBetween(new Date(), dueISO);
  if (d === 0) return 'due today';
  if (d === 1) return 'due tomorrow';
  if (d > 1) return 'due in ' + d + ' days';
  if (d === -1) return '1 day overdue';
  return Math.abs(d) + ' days overdue';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Strip everything but digits and a trailing X, so 978-0-14-x matches 9780140x. */
function normCode(s) {
  return String(s == null ? '' : s).trim().toUpperCase().replace(/[\s-]/g, '');
}

function normName(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

/* Title Case a typed-in name, but leave names the user deliberately cased alone. */
function tidyName(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return t;
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t.replace(/\b[\p{L}'’-]+/gu, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function debounce(fn, ms) {
  let t;
  return function () {
    const args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(self, args), ms || 200);
  };
}

function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : (many || one + 's'));
}

function toast(message, kind) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, kind === 'error' ? 5200 : 3200);
}

/* --- CSV --- */
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(rows) {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Pure helpers shared by the store screens: money, search, time slots, totals and card checks.
import STORES from '../data/stores.json';

export { STORES };
export const DEPTS = ['Produce', 'Meat & Seafood', 'Bakery', 'Deli', 'Dairy & Eggs', 'Pantry', 'Prepared Meals'];
export const TINT = { Produce: '#e6f3df', 'Meat & Seafood': '#f8e3df', Bakery: '#f6ead6', Deli: '#f3e6ec', 'Dairy & Eggs': '#e4eef6', Pantry: '#efe9dd', 'Prepared Meals': '#e9e6f4' };
export const DELIVERY_MIN = 35, FREE_DELIVERY = 50, DELIVERY_FEE = 4.99, HOLD_MIN = 30;
export const STATUS = { delivery: ['Placed', 'Picking', 'Out for delivery', 'Completed'], pickup: ['Placed', 'Picking', 'Ready for pickup', 'Completed'] };

export const money = (n) => '$' + n.toFixed(2);
export const r2 = (n) => Math.round(n * 100) / 100;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---- search: exact text first, then word starts, then small typos (Levenshtein against each word)
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[n];
}
export function score(p, q) {
  q = q.toLowerCase().trim();
  if (!q) return 1;
  const hay = (p.name + ' ' + p.dept + ' ' + p.brand + ' ' + p.tags.join(' ')).toLowerCase();
  if (hay.includes(q)) return 3;
  const words = hay.split(/[^a-z0-9]+/);
  let ok = 0;
  for (const t of q.split(/\s+/)) {
    if (words.some((w) => w.startsWith(t))) ok += 2;
    else if (words.some((w) => { const tol = t.length > 6 ? 2 : 1; return t.length > 3 && (lev(t, w) <= tol || lev(t, w.slice(0, t.length)) <= tol); })) ok += 1;
    else return 0;
  }
  return ok;
}

// ---- totals, as the server works them out (server/pricing.js)
export function calc(items, mode) {
  const sub = items.reduce((a, x) => a + x.p.price * x.q, 0), saved = items.reduce((a, x) => a + (x.p.was ? (x.p.was - x.p.price) * x.q : 0), 0);
  const hst = sub * 0.13 * 0.25, fee = mode === 'pickup' || !sub || sub >= FREE_DELIVERY ? 0 : DELIVERY_FEE, total = sub + hst + fee;
  return { items, sub, saved, hst, fee, total, weighted: items.some((x) => x.p.per) };
}
export const chargeCents = (t) => Math.round((t.weighted ? r2(t.total * 1.1) : r2(t.total)) * 100);

// ---- time slots: 7 days of 1-hour slots from 10 am to 8 pm, at least 2 hours ahead
export const dayStart = (i) => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + i); };
export const fmtDay = (d) => d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
export const hh = (h) => (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
export const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
export function slotsFor(day, store) {
  const now = new Date(), d = dayStart(day), out = [];
  for (let h = 10; h < 20; h++) {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
    if (start - now < 2 * 3600e3) continue; // needs 2 hours to pick
    out.push({ h, start, full: (d.getDate() * 3 + h * 7 + store) % 5 === 0 });
  }
  return out;
}
export const slotLabel = (day, h) => `${fmtDay(dayStart(day))}, ${hh(h)} – ${hh(h + 1)}`;

// ---- demo card checks (Stripe checks real cards itself)
function luhn(n) {
  let s = 0, alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = +n[i];
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    s += d;
    alt = !alt;
  }
  return s % 10 === 0;
}
export function cardError(c) {
  const num = c.num.replace(/\s|-/g, '');
  if (!c.name.trim()) return 'Enter the name on the card.';
  if (!/^\d{13,19}$/.test(num) || !luhn(num)) return 'Check the card number. It should be 13 to 19 digits.';
  const m = c.exp.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m || +m[1] < 1 || +m[1] > 12) return 'Enter the expiry as MM/YY.';
  const now = new Date(), endOfMonth = new Date(2000 + +m[2], +m[1], 1);
  if (endOfMonth <= now) return 'This card has expired. Use another card.';
  if (!/^\d{3,4}$/.test(c.cvc)) return 'Enter the 3 or 4 digit security code.';
  if (num === '4000000000000002') return 'Your card was declined. Try another card or payment method.';
  return '';
}

// ---- browser storage for per-device preferences (store choice, guest cart)
export const local = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep going without */ } },
};

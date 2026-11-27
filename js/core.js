/* My Budget core: helpers, on-device storage, budget periods, calculations.
   Everything lives under window.B. Money is stored as plain numbers in the currency chosen in Preferences. */
(function () {
'use strict';
const B = window.B = { rev: 0, cache: {}, demo: false, storeMode: (/[?&]store=local/.test(location.search) ? 'local' : 'idb'), persisted: null };

/* ---------------- tiny helpers ---------------- */
B.$ = (s, r) => (r || document).querySelector(s);
B.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
B.sum = a => a.reduce((x, y) => x + y, 0);
B.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
B.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
B.uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);
B.plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const pad = n => String(n).padStart(2, '0');
B.iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
B.parse = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
B.todayISO = () => B.iso(new Date());
B.addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
B.diffDays = (a, b) => Math.round((a - b) / 864e5);
B.WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
B.WDL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
B.MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
B.MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
B.cached = (k, fn) => (k in B.cache) ? B.cache[k] : (B.cache[k] = fn());
B.invalidate = () => { B.rev++; B.cache = {}; };
B.ONE_OFF = 500;   // single purchases above this are ignored when projecting a daily rate

/* ---------------- money ---------------- */
B.cur = () => (B.state && B.state.settings.currency) || 'RM';
function money(n, dec) {
  const abs = Math.abs(n), r = Math.round(abs * Math.pow(10, dec));
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const c = B.cur();
  return (n < 0 && r > 0 ? '−' : '') + c + (c.length > 1 ? ' ' : '') + s;
}
B.fmt0 = n => money(n, 0);
B.fmt2 = n => money(n, 2);
B.num0 = n => Math.round(Math.abs(n)).toLocaleString('en-US');
B.axFmt = v => v >= 10000 ? (v / 1000) + 'K' : v.toLocaleString('en-US');
B.parseAmt = s => { const t = String(s || '').replace(/[^0-9.,]/g, ''); if (!t) return 0; const n = parseFloat(t.replace(/,/g, '')); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
// Typing helpers: "10000" becomes "10,000" as you type; two decimals at most.
B.fmtMoneyStr = s => {
  s = String(s == null ? '' : s).replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  let int = i < 0 ? s : s.slice(0, i); const dec = i < 0 ? null : s.slice(i + 1).replace(/\./g, '').slice(0, 2);
  int = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return int + (dec === null ? '' : '.' + dec);
};
B.numStr = (n, fixed) => (n > 0 ? B.fmtMoneyStr(fixed ? Number(n).toFixed(2) : String(Math.round(n * 100) / 100)) : '');

/* ---------------- colours (slots from the validated palette, plus a neutral) ---------------- */
B.COLORS = ['s2', 's3', 's4', 's5', 's6', 's7', 's8', 's1', 'gray'];
B.cvar = id => `var(--${id === 'gray' ? 's-gray' : id})`;
B.cink = id => id === 's4' ? '#0b0b0b' : '#fff';

/* ---------------- state ---------------- */
B.DEFAULT_CATS = [
  ['Housing', 's7', 1300, { fixed: true }], ['Groceries', 's6', 600, {}], ['Dining out', 's2', 350, {}], ['Transport', 's3', 300, {}],
  ['Bills & subscriptions', 's4', 350, { fixed: true }], ['Shopping', 's5', 250, {}], ['Leisure', 's8', 200, {}], ['Health', 'gray', 100, {}]
];
B.EXTRA_CATS = [['Insurance', 's4', 0, { fixed: true }], ['Family', 's2', 0, {}], ['Education', 's3', 0, { fixed: true }], ['Pets', 's6', 0, {}], ['Travel', 's8', 0, {}], ['Gifts & giving', 's5', 0, {}]];
B.acctColor = a => (a && a.color) || 'gray';
B.freshState = () => ({
  v: 1,
  settings: { currency: 'RM', cycleDay: 1, incomeExpected: 0, theme: null, weekStart: 1, lastBackup: 0, onboarded: false },
  cats: [], accts: [], tx: [], rules: [], goals: [], overrides: {}, alerts: {}, plan: null
});
B.state = B.freshState();

function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  const f = B.freshState();
  const out = Object.assign(f, s);
  out.settings = Object.assign(f.settings, s.settings || {});
  ['cats', 'accts', 'tx', 'rules', 'goals'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
  if (!out.overrides || typeof out.overrides !== 'object') out.overrides = {};
  if (!out.alerts || typeof out.alerts !== 'object') out.alerts = {};
  if (!out.plan || typeof out.plan !== 'object') out.plan = null;
  // older data: give each account a colour once, in its current order, so the colour then stays with the account
  out.accts.forEach((a, i) => { if (!a.color) a.color = B.COLORS[i % 8]; });
  return out;
}

/* ---------------- storage: IndexedDB first, localStorage as a fallback ---------------- */
let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(new Error('no indexedDB'));
    const r = indexedDB.open('my-budget', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('receipts'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
function run(store, mode, fn) {
  return openDB().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode), r = fn(t.objectStore(store));
    t.oncomplete = () => res(r && r.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  }));
}
const LS = 'my-budget-state-v1';
B.store = {
  async get(k) {
    if (B.storeMode === 'idb') { try { return await run('kv', 'readonly', s => s.get(k)); } catch (e) { B.storeMode = 'local'; } }
    try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; }
  },
  async set(k, v) {
    if (B.storeMode === 'idb') { try { await run('kv', 'readwrite', s => s.put(v, k)); return true; } catch (e) { B.storeMode = 'local'; } }
    try { localStorage.setItem(LS, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
};
B.receipt = {
  async put(id, blob) { if (B.storeMode !== 'idb') return false; try { await run('receipts', 'readwrite', s => s.put(blob, id)); return true; } catch (e) { return false; } },
  async get(id) { if (B.storeMode !== 'idb') return null; try { return await run('receipts', 'readonly', s => s.get(id)) || null; } catch (e) { return null; } },
  async del(id) { if (B.storeMode !== 'idb') return; try { await run('receipts', 'readwrite', s => s.delete(id)); } catch (e) { /* ignore */ } },
  async clear() { if (B.storeMode !== 'idb') return; try { await run('receipts', 'readwrite', s => s.clear()); } catch (e) { /* ignore */ } },
  async keys() { if (B.storeMode !== 'idb') return []; try { return await run('receipts', 'readonly', s => s.getAllKeys()) || []; } catch (e) { return []; } }
};

B.load = async function () {
  const s = migrate(await B.store.get('state'));
  B.state = s || B.freshState();
  B.demo = false;
  B.invalidate();
  return !!s;
};
let saveT = null, saving = Promise.resolve();
B.save = function () {
  if (B.demo) return;
  clearTimeout(saveT);
  saveT = setTimeout(B.flush, 180);
};
B.flush = function () {
  if (B.demo) return Promise.resolve();
  clearTimeout(saveT);
  saving = saving.then(async () => {
    const ok = await B.store.set('state', B.state);
    B.saveFailed = !ok;
    if (ok && B.persisted === null && navigator.storage && navigator.storage.persist) {
      try { B.persisted = await navigator.storage.persist(); } catch (e) { B.persisted = false; }
    }
  });
  return saving;
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') B.flush(); });
window.addEventListener('pagehide', () => B.flush());
B.commit = function (opts) { B.invalidate(); B.save(); if (B.render) B.render(opts); };

/* ---------------- budget periods (a "month" can start on any day) ---------------- */
const P = B.period = {};
P.cd = () => B.state.settings.cycleDay || 1;
P.keyOf = date => {
  let y = date.getFullYear(), m = date.getMonth();
  if (date.getDate() < P.cd()) { m--; if (m < 0) { m = 11; y--; } }
  return y + '-' + pad(m + 1);
};
P.info = key => B.cached('pi' + P.cd() + key, () => {
  const [y, m] = key.split('-').map(Number), cd = P.cd();
  const start = new Date(y, m - 1, cd), next = new Date(y, m, cd), end = B.addDays(next, -1), len = B.diffDays(next, start);
  const label = cd === 1 ? `${B.MONL[m - 1]} ${y}` : `${start.getDate()} ${B.MON[start.getMonth()]} – ${end.getDate()} ${B.MON[end.getMonth()]}`;
  return { key, start, next, end, len, label, name: label, short: cd === 1 ? B.MON[m - 1] : `${start.getDate()} ${B.MON[m - 1]}`, long: B.MONL[m - 1] };
});
P.prev = key => { const [y, m] = key.split('-').map(Number), d = new Date(y, m - 2, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
P.next = key => { const [y, m] = key.split('-').map(Number), d = new Date(y, m, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
P.cur = () => P.keyOf(new Date());
P.dayIdx = (info, iso) => B.diffDays(B.parse(iso), info.start) + 1;
P.dateOf = (info, d) => B.addDays(info.start, d - 1);
P.latest = key => key === P.cur() ? P.dayIdx(P.info(key), B.todayISO()) : P.info(key).len;
B.firstKey = () => B.cached('fk', () => {
  let min = null; B.state.tx.forEach(t => { if (min === null || t.date < min) min = t.date; });
  const f = min ? P.keyOf(B.parse(min)) : P.cur();
  return f > P.cur() ? P.cur() : f;
});
P.keys = (n) => {
  const out = [], cur = P.cur(), first = B.firstKey(); let k = cur;
  while (out.length < (n || 8)) { out.unshift(k); if (k <= first) break; k = P.prev(k); }
  return out;
};

/* ---------------- repeating entries ---------------- */
B.ruleMatches = (r, dt) => {
  const s = B.parse(r.start); if (dt < s) return false;
  if (r.end && dt > B.parse(r.end)) return false;
  if (r.freq === 'weekly') return dt.getDay() === s.getDay();
  const dim = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  if (r.freq === 'monthly') return dt.getDate() === Math.min(s.getDate(), dim);
  if (r.freq === 'yearly') return dt.getMonth() === s.getMonth() && dt.getDate() === Math.min(s.getDate(), dim);
  return false;
};
B.postDue = (st, todayIso) => {
  const today = B.parse(todayIso); let n = 0;
  st.rules.forEach(r => {
    if (r.paused) return;
    const s = B.parse(r.start);
    let from = r.last ? B.addDays(B.parse(r.last), 1) : s; if (from < s) from = s;
    for (let d = from, g = 0; d <= today && g < 4000; d = B.addDays(d, 1), g++) {
      if (B.ruleMatches(r, d)) {
        st.tx.push({ id: B.uid(), date: B.iso(d), type: r.type, amt: r.amt, payee: r.payee, cat: r.cat || null, acct: r.acct, toAcct: r.toAcct || null, tags: (r.tags || []).slice(), note: '', rule: r.id, est: !!r.variable });
        n++;
      }
    }
    r.last = todayIso;
  });
  return n;
};
B.nextDue = (r, fromDate) => {
  if (r.paused) return null;
  for (let i = 1; i <= 800; i++) { const d = B.addDays(fromDate, i); if (B.ruleMatches(r, d)) return d; }
  return null;
};
B.ruleOcc = key => B.cached('occ' + key, () => {
  const info = P.info(key), out = [];
  B.state.rules.forEach(r => {
    if (r.paused || r.type !== 'expense') return;
    for (let d = 1; d <= info.len; d++) if (B.ruleMatches(r, P.dateOf(info, d))) out.push({ rule: r, day: d, amt: r.amt, cat: r.cat });
  });
  return out;
});

/* ---------------- period data and calculations ---------------- */
B.lines = t => t.type !== 'expense' ? [] : (t.splits && t.splits.length ? t.splits : [{ cat: t.cat, amt: t.amt }]);
B.catById = id => B.state.cats.find(c => c.id === id);
B.acctById = id => B.state.accts.find(a => a.id === id);

B.periodData = key => B.cached('pd' + key, () => {
  const info = P.info(key), n = info.len;
  const tx = B.state.tx.filter(t => P.keyOf(B.parse(t.date)) === key);
  const spend = new Array(n + 2).fill(0), ev = new Array(n + 2).fill(0), inc = new Array(n + 2).fill(0);
  tx.forEach(t => {
    const d = P.dayIdx(info, t.date);
    if (t.type === 'income') inc[d] += t.amt;
    else if (t.type === 'expense') { spend[d] += t.amt; if (!t.rule) ev[d] += t.amt; }
  });
  return { info, tx, spend, ev, inc, spentTotal: B.sum(spend), incomeTotal: B.sum(inc) };
});
B.catSpend = (key, upto) => {
  const D = B.periodData(key), o = {};
  D.tx.forEach(t => {
    if (t.type !== 'expense' || P.dayIdx(D.info, t.date) > upto) return;
    B.lines(t).forEach(l => { o[l.cat] = (o[l.cat] || 0) + l.amt; });
  });
  return o;
};
B.baseLimit = (cat, key) => { const o = B.state.overrides[key]; return o && o[cat.id] != null ? o[cat.id] : (cat.limit || 0); };
B.hasOverride = (cat, key) => { const o = B.state.overrides[key]; return !!(o && o[cat.id] != null); };
B.carry = (cat, key) => B.cached('cy' + cat.id + key, () => {
  if (!cat.rollover) return 0;
  let k = B.firstKey(), c = 0, g = 0;
  while (k < key && g++ < 60) { c = Math.max(0, c + B.baseLimit(cat, k) - (B.catSpend(k, 999)[cat.id] || 0)); k = P.next(k); }
  return c;
});
B.catsFor = key => {
  const sp = B.catSpend(key, 999);
  return B.state.cats.filter(c => !c.archived || sp[c.id] > 0);
};

B.compute = (key, asOfIn) => {
  const st = B.state, info = P.info(key), len = info.len, latest = P.latest(key);
  const a = B.clamp(asOfIn || latest, 1, latest);
  const D = B.periodData(key), pkey = P.prev(key), PD = B.periodData(pkey), hasPrev = PD.tx.length > 0;
  const cum = [0]; for (let d = 1; d <= latest; d++) cum[d] = cum[d - 1] + D.spend[d];
  let prevCum = null;
  if (hasPrev) { prevCum = [0]; for (let d = 1; d <= PD.info.len; d++) prevCum[d] = prevCum[d - 1] + PD.spend[d]; }
  const byCat = B.catSpend(key, a), remaining = len - a;
  const cats = B.catsFor(key).map(c => {
    const base = B.baseLimit(c, key), carry = B.carry(c, key), limit = base + carry, spent = byCat[c.id] || 0;
    const pct = limit > 0 ? spent / limit : (spent > 0 ? 2 : 0), expected = c.fixed ? null : a / len;
    let status = 'ok', label = 'On track';
    if (limit <= 0 && spent <= 0) { status = 'none'; label = 'No limit'; }
    else if (spent > limit + 0.005) { status = 'over'; label = 'Over'; }
    else if (!c.fixed && remaining > 0 && (pct >= 0.9 || pct > expected + 0.08)) { status = 'watch'; label = 'Watch'; }
    return { id: c.id, name: c.name, color: c.color, fixed: !!c.fixed, rollover: !!c.rollover, archived: !!c.archived, base, carry, limit, spent, pct, expected, status, label, override: B.hasOverride(c, key) };
  });
  const budget = B.sum(cats.map(c => c.limit));
  const occ = B.ruleOcc(key), recTotal = B.sum(occ.map(o => o.amt));
  const disc = Math.max(0, budget - recTotal);
  const pace = [0];
  for (let d = 1; d <= len; d++) pace[d] = B.sum(occ.filter(o => o.day <= d).map(o => o.amt)) + disc * d / len;
  const upBills = B.sum(occ.filter(o => o.day > a).map(o => o.amt));
  const evSoFar = B.sum(D.tx.filter(t => t.type === 'expense' && !t.rule && P.dayIdx(info, t.date) <= a && t.amt <= B.ONE_OFF).map(t => t.amt));
  const avgDisc = evSoFar / a, spent = cum[a];
  const projEnd = remaining > 0 ? spent + upBills + remaining * avgDisc : spent;
  const incomeTo = B.sum(D.inc.slice(1, a + 1));
  return {
    key, info, len, latest, asOf: a, D, PD, pm: P.info(pkey), hasPrev, cum, prevCum, cats, budget, hasBudget: budget > 0, occ, recTotal, disc, pace, upBills,
    avgDisc, spent, projEnd, remaining, ahead: spent - pace[a], incomeTo, allow: disc / len, hasData: D.tx.length > 0
  };
};

B.weekdayAvg = (key, a) => {
  const info = P.info(key), endD = P.dateOf(info, a), ws = B.state.settings.weekStart;
  const start = B.addDays(endD, -55), sums = [0, 0, 0, 0, 0, 0, 0];
  let first = null;
  B.state.tx.forEach(t => {
    if (t.type !== 'expense' || t.rule) return;
    const d = B.parse(t.date); if (d < start || d > endD) return;
    sums[d.getDay()] += t.amt; if (!first || d < first) first = d;
  });
  const span = first ? B.diffDays(endD, first) + 1 : 1, weeks = B.clamp(Math.ceil(span / 7), 1, 8);
  return [0, 1, 2, 3, 4, 5, 6].map(i => (i + ws) % 7).map(w => ({ w, name: B.WD[w], avg: sums[w] / weeks }));
};
B.topPurchases = (V, d, n) => V.D.tx.filter(t => t.type === 'expense' && !t.rule && P.dayIdx(V.info, t.date) === d).sort((x, y) => y.amt - x.amt).slice(0, n);
B.payeeRows = (tx, n) => {
  const m = {};
  tx.forEach(t => { if (t.type === 'expense' && !t.rule && t.payee) { const o = m[t.payee] || (m[t.payee] = { n: 0, s: 0 }); o.n++; o.s += t.amt; } });
  return Object.entries(m).sort((x, y) => y[1].s - x[1].s).slice(0, n).map(([name, o]) => ({ name, n: o.n, s: o.s }));
};
B.tagTotals = tx => {
  const m = {};
  tx.forEach(t => { if (t.type === 'expense') (t.tags || []).forEach(g => { const o = m[g] || (m[g] = { n: 0, s: 0 }); o.n++; o.s += t.amt; }); });
  return Object.entries(m).sort((x, y) => y[1].s - x[1].s).map(([name, o]) => ({ name, n: o.n, s: o.s }));
};
B.balance = a => {
  let b = a.opening || 0;
  B.state.tx.forEach(t => {
    if (t.type === 'income' && t.acct === a.id) b += t.amt;
    else if (t.type === 'expense' && t.acct === a.id) b -= t.amt;
    else if (t.type === 'transfer') { if (t.acct === a.id) b -= t.amt; if (t.toAcct === a.id) b += t.amt; }
  });
  return b;
};
B.periodSummary = key => { const D = B.periodData(key); return { key, info: D.info, inc: D.incomeTotal, sp: D.spentTotal, net: D.incomeTotal - D.spentTotal, n: D.tx.length }; };

/* goals */
B.goalSaved = g => (g.opening || 0) + B.sum((g.contribs || []).map(c => c.amt));
B.goalModel = (g, whatIf, flexIds) => {
  const cur = P.cur(), done = P.keys(8).filter(k => k < cur && B.periodData(k).tx.length > 0);
  let surplus = null, avgCat = {};
  if (done.length) {
    surplus = B.sum(done.map(k => B.periodSummary(k).net)) / done.length;
    done.forEach(k => { const t = B.catSpend(k, 999); Object.keys(t).forEach(c => { avgCat[c] = (avgCat[c] || 0) + t[c] / done.length; }); });
  }
  const base = g.monthly > 0 ? g.monthly : Math.max(0, surplus || 0);
  const extra = done.length ? B.sum(flexIds.map(id => (avgCat[id] || 0) * (whatIf[id] || 0) / 100)) : 0;
  const saved = B.goalSaved(g), left = Math.max(0, g.target - saved);
  const months = m => m > 0 ? left / m : Infinity;
  return { done: done.length, surplus, avgCat, base, extra, plus: base + extra, saved, left, t0: months(base), t1: months(base + extra) };
};
B.monthLabel = n => { const d = new Date(new Date().getFullYear(), new Date().getMonth() + Math.ceil(n), 1); return B.MON[d.getMonth()] + ' ' + d.getFullYear(); };

/* ---------------- backup / restore ---------------- */
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
B.exportData = async () => {
  const receipts = {};
  for (const t of B.state.tx) { if (t.receipt) { const b = await B.receipt.get(t.id); if (b) receipts[t.id] = await blobToDataURL(b); } }
  return { app: 'my-budget', version: 1, exported: new Date().toISOString(), state: B.state, receipts };
};
B.importData = async obj => {
  if (!obj || obj.app !== 'my-budget' || !obj.state) throw new Error('This file is not a My Budget backup.');
  const s = migrate(obj.state); if (!s) throw new Error('The backup could not be read.');
  await B.receipt.clear();
  for (const id of Object.keys(obj.receipts || {})) { const blob = await (await fetch(obj.receipts[id])).blob(); await B.receipt.put(id, blob); }
  B.state = s; B.demo = false; B.invalidate(); await B.flush();
};
B.exportCSV = () => {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"', rows = [['Date', 'Type', 'Amount', 'Payee', 'Category', 'Account', 'To account', 'Tags', 'Note', 'Split'].join(',')];
  B.state.tx.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(t => {
    const c = B.catById(t.cat), a = B.acctById(t.acct), to = B.acctById(t.toAcct);
    const split = t.splits && t.splits.length ? t.splits.map(l => ((B.catById(l.cat) || {}).name || '?') + ' ' + l.amt).join('; ') : '';
    rows.push([t.date, t.type, t.amt.toFixed(2), q(t.payee), q(t.splits && t.splits.length ? 'Split' : (c ? c.name : '')), q(a ? a.name : ''), q(to ? to.name : ''), q((t.tags || []).join(' ')), q(t.note), q(split)].join(','));
  });
  return rows.join('\r\n');
};
B.compressImage = file => new Promise((res, rej) => {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const s = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(b => { URL.revokeObjectURL(url); b ? res(b) : rej(new Error('Could not shrink the photo.')); }, 'image/jpeg', 0.72);
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file is not a readable image.')); };
  img.src = url;
});
})();

/* Sample data, so you (or someone you show the app to) can look around without typing anything.
   It is generated relative to today, held in memory only, and never saved. */
(function () {
'use strict';
const B = window.B;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

B.makeDemo = function () {
  const R = mulberry32(20260311);
  const rnd = (a, b) => a + R() * (b - a), chance = p => R() < p, pick = a => a[Math.floor(R() * a.length)], r2 = x => Math.round(x * 100) / 100;
  const st = B.freshState();
  st.settings.onboarded = true; st.settings.incomeExpected = 5500; st.settings.cycleDay = 1;

  const C = {};
  [['housing', 'Housing', 's7', 1300, true], ['groceries', 'Groceries', 's6', 650], ['dining', 'Dining out', 's2', 400], ['transport', 'Transport', 's3', 300],
   ['bills', 'Bills & subscriptions', 's4', 520, true], ['shopping', 'Shopping', 's5', 300], ['leisure', 'Leisure', 's8', 250], ['health', 'Health', 'gray', 150]]
    .forEach(([k, name, color, limit, fixed]) => { C[k] = 'c_' + k; st.cats.push({ id: C[k], name, color, limit, fixed: !!fixed, rollover: k === 'leisure', archived: false }); });
  const A = { cash: 'a_cash', bank: 'a_bank', card: 'a_card', wallet: 'a_wallet', save: 'a_save' };
  st.accts.push({ id: A.cash, name: 'Cash', kind: 'cash', opening: 700, color: 's6' }, { id: A.bank, name: 'Everyday Account', kind: 'bank', opening: 3200, color: 's2' },
    { id: A.card, name: 'Credit card', kind: 'card', opening: 0, color: 's5' }, { id: A.wallet, name: 'E-wallet', kind: 'ewallet', opening: 3200, color: 's3' }, { id: A.save, name: 'Savings', kind: 'savings', opening: 6000, color: 's7' });

  const today = new Date(), todayIso = B.iso(today);
  const fy = today.getFullYear(), fm = today.getMonth() - 5;
  const firstStart = new Date(fy, fm, 1);

  // repeating entries
  const rule = (payee, cat, day, amt, extra) => st.rules.push(Object.assign({ id: 'r_' + st.rules.length, payee, type: 'expense', amt, cat: C[cat], acct: A.bank, freq: 'monthly', start: B.iso(new Date(fy, fm, day)), last: null }, extra || {}));
  rule('Parkview Residences', 'housing', 1, 1300);
  rule('Pulse Fitness', 'bills', 3, 120);
  rule('Streamly', 'bills', 4, 17, { acct: A.card });
  rule('PowerGrid Electric', 'bills', 8, 112, { variable: true });
  rule('Tunebox', 'bills', 9, 11, { acct: A.card });
  rule('FiberNet Internet', 'bills', 12, 129);
  rule('Orbit Mobile', 'bills', 14, 68);
  rule('ClearWater Utility', 'bills', 18, 28, { variable: true });
  st.rules.push({ id: 'r_save', payee: 'Move to savings', type: 'transfer', amt: 500, cat: null, acct: A.bank, toAcct: A.save, freq: 'monthly', start: B.iso(new Date(fy, fm, 26)), last: null });

  // salary
  for (let i = 0; i <= 5; i++) { const d = new Date(fy, fm + i, 25); if (d <= today) st.tx.push({ id: B.uid(), date: B.iso(d), type: 'income', amt: 5500, payee: 'Salary', cat: null, acct: A.bank, tags: [], note: '' }); }
  st.tx.push({ id: B.uid(), date: B.iso(new Date(fy, fm + 2, 10)), type: 'income', amt: 420, payee: 'Freelance logo work', cat: null, acct: A.bank, tags: ['side-income'], note: '' });

  // everyday spending
  const M = {
    groc: ['Greenfield Market', 'FreshMart', 'Pasar Mini Ali', 'Harvest Co-op'], lunch: ['Nasi Kandar Ali', 'Mee Bar', 'Sunny Deli', 'Tandoor House'],
    dinner: ['Olive & Ember', 'Tokyo Table', 'Seafood Garden', 'The Brass Fork'], brunch: ['Maple Street Cafe', 'Sunday Social'], deliv: ['DashEats', 'QuickBite'],
    shop: ['Harbor Outfitters', 'PageTurn Books', 'Home & Hearth', 'Bloom Florist', 'Gadget Hub'], fun: ['Bowl-O-Rama', 'Escape Room Co', 'Trailhead Outfitters'], health: ['City Pharmacy', 'Clinic Sentosa']
  };
  const gen = [];
  const add = (d, payee, cat, amt, x) => {
    const acct = amt < 25 ? pick([A.cash, A.wallet, A.wallet, A.bank]) : amt < 120 ? pick([A.bank, A.card, A.wallet]) : pick([A.card, A.bank]);
    const t = Object.assign({ id: B.uid(), date: B.iso(d), type: 'expense', amt: r2(amt), payee, cat: C[cat], acct, tags: [], note: '' }, x || {});
    gen.push(t); st.tx.push(t);
  };
  for (let d = new Date(firstStart), g = 0; d <= today && g < 400; d = B.addDays(d, 1), g++) {
    const w = d.getDay(), wk = w >= 1 && w <= 5, dom = d.getDate();
    const gp = w === 6 ? 0.9 : w === 3 ? 0.5 : w === 0 ? 0.25 : 0.1;
    if (chance(gp)) {
      if (w === 6) {
        const a = rnd(90, 190), name = pick(M.groc.slice(0, 3));
        if (chance(0.15)) add(d, name, 'groceries', a, { splits: [{ cat: C.groceries, amt: r2(a * 0.8) }, { cat: C.shopping, amt: r2(a - r2(a * 0.8)) }], note: 'Includes household items', tags: ['household'] });
        else add(d, name, 'groceries', a, chance(0.2) ? { tags: ['household'] } : {});
      } else add(d, pick(M.groc), 'groceries', rnd(14, 60));
    }
    if (wk && chance(0.42)) add(d, 'Kopi Corner', 'dining', rnd(7, 15), { acct: pick([A.wallet, A.cash]) });
    if (wk && chance(0.14)) add(d, pick(M.lunch), 'dining', rnd(12, 26), chance(0.4) ? { tags: ['work'] } : {});
    if (w === 5 && chance(0.45)) add(d, pick(M.dinner), 'dining', rnd(45, 105), chance(0.35) ? { tags: ['date-night'] } : {});
    if (w === 6 && chance(0.33)) add(d, pick(M.dinner), 'dining', rnd(40, 95), chance(0.3) ? { tags: ['date-night'] } : {});
    if (w === 0 && chance(0.28)) add(d, pick(M.brunch), 'dining', rnd(28, 55));
    if (wk && chance(0.04)) add(d, pick(M.deliv), 'dining', rnd(22, 42));
    if (w === 1 && chance(0.55)) add(d, 'Touch n Go reload', 'transport', 50, { acct: A.bank });
    if (chance(0.1)) add(d, 'RideNow', 'transport', rnd(9, 38), { acct: A.card });
    if (wk && chance(0.12)) add(d, 'City Parking', 'transport', rnd(3, 14), { acct: A.cash });
    if (dom === 9 || dom === 23) add(d, 'Petro Station', 'transport', rnd(60, 95), { acct: A.card });
    if (chance(0.15)) add(d, pick(M.shop), 'shopping', chance(0.16) ? rnd(90, 220) : rnd(20, 90));
    if (chance(0.06)) add(d, 'Starlight Cinema', 'leisure', rnd(18, 42));
    if (chance(0.045)) add(d, pick(M.fun), 'leisure', rnd(40, 110), chance(0.3) ? { tags: ['date-night'] } : {});
    if (chance(0.07)) add(d, pick(M.health), 'health', rnd(15, 75));
  }

  // shape each period so categories land near their limits (the current period relative to how far through it we are)
  const limit = {}; st.cats.forEach(c => { limit[c.id] = c.limit; });
  const curFactor = { dining: 1.22, shopping: 1.04, groceries: 0.92, transport: 0.86, leisure: 0.7, health: 0.55 };
  const periods = {}; gen.forEach(t => { (periods[t.date.slice(0, 7)] = periods[t.date.slice(0, 7)] || []).push(t); });
  const curKey = todayIso.slice(0, 7);
  Object.keys(periods).forEach(k => {
    const dim = new Date(+k.slice(0, 4), +k.slice(5, 7), 0).getDate(), frac = k === curKey ? today.getDate() / dim : 1;
    Object.keys(curFactor).forEach(ck => {
      const rows = periods[k].filter(t => t.cat === C[ck] && !t.splits);
      const fixedSplit = B.sum(periods[k].filter(t => t.splits).map(t => t.splits.filter(l => l.cat === C[ck]).reduce((a, l) => a + l.amt, 0)));
      const base = B.sum(rows.map(t => t.amt)); if (!base) return;
      const target = limit[C[ck]] * frac * (k === curKey ? curFactor[ck] : rnd(0.72, 1.06)) - fixedSplit;
      const f = B.clamp(target / base, 0.6, 1.5);
      rows.forEach(t => { t.amt = r2(t.amt * f); });
    });
  });

  B.postDue(st, todayIso);
  const cutoff = B.iso(B.addDays(today, -5));
  st.tx.forEach(t => { if (t.rule) { if (t.est) t.amt = r2(t.amt * (0.86 + R() * 0.28)); if (t.date < cutoff) t.est = false; } });

  st.goals.push({ id: 'g_japan', name: 'Japan trip', target: 8000, opening: 2400, monthly: 0, contribs: [] },
    { id: 'g_ef', name: 'Emergency fund', target: 15000, opening: 6000, monthly: 500, contribs: [] });
  st.alerts[C.shopping] = true;
  return st;
};

B.enterDemo = function () {
  if (B.demo) return;
  B.realState = B.state; B.state = B.makeDemo(); B.demo = true;
  B.ui.key = B.period.cur(); B.ui.asOf = null; B.invalidate();
};
B.exitDemo = function () {
  if (!B.demo) return;
  B.state = B.realState || B.freshState(); B.realState = null; B.demo = false;
  B.ui.key = B.period.cur(); B.ui.asOf = null; B.invalidate();
};
})();

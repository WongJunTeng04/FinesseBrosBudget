/* Budget plan: three short questions, then a ready-made plan picked from four fixed tiers.
   Nothing here guesses or learns. The rules are written out below, so you can read them and change the numbers.

   Tier is chosen by how much of your income is left after bills and everyday spending ("free share"):
     below 0%        Stabilise       spending is above income; close the gap first, no saving yet
     0% to 10%       Starter buffer  save 5%, aim for 1 month of essentials
     10% to 25%      Steady saver    save 15%, aim for 3 months of essentials
     25% and over    Accelerate      save 30%, aim for 6 months of essentials
   Income band only changes which tips are shown (lean, core, comfortable, high). */
(function () {
'use strict';
const B = window.B, { $, $$, esc, fmt0, sum, clamp } = B;
const DAYS = 30;

const TIERS = {
  stabilise: { id: 'stabilise', name: 'Stabilise', blurb: 'Spending is above what comes in. Close the gap first, then start saving.', rate: 0, months: 0 },
  buffer: { id: 'buffer', name: 'Starter buffer', blurb: 'You have a little room. Start a small cushion before anything else.', rate: 0.05, months: 1 },
  steady: { id: 'steady', name: 'Steady saver', blurb: 'A healthy split: bills covered, a regular saving and money to enjoy.', rate: 0.15, months: 3 },
  accelerate: { id: 'accelerate', name: 'Accelerate', blurb: 'You have plenty of room. Save a big share and build a strong safety net.', rate: 0.30, months: 6 }
};
const band = I => I < 3000 ? 'lean' : I < 7000 ? 'core' : I < 15000 ? 'comfortable' : 'high';
const BAND_LABEL = { lean: 'under 3,000', core: '3,000 to 6,999', comfortable: '7,000 to 14,999', high: '15,000 and above' };
const r10 = n => Math.max(0, Math.floor(n / 10) * 10);   // round down to a tidy figure
const r100 = n => Math.max(0, Math.round(n / 100) * 100);

// which of your categories each part of the plan goes into, matched by name
const EVERYDAY = [['Groceries', 0.4, /grocer|supermarket|market/i], ['Dining out', 0.3, /dining|food|eat|restaurant|meal/i], ['Transport', 0.3, /transport|commut|fuel|petrol|travel to/i]];
const FIXED = [['housing', 'Housing', /hous|\brent\b|mortgage/i], ['loans', 'Loans & instalments', /loan|instal/i], ['bills', 'Bills & subscriptions', /bill|subscr|utilit/i]];

function make(a, cats) {
  cats = (cats || []).filter(c => !c.archived);
  const I = a.income, F = a.housing + a.loans + a.bills, E0 = Math.round(a.daily * DAYS), free0 = I - F - E0, share = I > 0 ? free0 / I : -1;
  const tier = share < 0 ? TIERS.stabilise : share < 0.10 ? TIERS.buffer : share < 0.25 ? TIERS.steady : TIERS.accelerate;
  const billsTooHigh = F >= I * 0.95;
  const E = tier.id === 'stabilise' ? r10(Math.min(E0, (I - F) * 0.9)) : E0;
  const L = Math.max(0, I - F - E);
  let S = tier.id === 'stabilise' ? 0 : Math.min(r10(I * tier.rate), r10(L * 0.6));
  if (S < 50) S = 0;   // too small to be worth a goal
  const debtPay = a.debt && S > 0 ? r10(S / 2) : 0; S -= debtPay;
  // lines that become category limits
  const used = new Set(), lines = [];
  const find = re => { const c = cats.find(x => !used.has(x.id) && re.test(x.name)); if (c) used.add(c.id); return c || null; };
  FIXED.forEach(([k, name, re]) => { const amt = a[k]; const c = find(re); if (amt > 0 || c) lines.push({ key: k, group: 'bills', name: c ? c.name : name, amt, fixed: true, cat: c ? c.id : null }); });
  const spread = (list, total, group, fallback) => {
    if (total <= 0) return;
    const ms = list.map(([name, w, re]) => ({ name, w, c: find(re) })).filter(m => m.c), tw = sum(ms.map(m => m.w));
    if (!ms.length) { lines.push({ key: group, group, name: fallback, amt: total, fixed: false, cat: null }); return; }
    let left = total; ms.forEach((m, i) => { const amt = i === ms.length - 1 ? left : r10(total * m.w / tw); left -= amt; lines.push({ key: group + i, group, name: m.c.name, amt, fixed: false, cat: m.c.id }); });
  };
  spread(EVERYDAY, E, 'everyday', 'Everyday spending');
  if (debtPay > 0) lines.push({ key: 'debt', group: 'savings', name: 'Debt payoff', amt: debtPay, fixed: false, cat: (cats.find(x => /debt payoff|extra debt/i.test(x.name)) || {}).id || null });
  // Everything that is left is "fun and other". Your own fixed bills keep their limits; the flexible categories
  // (shopping, leisure, pets and so on) share what remains in proportion to the limits they have now.
  const debtLine = lines.find(l => l.key === 'debt'), rest = cats.filter(c => !used.has(c.id) && c.id !== (debtLine && debtLine.cat));
  const keep = rest.filter(c => c.fixed), flex = rest.filter(c => !c.fixed), keepTotal = sum(keep.map(c => c.limit || 0));
  const funAll = Math.max(0, L - S - debtPay), pool = Math.max(0, funAll - keepTotal), over = Math.max(0, keepTotal - funAll);
  if (flex.length) {
    const w = flex.map(c => c.limit > 0 ? c.limit : 50), tw = sum(w); let left = pool;
    flex.forEach((c, i) => { const amt = Math.max(10, i === flex.length - 1 ? left : r10(pool * w[i] / tw)); left -= amt; lines.push({ key: 'rest' + i, group: 'fun', name: c.name, amt, fixed: false, cat: c.id }); });
  } else if (pool > 0) lines.push({ key: 'fun', group: 'fun', name: 'Fun money', amt: pool, fixed: false, cat: null });
  // saving goal
  let goal = null;
  if (S > 0) {
    const big = a.cushion === 'solid', essentials = F + E;
    goal = big ? { name: 'Big goals fund', target: r100(S * 12), monthly: S } : { name: 'Emergency fund', target: Math.max(500, r100(essentials * tier.months)), monthly: S };
    goal.eta = Math.ceil(goal.target / goal.monthly);
  }
  const plan = { tier: tier.id, tierName: tier.name, blurb: tier.blurb, band: band(I), I, F, E0, E, dayTarget: Math.round(E / DAYS), gap: Math.max(0, E0 + F - I), saving: S, debtPay, pool, fun: funAll, lines, keep: keep.map(c => c.name), over, goal, billsTooHigh, share };
  plan.tips = tips(plan, a);
  return plan;
}

function tips(p, a) {
  const c = B.cur(), m = n => c + ' ' + Math.round(n).toLocaleString('en-US'), t = [];
  if (p.tier !== 'stabilise' && p.saving + p.debtPay <= 0) {
    t.push('There is almost nothing left after bills and everyday spending. Trim one bill, or a few ringgit from the daily amount, to make room to save.');
  } else if (p.tier === 'stabilise') {
    t.push(`Spending is about ${m(p.gap)} above income. Saving has to wait until that gap closes.`);
    if (p.billsTooHigh) t.push('Your bills alone are about as big as your income. Spending less will not be enough: look at lowering one of the bills or adding income.');
    else t.push(`Keep everyday spending to about ${m(p.dayTarget)} a day. Paying from one e-wallet or a cash envelope makes it easy to see.`);
    t.push('Look at your three biggest bills and ask of each: can I cancel, downgrade or renegotiate it? One phone plan or subscription can free up a tidy sum.');
  } else if (p.tier === 'buffer') {
    t.push(`Move ${m(p.saving)} to savings the day your pay arrives, before you spend anything. Treat it like a bill.`);
    t.push(`First target: one month of essentials (${m(p.goal.target)}). It stops a surprise repair from turning into a loan.`);
    t.push('Once a month, look through your subscriptions and cancel one you did not use.');
  } else if (p.tier === 'steady') {
    t.push(`Pay yourself first: move ${m(p.saving)} to savings on payday.`);
    t.push(a.cushion === 'solid' ? `Keep adding to your goals fund (${m(p.goal.target)} in a year).` : `Build three months of essentials (${m(p.goal.target)}) in a place you can reach but will not casually spend.`);
    t.push(`Wait a day before any purchase over ${m(Math.max(50, r10(p.I * 0.02)))}. Most urges pass.`);
  } else {
    t.push(`You have room to save ${m(p.saving)} a month. Set it up as an automatic transfer on payday.`);
    t.push(a.cushion === 'solid' ? `Your cushion is solid, so this goes to bigger goals (${m(p.goal.target)} in a year).` : `Build six months of essentials (${m(p.goal.target)}) first. After that, a licensed adviser can help you decide where extra money should go.`);
    t.push('When your income rises, raise your saving first, so everyday costs do not quietly grow with it.');
  }
  if (a.debt && p.debtPay > 0) t.push(`Put ${m(p.debtPay)} a month toward the balance that charges the most interest. Interest usually costs more than savings earn.`);
  else if (a.debt) t.push('You have a balance with interest. Once there is money to spare, pay the one with the highest interest first.');
  t.push({ lean: 'Cover essentials first each month. A small saving you keep up, even a little each week, beats a big one you skip.',
    core: 'Give yearly costs (insurance, road tax, festive season) their own monthly slice with a goal, so they never arrive as a shock.',
    comfortable: 'Once a year, review insurance, loans and subscriptions. A small saving on each repeats every month.',
    high: 'At higher incomes the biggest recurring costs matter most. Check housing, car and loans against what you would choose today.' }[p.band]);
  return t.slice(0, 5);
}
B.plan = { make, TIERS };

/* ---------------- applying a plan ---------------- */
function apply(p, answers) {
  const st = B.state, key = B.period.cur();
  const snap = JSON.parse(JSON.stringify({ inc: st.settings.incomeExpected, cats: st.cats, goals: st.goals, plan: st.plan, ov: st.overrides[key] || null }));
  st.settings.incomeExpected = p.I;
  const freeColor = () => { const u = new Set(st.cats.map(c => c.color)); return B.COLORS.slice(0, 8).find(k => !u.has(k)) || 'gray'; };
  let made = 0;
  p.lines.forEach(l => {
    let c = l.cat ? B.catById(l.cat) : null;
    if (!c) { if (!(l.amt > 0)) return; c = { id: B.uid(), name: l.name, color: freeColor(), limit: 0, fixed: l.fixed, rollover: false, archived: false }; st.cats.push(c); made++; }
    c.limit = l.amt; if (st.overrides[key]) delete st.overrides[key][c.id];
  });
  if (p.goal) {
    let g = st.goals.find(x => x.name.toLowerCase() === p.goal.name.toLowerCase());
    if (g) { g.target = p.goal.target; g.monthly = p.goal.monthly; } else st.goals.push({ id: B.uid(), name: p.goal.name, target: p.goal.target, opening: 0, monthly: p.goal.monthly, contribs: [] });
  }
  st.plan = { answers, tier: p.tier, tierName: p.tierName, dayTarget: p.dayTarget, saving: p.saving + p.debtPay, pool: p.pool, at: Date.now() };
  B.commit();
  B.toast(`Plan applied${made ? ` (${made} new ${made === 1 ? 'category' : 'categories'})` : ''}`, { label: 'Undo', fn: () => {
    st.settings.incomeExpected = snap.inc; st.cats = snap.cats; st.goals = snap.goals; st.plan = snap.plan;
    if (snap.ov) st.overrides[key] = snap.ov; B.commit(); B.toast('Plan undone');
  } });
}

/* ---------------- the guided screens ---------------- */
const DEFAULTS = () => ({ income: B.state.settings.incomeExpected || 0, housing: 0, loans: 0, bills: 0, daily: 0, debt: false, cushion: 'none' });
const get = id => B.parseAmt($(id).value);
const cur = () => esc(B.cur());

B.openPlan = function (opts) {
  opts = opts || {};
  const saved = B.state.plan && B.state.plan.answers;
  const a = Object.assign(DEFAULTS(), saved || {}, opts.answers || {});
  const step1 = () => {
    B.sheet.open('Plan: your income', `<form class="form" id="pnForm" autocomplete="off" novalidate>
      <p class="step">Step 1 of 3</p>
      <p class="lead">How much do you take home each month, after tax and deductions?</p>
      <label class="bigamt"><span>${cur()}</span><input id="pnInc" inputmode="decimal" value="${a.income || ''}" placeholder="0" aria-label="Monthly take-home pay"></label>
      <small>If your pay changes from month to month, use a typical low month.</small>
      <p class="err" id="pnErr" role="alert" hidden></p>
      <div class="actions"><button class="btn primary" type="submit">Next</button></div></form>`, { focus: '#pnInc', onClose: opts.onClose });
    $('#pnForm').addEventListener('submit', e => { e.preventDefault(); a.income = get('#pnInc'); if (!(a.income > 0)) { const er = $('#pnErr'); er.textContent = 'Enter what you take home each month.'; er.hidden = false; return; } step2(); });
  };
  const step2 = () => {
    B.sheet.open('Plan: your bills', `<form class="form" id="pnForm" autocomplete="off" novalidate>
      <p class="step">Step 2 of 3</p>
      <p class="lead">What do you pay every month? Rough numbers are fine. Leave blank anything that does not apply.</p>
      <div class="field"><label for="pnHouse">Rent or mortgage</label><input id="pnHouse" inputmode="decimal" value="${a.housing || ''}" placeholder="0"></div>
      <div class="field"><label for="pnLoan">Loans and instalments</label><input id="pnLoan" inputmode="decimal" value="${a.loans || ''}" placeholder="0"><small>Car, study loan, phone instalment, card payments.</small></div>
      <div class="field"><label for="pnBills">Bills and subscriptions</label><input id="pnBills" inputmode="decimal" value="${a.bills || ''}" placeholder="0"><small>Electricity, water, phone, internet, insurance, streaming.</small></div>
      <p class="callout-lite" id="pnTot" aria-live="polite"></p>
      <div class="actions"><button class="btn" type="button" id="pnBack">Back</button><button class="btn primary" type="submit">Next</button></div></form>`, { focus: '#pnHouse', onClose: opts.onClose });
    const tot = () => { const t = get('#pnHouse') + get('#pnLoan') + get('#pnBills'); $('#pnTot').innerHTML = t > 0 ? `Bills total <b>${fmt0(t)}</b> a month, <b>${Math.round(t / a.income * 100)}%</b> of your income.` : ''; };
    $('#pnForm').addEventListener('input', tot); tot();
    const read = () => { a.housing = get('#pnHouse'); a.loans = get('#pnLoan'); a.bills = get('#pnBills'); };
    $('#pnBack').addEventListener('click', () => { read(); step1(); });
    $('#pnForm').addEventListener('submit', e => { e.preventDefault(); read(); step3(); });
  };
  const step3 = () => {
    B.sheet.open('Plan: everyday spending', `<form class="form" id="pnForm" autocomplete="off" novalidate>
      <p class="step">Step 3 of 3</p>
      <p class="lead">On an ordinary day, about how much do you spend on food, transport and small things?</p>
      <div class="quick chips" id="pnQuick">${[15, 25, 40, 60, 100].map(v => `<button type="button" data-v="${v}">${cur()} ${v}</button>`).join('')}</div>
      <label class="bigamt"><span>${cur()}</span><input id="pnDay" inputmode="decimal" value="${a.daily || ''}" placeholder="0" aria-label="Spending per day"></label>
      <small id="pnMonth" aria-live="polite"></small>
      <div class="field"><div class="lbl" id="pnDebtL">Do you pay interest on a card or loan balance?</div>
        <div class="seg full" id="pnDebt" role="group" aria-labelledby="pnDebtL"><button type="button" data-v="0" aria-pressed="${!a.debt}">No</button><button type="button" data-v="1" aria-pressed="${!!a.debt}">Yes</button></div></div>
      <div class="field"><div class="lbl" id="pnCushL">Savings you could use in an emergency</div>
        <div class="seg full" id="pnCush" role="group" aria-labelledby="pnCushL">${[['none', 'None'], ['some', '1 to 2 months'], ['solid', '3+ months']].map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${a.cushion === k}">${l}</button>`).join('')}</div></div>
      <p class="err" id="pnErr" role="alert" hidden></p>
      <div class="actions"><button class="btn" type="button" id="pnBack">Back</button><button class="btn primary" type="submit">Show my plan</button></div></form>`, { focus: '#pnDay', onClose: opts.onClose });
    const month = () => { const d = get('#pnDay'); $('#pnMonth').textContent = d > 0 ? `About ${fmt0(d * DAYS)} a month.` : ''; };
    $('#pnDay').addEventListener('input', month); month();
    $('#pnQuick').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; $('#pnDay').value = B.fmtMoneyStr(b.dataset.v); month(); });
    $('#pnDebt').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; a.debt = b.dataset.v === '1'; $$('#pnDebt button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#pnCush').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; a.cushion = b.dataset.v; $$('#pnCush button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#pnBack').addEventListener('click', () => { a.daily = get('#pnDay'); step2(); });
    $('#pnForm').addEventListener('submit', e => { e.preventDefault(); a.daily = get('#pnDay'); if (!(a.daily > 0)) { const er = $('#pnErr'); er.textContent = 'Enter a rough daily amount.'; er.hidden = false; return; } result(); });
  };
  const result = () => {
    const p = make(a, B.state.cats), m = n => fmt0(n);
    const seg = [['Bills', p.F, 's7'], ['Everyday', p.E, 's6'], ['Saving', p.saving + p.debtPay, 's2'], ['Other and fun', p.fun, 's5']].filter(s => s[1] > 0);
    const total = sum(seg.map(s => s[1])) || 1;
    const rows = seg.map(s => `<li><i class="cdot" style="--c:${B.cvar(s[2])}"></i><span class="nm">${s[0]}</span><b>${m(s[1])}</b><span class="pc">${Math.round(s[1] / p.I * 100)}%</span></li>`).join('');
    const stat = (n, l) => `<div><dd>${n}</dd><dt>${l}</dt></div>`;
    B.sheet.open('Your plan', `<div class="planres">
      <div class="ptier"><span class="tierchip">${esc(p.tierName)}</span><p>${esc(p.blurb)}</p></div>
      <dl class="pstats">${stat(m(p.dayTarget), 'a day for everyday')}${stat(p.saving + p.debtPay > 0 ? m(p.saving + p.debtPay) : '–', 'saved each month')}${stat(p.fun > 0 ? m(p.fun) : '–', 'left for other and fun')}</dl>
      <div class="pbar" role="img" aria-label="${esc(seg.map(s => `${s[0]} ${Math.round(s[1] / total * 100)} percent`).join(', '))}">${seg.map(s => `<i style="--v:${s[1]};--c:${B.cvar(s[2])}"></i>`).join('')}</div>
      <ul class="plist">${rows}</ul>
      ${p.billsTooHigh ? '<p class="err">Your bills are about as big as your income, so there is very little left for everyday spending.</p>' : ''}
      ${p.over > 0 ? `<p class="err">Your fixed categories (${esc(p.keep.join(', '))}) are about ${m(p.over)} more than this plan has room for. Lower them in Manage, or accept a smaller saving.</p>` : ''}
      ${p.goal ? `<p class="note">${esc(p.goal.name)}: aim for ${m(p.goal.target)}, about ${B.plural(p.goal.eta, 'month')} at ${m(p.goal.monthly)} a month.</p>` : ''}
      <h3 class="ptips">What to do</h3>
      <ul class="tips">${p.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="note">Using this plan sets your income, your category limits${p.goal ? ' and a savings goal' : ''}. Repeating bills are still yours to add under Manage. You can undo it straight away and change anything later. This is general budgeting guidance, not financial advice.</p>
      <div class="actions"><button class="btn" type="button" id="pnEdit">Change my answers</button><button class="btn primary" type="button" id="pnUse">Use this plan</button></div></div>`, { onClose: opts.onClose });
    $('#pnEdit').addEventListener('click', step1);
    $('#pnUse').addEventListener('click', () => { B.sheet.close(true); apply(p, a); });
  };
  if (opts.review && saved && saved.income > 0 && saved.daily > 0) result(); else step1();
};

/* ---------------- Manage card ---------------- */
B.renderPlanCard = function () {
  const body = $('#planBody'), sub = $('#planSub'); if (!body) return;
  const pl = B.state.plan, V = B.V;
  if (!pl) {
    sub.textContent = 'Not sure what limits to set? Get a plan to follow.';
    body.innerHTML = '<p class="note">Answer three quick questions about your income, bills and daily spending. You get a ready-made plan with a daily target, a saving amount and a few things to do.</p><div class="actions"><button class="btn primary" data-act="plan">Build my plan</button></div>';
    return;
  }
  const c = B.cur(), m = n => fmt0(n), day = V && V.hasData && V.asOf >= 3 ? Math.round(V.avgDisc) : null;
  sub.textContent = `${pl.tierName} plan, set on ${new Date(pl.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.`;
  body.innerHTML = `<dl class="pstats"><div><dd>${m(pl.dayTarget)}</dd><dt>a day target</dt></div><div><dd>${pl.saving > 0 ? m(pl.saving) : '–'}</dd><dt>saved each month</dt></div><div><dd>${day == null ? '–' : m(day)}</dd><dt>you now, per day</dt></div></dl>
    <div class="actions"><button class="btn" data-act="plan-review">See plan and tips</button><button class="btn" data-act="plan">Redo</button></div>`;
};
})();

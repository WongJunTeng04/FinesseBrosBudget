/* Overview and Insights screens. */
(function () {
'use strict';
const B = window.B, P = B.period, { $, $$, esc, fmt0, fmt2, clamp, plural, sum } = B;
const ui = B.ui = { view: 'overview', key: null, asOf: null, mode: 'cum', goalId: null, whatIf: {}, introUntil: 0 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
B.introOn = () => { ui.introUntil = Date.now() + 1200; };
const introCls = () => Date.now() < ui.introUntil ? ' intro' : '';

B.ICON = {
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  over: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  bolt: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  sm: n => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${n}</svg>`
};
const PILL = { ok: B.ICON.sm('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), watch: B.ICON.sm('<path d="M12 7v6M12 17h.01"/>'), over: B.ICON.sm('<path d="M12 19V6M6 11l6-6 6 6"/>'), none: B.ICON.sm('<path d="M6 12h12"/>') };
B.PILL = PILL;

B.countTo = function (el, to, fmt) {
  const from = el._v == null ? to : el._v; el._v = to;
  cancelAnimationFrame(el._raf);
  if (reduceMotion || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = () => {
    const p = clamp((performance.now() - t0) / 480, 0, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(p < 1 ? from + (to - from) * e : to);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  step();
  setTimeout(() => { if (el._v === to) { cancelAnimationFrame(el._raf); el.textContent = fmt(to); } }, 620);   // settle even if animation frames are paused
};

/* ---------------- shared chrome: period pills + rewind ---------------- */
function renderControls(V) {
  const keys = P.keys(8), pills = $('#monthPills');
  pills.innerHTML = keys.map(k => { const i = P.info(k); return `<button class="mpill" data-key="${k}" aria-pressed="${k === ui.key}" title="${esc(i.label)}">${esc(i.short)}</button>`; }).join('');
  const sel = pills.querySelector('[aria-pressed="true"]'); if (sel && pills.scrollWidth > pills.clientWidth) sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  const s = $('#scrub'), rewindOk = V.latest > 1 && (ui.view === 'overview' || ui.view === 'insights');
  $('#rewind').hidden = !rewindOk;
  s.min = 1; s.max = V.latest; s.value = V.asOf;
  s.style.setProperty('--p', V.latest > 1 ? ((V.asOf - 1) / (V.latest - 1) * 100) + '%' : '100%');
  $('#scrubOut').textContent = B.dlabel(V.info, V.asOf);
  s.setAttribute('aria-valuetext', B.dlabel(V.info, V.asOf));
  $('#jump').hidden = V.asOf === V.latest;
  $('#jump').textContent = V.key === P.cur() ? 'Back to today' : 'Jump to the end';
  $('#controls').hidden = ui.view === 'manage';
}

/* ---------------- hero ---------------- */
function renderHero(V) {
  const isCur = V.key === P.cur(), over = V.hasBudget && V.spent > V.budget, left = V.budget - V.spent, closed = V.remaining === 0;
  $('#hMonth').textContent = V.info.name;
  $('#hDay').textContent = V.remaining > 0 ? `Day ${V.asOf} of ${V.len}` : (isCur ? 'Last day' : 'Period closed');
  $('#hCap').textContent = !V.hasBudget ? 'Spent so far' : over ? 'Over budget by' : (!closed ? 'Left to spend' : 'Left over');
  $('#hCur').textContent = B.cur();
  const num = $('#hNum'); B.countTo(num, V.hasBudget ? Math.abs(left) : V.spent, B.num0);
  num.parentElement.dataset.len = String(B.num0(V.hasBudget ? Math.abs(left) : V.spent).length);
  $('#hOf').textContent = V.hasBudget ? `of ${fmt0(V.budget)} budget` : 'No budget yet';
  const spentPct = V.hasBudget ? clamp(V.spent / V.budget * 100, 0, 100) : 0, tone = over ? 'over' : (V.hasBudget && V.ahead > V.budget * 0.02 ? 'warn' : 'ok');
  const rs = $('#rSpent'); rs.setAttribute('stroke-dasharray', `${spentPct} ${100 - spentPct}`); rs.setAttribute('class', 'ring-spent ' + tone);
  const tp = V.asOf / V.len * 100;
  $('#rTime').setAttribute('stroke-dasharray', `${tp} ${100 - tp}`);
  $('#rDot').setAttribute('transform', `rotate(${tp * 3.6} 120 120)`);
  $('#rTick').setAttribute('transform', `rotate(${V.hasBudget ? clamp(V.pace[V.asOf] / V.budget, 0, 1) * 360 : 0} 120 120)`);
  $('#rTick').style.display = V.hasBudget ? '' : 'none';

  let icon, head, body, action = '';
  const ic = (svg, c) => svg.replace('currentColor', c);
  if (!V.hasBudget) { icon = ic(B.ICON.info, '#9ec5f4'); head = 'No budget yet'; body = 'Give your categories a monthly limit and this ring will track your pace.'; action = '<button class="vbtn" data-act="go-manage">Set category limits</button>'; }
  else if (over) { icon = ic(B.ICON.alert, '#ff8a7a'); head = closed ? 'Finished over budget' : 'Over budget'; body = `${fmt0(V.spent - V.budget)} past your limit${closed ? '.' : ` with ${plural(V.remaining, 'day')} to go.${V.upBills > 0 ? ' Bills still due add ' + fmt0(V.upBills) + '.' : ''}`}`; }
  else if (closed) { icon = ic(B.ICON.check, '#7be08a'); head = 'Finished under budget'; body = `You kept ${fmt0(left)} of your limit.${V.incomeTo > 0 ? ` That is a ${Math.max(0, Math.round((V.incomeTo - V.spent) / V.incomeTo * 100))}% savings rate on ${fmt0(V.incomeTo)} income.` : ''}`; }
  else if (!V.hasData) { icon = ic(B.ICON.info, '#9ec5f4'); head = 'Ready when you are'; body = 'Tap + to add your first expense and the ring starts moving.'; }
  else if (V.ahead > V.budget * 0.02) { icon = ic(B.ICON.alert, '#fab219'); head = 'Ahead of pace'; body = `${fmt0(V.ahead)} more than planned by day ${V.asOf}. Easing off a little each day brings you back.`; }
  else if (V.ahead < -V.budget * 0.02) { icon = ic(B.ICON.check, '#7be08a'); head = 'Under pace'; body = `${fmt0(-V.ahead)} below where your budget expects you to be today.`; }
  else { icon = ic(B.ICON.check, '#7be08a'); head = 'On pace'; body = 'Right where your budget expects you to be today.'; }
  $('#hVerdict').innerHTML = `${icon}<div><b>${head}</b><p>${body}</p>${action}</div>`;

  const perDay = V.remaining > 0 ? Math.max(0, (V.budget - V.spent - V.upBills) / V.remaining) : 0, showProj = V.hasBudget && V.hasData && V.remaining > 0;
  let stats;
  if (!V.hasBudget) stats = [['Spent so far', fmt0(V.spent), ''], ['Per day', fmt0(V.spent / V.asOf), 'average so far'], ['Income', fmt0(V.incomeTo), '']];
  else if (V.remaining > 0) stats = [['Spent so far', fmt0(V.spent), ''], ['Safe to spend', fmt0(perDay), 'per day, after bills'], ['Projected finish', showProj ? fmt0(V.projEnd) : '–', showProj ? (V.projEnd <= V.budget ? fmt0(V.budget - V.projEnd) + ' under' : fmt0(V.projEnd - V.budget) + ' over') : '']];
  else stats = [['Spent', fmt0(V.spent), ''], ['Income', fmt0(V.incomeTo), ''], ['Saved', fmt0(V.incomeTo - V.spent), V.incomeTo ? Math.round((V.incomeTo - V.spent) / V.incomeTo * 100) + '% of income' : '']];
  $('#hStats').innerHTML = stats.map(s => `<div><dt>${s[0]}</dt><dd>${s[1]}${s[2] ? `<small>${s[2]}</small>` : ''}</dd></div>`).join('');
}

/* ---------------- running total / daily / table ---------------- */
function trendTable(V) {
  let rows = '';
  for (let d = V.asOf; d >= 1; d--) rows += `<tr><td>${B.dlabel(V.info, d)}</td><td>${fmt2(V.D.spend[d])}</td><td>${fmt2(V.cum[d])}</td><td>${V.prevCum && d < V.prevCum.length ? fmt2(V.prevCum[d]) : '–'}</td><td>${V.hasBudget ? fmt2(V.pace[d]) : '–'}</td></tr>`;
  return `<div class="tblwrap"><table><thead><tr><th>Day</th><th>Spent</th><th>Running total</th><th>${esc(V.pm.short)}</th><th>Budget pace</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderTrend(V) {
  const mode = ui.mode, body = $('#trendBody'), lg = $('#trendLegend');
  $$('#trendSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === mode));
  $('#tSub').textContent = mode === 'daily' ? `Everyday spending per day in ${B.cur()}. Repeating bills are left out so your habits show.` : mode === 'table' ? 'Every day of the period, with the running total.' : `Running total in ${B.cur()} against your budget pace${V.prevCum ? ' and the period before' : ''}.`;
  $('#trendHint').hidden = mode === 'table' || V.latest < 2;
  $('#trendEmpty').hidden = V.hasData;
  if (mode === 'table') { body.className = 'chart'; body.style.minHeight = '0'; body.innerHTML = trendTable(V); lg.innerHTML = ''; return; }
  body.style.minHeight = '360px';
  const showProj = V.remaining > 0 && (V.avgDisc > 0 || V.upBills > 0) && V.hasData;
  if (mode === 'cum') {
    lg.innerHTML = `<span><i class="k line" style="--c:var(--accent)"></i>This period</span>${V.prevCum ? `<span><i class="k line" style="--c:var(--ink-3)"></i>${esc(V.pm.short)}</span>` : ''}${V.hasBudget ? '<span><i class="k thin" style="--c:var(--axis)"></i>Budget pace</span>' : ''}${showProj ? '<span><i class="k dots" style="--c:var(--accent)"></i>Projected</span>' : ''}`;
    B.charts.cum(body, V, introCls());
  } else {
    lg.innerHTML = '<span><i class="k box" style="--c:var(--accent)"></i>Within daily allowance</span><span><i class="k box" style="--c:var(--serious)"></i>Over allowance</span><span><i class="k thin" style="--c:var(--ink-3)"></i>Daily allowance</span>';
    B.charts.daily(body, V, introCls());
  }
}

/* ---------------- categories ---------------- */
function renderCats(V) {
  const none = !V.cats.length;
  $('#catsEmpty').hidden = !none; $('#catsBody').hidden = none;
  if (none) return;
  const total = sum(V.cats.map(c => c.spent)), bar = $('#segbar'), bw = bar.clientWidth || 600, shown = V.cats.filter(c => c.spent > 0);
  bar.hidden = !shown.length; $('#segLegend').hidden = !shown.length;
  bar.setAttribute('aria-label', 'Share of spending by category: ' + shown.map(c => `${c.name} ${Math.round(c.spent / total * 100)}%`).join(', '));
  bar.innerHTML = shown.map(c => { const share = c.spent / total, fits = share * bw >= 46; return `<div class="blk" data-cat="${c.id}" style="--v:${c.spent};background:${B.cvar(c.color)};color:${B.cink(c.color)}" title="${esc(c.name)}: ${fmt0(c.spent)} (${Math.round(share * 100)}%)">${fits ? Math.round(share * 100) + '%' : ''}</div>`; }).join('');
  $('#segLegend').innerHTML = shown.map(c => `<span><i class="k dot" style="--c:${B.cvar(c.color)}"></i>${esc(c.name)}</span>`).join('');
  const order = { over: 0, watch: 1, ok: 2, none: 3 };
  const rows = [...V.cats].sort((x, y) => order[x.status] - order[y.status] || y.pct - x.pct || y.spent - x.spent);
  $('#crows').innerHTML = rows.map(c => {
    const w = clamp(c.pct * 100, 0, 100), left = c.limit - c.spent;
    const meta = c.status === 'none' ? 'Tap to set a limit' : c.status === 'over' ? `<b>${fmt0(c.spent - c.limit)}</b> over` : `<b>${fmt0(left)}</b> left`;
    const notes = [c.carry > 0 ? `${fmt0(c.carry)} carried over` : '', c.override ? 'limit changed for this period' : ''].filter(Boolean).join(' · ');
    return `<button class="crow" data-cat="${c.id}" aria-label="${esc(c.name)}: ${fmt0(c.spent)} of ${fmt0(c.limit)}, ${c.label}. Open details.">
      <i class="cdot" style="--c:${B.cvar(c.color)}"></i><span class="cname">${esc(c.name)}${c.archived ? '<span class="tag">Archived</span>' : ''}</span><span class="pill ${c.status}">${PILL[c.status]}${c.label}</span>
      <span class="meter ${c.status}" style="--w:${w}%${c.expected != null ? `;--e:${c.expected * 100}%` : ''}"><span class="fill"></span>${c.expected != null && c.limit > 0 ? '<span class="tick"></span>' : ''}</span>
      <span class="cmeta"><span><b>${fmt0(c.spent)}</b>${c.limit > 0 ? ` of ${fmt0(c.limit)}` : ''}</span><span>${meta}</span></span>${notes ? `<span class="cnote">${esc(notes)}</span>` : ''}</button>`;
  }).join('');
}

/* ---------------- insights list ---------------- */
function insightsFor(V) {
  const out = [], a = V.asOf, I = B.ICON, cats = V.cats, plan = B.state.plan;
  const planNudge = { tone: 'info', icon: I.bolt, title: 'Not sure where to start?', body: 'Answer three quick questions and get a plan to follow: a daily target, a saving amount and a few things to do.', act: 'plan', actLabel: 'Build my plan' };
  if (!V.hasData) {
    return [{ tone: 'info', icon: I.info, title: 'Add your first entry', body: 'Tap the + button. The more you log, the more specific these notes become.' }, plan ? { tone: 'info', icon: I.bolt, title: `Your plan: ${plan.tierName}`, body: `Aim for about ${fmt0(plan.dayTarget)} a day on everyday spending.`, act: 'plan-review', actLabel: 'See your plan' } : planNudge, { tone: 'info', icon: I.bolt, title: 'Set it up once', body: 'Repeating entries such as rent, bills and salary are added for you each period.', act: 'go-manage', actLabel: 'Open Manage' }];
  }
  if (plan && plan.dayTarget > 0 && a >= 3 && V.remaining > 0 && !B.demo) {
    const day = Math.round(V.avgDisc), diff = day - plan.dayTarget;
    out.push(diff > 0 ? { tone: 'warn', icon: I.alert, title: `Everyday spending is ${fmt0(day)} a day, ${fmt0(diff)} over your plan`, body: `Your ${plan.tierName} plan allows about ${fmt0(plan.dayTarget)} a day.`, act: 'plan-review', actLabel: 'See your plan' } : { tone: 'good', icon: I.check, title: `On plan: ${fmt0(day)} a day against ${fmt0(plan.dayTarget)}`, body: 'Everyday spending is within what your plan allows.' });
  }
  const overs = cats.filter(c => c.status === 'over').sort((x, y) => (y.spent - y.limit) - (x.spent - x.limit)), watch = cats.filter(c => c.status === 'watch');
  if (overs.length) out.push({ tone: 'crit', icon: I.over, title: `${overs[0].name} is ${fmt0(overs[0].spent - overs[0].limit)} over budget`, body: V.remaining > 0 ? `${plural(V.remaining, 'day')} left in this period. Raise the limit or move spending somewhere else.` : 'It closed the period over its limit.', cat: overs[0].id });
  cats.filter(c => B.state.alerts[c.id] && c.limit > 0 && c.pct >= 0.8 && c.status !== 'over').forEach(c => out.push({ tone: 'warn', icon: I.alert, title: `${c.name} is at ${Math.round(c.pct * 100)}% of its limit`, body: `You asked for an alert at 80%. ${fmt0(c.limit - c.spent)} is left${V.remaining > 0 ? ` for ${plural(V.remaining, 'more day')}` : ''}.`, cat: c.id }));
  if (!overs.length && watch.length) out.push({ tone: 'warn', icon: I.alert, title: `${watch[0].name} is running ahead of pace`, body: `${fmt0(watch[0].spent)} spent against ${fmt0(watch[0].limit)}.`, cat: watch[0].id });
  if (V.hasBudget) {
    if (V.remaining > 0 && a >= 3) {
      const diff = V.budget - V.projEnd;
      out.push(diff >= 0 ? { tone: 'good', icon: I.check, title: `Heading for ${fmt0(V.projEnd)}, ${fmt0(diff)} under budget`, body: `That counts ${fmt0(V.upBills)} of repeating bills still due and your everyday average of ${fmt0(V.avgDisc)} a day.` }
        : { tone: 'crit', icon: I.over, title: `Heading for ${fmt0(V.projEnd)}, ${fmt0(-diff)} over budget`, body: `At ${fmt0(V.avgDisc)} a day plus ${fmt0(V.upBills)} in bills, you pass your limit before the period ends.` });
    } else if (V.remaining === 0) {
      const sv = V.incomeTo - V.spent;
      out.push({ tone: sv >= 0 ? 'good' : 'crit', icon: sv >= 0 ? I.check : I.over, title: sv >= 0 ? `You saved ${fmt0(sv)} this period` : `You spent ${fmt0(-sv)} more than you earned`, body: V.incomeTo ? `Income was ${fmt0(V.incomeTo)} and spending was ${fmt0(V.spent)}.` : `Spending was ${fmt0(V.spent)}.` });
    }
  }
  if (V.prevCum && a < V.prevCum.length) { const d = V.spent - V.prevCum[a]; if (Math.abs(d) >= 25) out.push({ tone: d < 0 ? 'good' : 'info', icon: d < 0 ? I.check : I.info, title: `${fmt0(Math.abs(d))} ${d < 0 ? 'less' : 'more'} than at this point last period`, body: `By day ${a} you had spent ${fmt0(V.prevCum[a])} then.` }); }
  const inc = B.state.settings.incomeExpected;
  if (inc > 0 && V.hasBudget && Math.abs(inc - V.budget) >= 50) out.push(inc > V.budget ? { tone: 'info', icon: I.info, title: `${fmt0(inc - V.budget)} of your income has no budget`, body: 'You can give it to a category, or move it into a savings goal.', act: 'go-manage', actLabel: 'Adjust budgets' } : { tone: 'warn', icon: I.alert, title: `Budgets add up to ${fmt0(V.budget - inc)} more than your income`, body: 'Your limits together are higher than the income you set.', act: 'go-manage', actLabel: 'Adjust budgets' });
  let top = 0; for (let d = 1; d <= a; d++) if (V.D.ev[d] > (V.D.ev[top] || 0)) top = d;
  if (top && V.D.ev[top] > 0) { const tp = B.topPurchases(V, top, 1)[0]; out.push({ tone: 'info', icon: I.bolt, title: `Biggest everyday day: ${B.dlabel(V.info, top)}, ${fmt0(V.D.ev[top])}`, body: tp ? `${tp.payee || 'A purchase'} was the largest at ${fmt2(tp.amt)}.` : '' }); }
  const habit = B.payeeRows(V.D.tx.filter(t => P.dayIdx(V.info, t.date) <= a), 20).sort((x, y) => y.n - x.n)[0];
  if (habit && habit.n >= 6) out.push({ tone: 'info', icon: I.info, title: `${habit.name}: ${habit.n} visits, ${fmt0(habit.s)}`, body: `Skipping one visit in three would save about ${fmt0(habit.s / 3 * (V.len / a))} over a full period.` });
  const wk = B.weekdayAvg(V.key, a), best = wk.reduce((m, x, i) => x.avg > wk[m].avg ? i : m, 0), others = (sum(wk.map(x => x.avg)) - wk[best].avg) / 6;
  if (others > 0 && wk[best].avg > others * 1.35 && V.D.tx.length > 12) out.push({ tone: 'info', icon: I.info, title: `${B.WDL[wk[best].w]} cost you the most`, body: `${fmt0(wk[best].avg)} on average, about ${(wk[best].avg / others).toFixed(1)} times your other days.` });
  const tg = B.tagTotals(V.D.tx.filter(t => P.dayIdx(V.info, t.date) <= a))[0];
  if (tg && tg.n >= 2) out.push({ tone: 'info', icon: I.info, title: `#${tg.name} took ${fmt0(tg.s)}`, body: `Across ${plural(tg.n, 'entry')} this period.` });
  const est = V.D.tx.filter(t => t.est && P.dayIdx(V.info, t.date) <= a);
  if (est.length) out.push({ tone: 'info', icon: I.info, title: `${plural(est.length, 'bill')} still on an estimate`, body: 'Open the entry and type the real amount once the bill arrives.', act: 'go-activity', actLabel: 'See activity' });
  if (!plan && !B.demo) out.push(planNudge);
  return out;
}
function renderInsights(V) {
  const list = insightsFor(V).slice(0, 4);
  $('#insights').innerHTML = list.map(i => `<li><span class="ico ${i.tone}">${i.icon}</span><div><b>${esc(i.title)}</b>${i.body ? `<p>${esc(i.body)}</p>` : ''}${i.cat ? `<button class="link" data-cat="${i.cat}">Adjust ${esc((B.catById(i.cat) || {}).name || 'category')} budget</button>` : ''}${i.act ? `<button class="link" data-act="${i.act}">${esc(i.actLabel)}</button>` : ''}</div></li>`).join('');
}

/* ---------------- coming up ---------------- */
function renderUpcoming(V) {
  const base = P.dateOf(V.info, V.asOf), st = B.state;
  const items = st.rules.filter(r => !r.paused).map(r => { const dt = B.nextDue(r, base); return dt ? { r, dt, days: B.diffDays(dt, base) } : null; }).filter(x => x && x.days <= 14).sort((x, y) => x.days - y.days);
  $('#upSub').textContent = st.rules.length ? `Repeating entries due in the 2 weeks after ${B.dlabel(V.info, V.asOf)}.` : 'Rent, bills and salary that repeat.';
  $('#upList').innerHTML = items.length ? items.slice(0, 5).map(({ r, dt, days }) => {
    const c = B.catById(r.cat), when = days === 1 ? 'Tomorrow' : `In ${days} days`;
    const col = r.type === 'income' ? 'var(--income)' : r.type === 'transfer' ? 'var(--ink-3)' : B.cvar(c ? c.color : 'gray');
    return `<li><div class="date-chip"><b>${dt.getDate()}</b><span>${B.MON[dt.getMonth()]}</span></div><div><div class="nm"><i class="k dot" style="--c:${col}"></i><span>${esc(r.payee)}</span></div><div class="when">${when}${r.variable ? ' · amount varies' : ''}${r.type === 'transfer' ? ' · transfer' : ''}</div></div><div class="amt ${r.type === 'income' ? 'in' : ''}">${r.type === 'income' ? '+' : ''}${fmt2(r.amt)}</div></li>`;
  }).join('') : `<li class="empty">${st.rules.length ? 'Nothing is due in this window.' : 'No repeating entries yet. Add rent, bills or salary once and they appear here and in your pace line.'}</li>`;
  const wk = sum(items.filter(x => x.days <= 7 && x.r.type === 'expense').map(x => x.r.amt));
  $('#upTotal').innerHTML = items.length ? `<span>Bills due in the next 7 days</span><b>${fmt0(wk)}</b>` : `<button class="link" data-act="go-manage">Add a repeating entry</button>`;
}

/* ---------------- calendar ---------------- */
function renderCal(V) {
  const ws = B.state.settings.weekStart, names = [0, 1, 2, 3, 4, 5, 6].map(i => B.WD[(i + ws) % 7]);
  $('#calHead').innerHTML = names.map(d => `<span>${d}</span>`).join('');
  const off = (V.info.start.getDay() - ws + 7) % 7, a = V.asOf, mx = Math.max(1, ...V.D.ev.slice(1, a + 1));
  let h = '<div></div>'.repeat(off);
  for (let d = 1; d <= V.len; d++) {
    const dt = P.dateOf(V.info, d), future = d > a, locked = d > V.latest, v = V.D.ev[d]; let cls = 'day';
    if (future) cls += ' hid'; else if (v > 0) { const t = Math.sqrt(v / mx); cls += ' b' + (t > 0.88 ? 6 : t > 0.7 ? 5 : t > 0.5 ? 4 : t > 0.3 ? 3 : t > 0.15 ? 2 : 1); }
    if (d === a) cls += ' sel';
    const pay = !future && V.D.inc[d] > 0, label = dt.getDate() === 1 || d === 1 ? `${dt.getDate()} ${B.MON[dt.getMonth()]}` : String(dt.getDate());
    h += `<button class="${cls}" data-d="${d}" ${locked ? 'disabled' : ''} aria-label="${B.dlabel(V.info, d)}${future ? '' : ', everyday spend ' + fmt0(v)}${pay ? ', income received' : ''}" ${d === a ? 'aria-current="date"' : ''}><span class="dn">${label}</span><span class="da">${v > 0 ? B.num0(v) : ''}</span>${pay ? '<i class="pay"></i>' : ''}</button>`;
  }
  $('#calGrid').innerHTML = h;
  $('#calKey').innerHTML = `<span>Less</span><span class="ramp">${[1, 2, 3, 4, 5, 6].map(i => `<i style="background:var(--h${i})"></i>`).join('')}</span><span>More</span><span class="pay"></span><span>Income</span>`;
  $$('#calGrid .day').forEach(b => {
    const d = +b.dataset.d;
    b.addEventListener('pointermove', e => { if (d > a) return; const tp = B.topPurchases(V, d, 3); B.tip.show(e, B.dlabel(V.info, d), [{ shape: 'box', color: 'var(--accent)', value: fmt0(V.D.ev[d]), label: 'Everyday spend' }], tp.length ? tp.map(t => (t.payee || 'Purchase') + ' ' + fmt0(t.amt)).join(', ') : 'Nothing spent'); });
    b.addEventListener('pointerleave', B.tip.hide);
  });
  const tx = V.D.tx.filter(t => P.dayIdx(V.info, t.date) === a), spentDay = sum(tx.filter(t => t.type === 'expense').map(t => t.amt));
  $('#dayBox').innerHTML = `<h3>${B.dlabel(V.info, a)} <span>${spentDay > 0 ? fmt2(spentDay) + ' spent' : 'No spending'}</span></h3>` + (tx.length ? `<ul class="dl">${tx.map(txRow).join('')}</ul>` : '<p class="empty">Nothing was recorded on this day.</p>');
}
function txRow(t) {
  const c = B.catById(t.cat), a = B.acctById(t.acct), split = t.splits && t.splits.length, col = t.type === 'income' ? 'var(--income)' : t.type === 'transfer' ? 'var(--ink-3)' : split ? 'var(--ink-3)' : B.cvar(c ? c.color : 'gray');
  const sub = t.type === 'transfer' ? `Transfer to ${esc((B.acctById(t.toAcct) || {}).name || '?')}` : t.type === 'income' ? 'Income' : split ? 'Split' : esc(c ? c.name : 'Uncategorised');
  return `<li><button class="rowbtn" data-tx="${t.id}"><i class="k dot" style="--c:${col}"></i><span class="nm">${esc(t.payee || (t.type === 'transfer' ? 'Transfer' : 'Entry'))}${t.est ? '<span class="tag">Estimate</span>' : ''}</span><span class="cn">${sub}${a ? ' · ' + esc(a.name) : ''}</span><span class="amt ${t.type === 'income' ? 'in' : ''}">${t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}${fmt2(t.amt)}</span></button></li>`;
}
B.txRow = txRow;

/* ---------------- weekly rhythm, payees, tags, periods ---------------- */
function renderRhythm(V) {
  const wk = B.weekdayAvg(V.key, V.asOf), mx = Math.max(1, ...wk.map(x => x.avg)), topI = wk.reduce((m, x, i) => x.avg > wk[m].avg ? i : m, 0), has = wk.some(x => x.avg > 0);
  $('#wk').setAttribute('aria-label', 'Average spend by weekday: ' + wk.map(x => `${x.name} ${fmt0(x.avg)}`).join(', '));
  $('#wk').innerHTML = wk.map((x, i) => `<div class="wkc${has && i === topI ? ' top' : ''}" data-i="${i}"><span class="v">${x.avg > 0 ? B.num0(x.avg) : ''}</span><div class="b" style="height:${Math.max(2, x.avg / mx * 130)}px;animation-delay:${i * 40}ms"></div><span class="d">${x.name}</span></div>`).join('');
  $('#wkEmpty').hidden = has;
}
function barRows(rows, unit) {
  const mx = rows.length ? rows[0].s : 1;
  return rows.map(r => `<li><span class="nm">${esc(r.name)}<small>${plural(r.n, unit || 'entry').replace('entrys', 'entries')}</small></span><span class="amt">${fmt0(r.s)}</span><span class="bw"><i style="--w:${Math.max(2, r.s / mx * 100)}%"></i></span></li>`).join('');
}
function renderPayees(V) {
  const rows = B.payeeRows(V.D.tx.filter(t => P.dayIdx(V.info, t.date) <= V.asOf), 6);
  $('#merch').innerHTML = rows.length ? barRows(rows, 'visit') : '<li class="empty">Payees appear here once you add expenses.</li>';
}
function renderTags(V) {
  const rows = B.tagTotals(V.D.tx.filter(t => P.dayIdx(V.info, t.date) <= V.asOf)).slice(0, 6).map(r => ({ ...r, name: '#' + r.name }));
  $('#tagList').innerHTML = rows.length ? barRows(rows) : '<li class="empty">Add tags like #work or #trip to an entry and the totals show up here. An entry with two tags counts under both.</li>';
}
function renderPeriods(V) {
  const keys = P.keys(6), S = keys.map(B.periodSummary), mx = Math.max(1, ...S.map(s => Math.max(s.inc, s.sp)));
  $('#bul').innerHTML = S.map((s, i) => `<button data-key="${s.key}" aria-current="${s.key === ui.key}" aria-label="${esc(s.info.label)}: spent ${fmt0(s.sp)} of ${fmt0(s.inc)} income"><span class="mn">${esc(s.info.short)}</span><span class="tr"><i style="--w:${s.sp / mx * 100}%;animation-delay:${i * 60}ms"></i></span><span class="tx2"><span><b>${fmt0(s.sp)}</b> spent${s.key === P.cur() ? ' so far' : ''}</span><span>${s.inc > 0 ? (s.net >= 0 ? 'Saved' : 'Short') + ` <b>${fmt0(Math.abs(s.net))}</b>` : 'No income logged'}</span></span></button>`).join('');
  const done = S.filter(s => s.key !== P.cur() && s.n > 0 && s.inc > 0);
  if (!done.length) { $('#pfoot').innerHTML = '<div class="wide"><dt>Averages</dt><dd class="muted">After one full period</dd></div>'; return; }
  const avg = sum(done.map(s => s.net)) / done.length, best = done.reduce((m, s) => s.net > m.net ? s : m, done[0]);
  $('#pfoot').innerHTML = `<div><dt>Average saved</dt><dd>${fmt0(avg)}<small>per finished period</small></dd></div><div><dt>Best period</dt><dd>${esc(best.info.short)}<small>${fmt0(best.net)} saved</small></dd></div>`;
}

/* ---------------- goals and what-if ---------------- */
function flexCats(M) {
  return B.state.cats.filter(c => !c.archived && !c.fixed).sort((x, y) => (M.avgCat[y.id] || 0) - (M.avgCat[x.id] || 0)).slice(0, 3);
}
function renderGoals(V) {
  const goals = B.state.goals, box = $('#goalsBody');
  if (!goals.length) { box.innerHTML = '<p class="empty">Set a savings goal, like a trip or an emergency fund, and see how your budget changes the date you reach it.</p><button class="more" data-act="new-goal">Add a goal</button>'; return; }
  if (!goals.find(g => g.id === ui.goalId)) ui.goalId = goals[0].id;
  const g = goals.find(x => x.id === ui.goalId), flex0 = flexCats(B.goalModel(g, {}, []));
  const M = B.goalModel(g, ui.whatIf, flex0.map(c => c.id)), flex = flex0, saved = M.saved, pct = clamp(saved / g.target * 100, 0, 100);
  let h = '';
  if (goals.length > 1) h += `<div class="field slim"><label for="goalPick">Goal</label><select id="goalPick">${goals.map(x => `<option value="${x.id}" ${x.id === g.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`;
  h += `<div class="gprog"><b>${fmt0(saved)}</b><span>of ${fmt0(g.target)} for ${esc(g.name)}</span></div><div class="gmeter"><i style="--w:${pct}%"></i></div>`;
  if (saved >= g.target) { box.innerHTML = h + '<div class="callout"><span class="ci">' + B.ICON.check + '</span><div><b>Goal reached</b><span>You have saved the full amount.</span></div></div><button class="more" data-act="edit-goal" data-id="' + g.id + '">Edit goal</button>'; return; }
  if (M.base <= 0) { box.innerHTML = h + `<div class="callout"><span class="ci">${B.ICON.info}</span><div><b>No savings pace yet</b><span>${M.done ? 'You spent more than you earned in your finished periods.' : 'Log a full period of income and spending, or enter a planned monthly saving.'} Set a monthly amount to see a date.</span></div></div><button class="more" data-act="edit-goal" data-id="${g.id}">Set monthly saving</button>`; return; }
  const sl = M.done ? flex.map(c => { const p = ui.whatIf[c.id] || 0; return `<div class="sl"><label for="wi-${c.id}">${esc(c.name)}</label><output id="wo-${c.id}" for="wi-${c.id}">${p === 0 ? 'No change' : `−${p}% · saves ${fmt0((M.avgCat[c.id] || 0) * p / 100)}/mo`}</output><input type="range" id="wi-${c.id}" data-id="${c.id}" min="0" max="50" step="5" value="${p}" style="--p:${p * 2}%"></div>`; }).join('') : '';
  const sooner = Math.ceil(M.t0) - Math.ceil(M.t1);
  h += (M.done ? `<div class="sliders">${sl}</div>` : '<p class="sub" style="margin:10px 0">Finish one full period and you can test cuts to your flexible categories here.</p>') +
    `<div class="callout" role="status"><span class="ci">${B.ICON.bolt}</span><div><b>${M.extra >= 1 ? `+${fmt0(M.extra)} a month, goal by ${B.monthLabel(M.t1)}` : `On pace for ${B.monthLabel(M.t0)}`}</b><span>${sooner > 0 ? `${plural(sooner, 'month')} sooner than the ${B.monthLabel(M.t0)} you are on track for today. ` : ''}Saving about ${fmt0(M.base)} a month${g.monthly > 0 ? ' (your plan)' : ' (your average)'}.</span></div></div><div class="chart" id="goalChart" style="min-height:230px"></div>
    <div class="legend"><span><i class="k line" style="--c:var(--ink-3)"></i>Current pace</span><span><i class="k line" style="--c:var(--accent)"></i>With your changes</span><span><i class="k thin" style="--c:var(--ink-3)"></i>Goal</span></div><button class="more" data-act="edit-goal" data-id="${g.id}">Edit goal</button>`;
  box.innerHTML = h;
  B.charts.goal($('#goalChart'), g, M, introCls());
  $$('#goalsBody .sl input').forEach(i => i.addEventListener('input', () => { ui.whatIf[i.dataset.id] = +i.value; renderGoals(V); const again = $('#wi-' + i.dataset.id); if (again) again.focus(); }));
  const pick = $('#goalPick'); if (pick) pick.addEventListener('change', () => { ui.goalId = pick.value; ui.whatIf = {}; renderGoals(V); });
}

B.views = { renderControls, renderHero, renderTrend, renderCats, renderInsights, renderUpcoming, renderCal, renderRhythm, renderPayees, renderTags, renderPeriods, renderGoals };
})();

/* Activity and Manage screens, plus the render dispatcher. */
(function () {
'use strict';
const B = window.B, P = B.period, ui = B.ui, { $, $$, esc, fmt0, fmt2, plural, sum } = B, V_ = B.views;
ui.act = { q: '', type: 'all', cat: 'all', acct: 'all', tag: 'all', scope: 'period', limit: 30 };

const KIND = { cash: 'Cash', bank: 'Bank account', card: 'Credit card', ewallet: 'E-wallet', savings: 'Savings' };
B.KIND = KIND;
const ICO = {
  clip: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Has a receipt"><path d="M21 12.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/></svg>',
  repeat: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Repeating"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  split: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Split"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
};
B.ICO = ICO;

/* ---------------- activity ---------------- */
function fillSelect(el, opts, value) {
  const html = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
  el.value = opts.some(o => o[0] === value) ? value : opts[0][0];
}
function renderActivity(V) {
  const A = ui.act, st = B.state;
  const allTags = [...new Set(st.tx.flatMap(t => t.tags || []))].sort();
  fillSelect($('#aCat'), [['all', 'All categories']].concat(st.cats.map(c => [c.id, c.name + (c.archived ? ' (archived)' : '')])), A.cat);
  fillSelect($('#aAcct'), [['all', 'All accounts']].concat(st.accts.map(a => [a.id, a.name])), A.acct);
  fillSelect($('#aTag'), [['all', 'All tags']].concat(allTags.map(g => [g, '#' + g])), A.tag);
  $('#aType').value = A.type; $('#aScope').value = A.scope;
  const base = A.scope === 'all' ? st.tx : V.D.tx, q = A.q.trim().toLowerCase();
  const idx = new Map(st.tx.map((t, i) => [t.id, i]));
  let list = base.filter(t => (A.type === 'all' || t.type === A.type)
    && (A.cat === 'all' || B.lines(t).some(l => l.cat === A.cat))
    && (A.acct === 'all' || t.acct === A.acct || t.toAcct === A.acct)
    && (A.tag === 'all' || (t.tags || []).includes(A.tag))
    && (!q || (t.payee || '').toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q) || (t.tags || []).some(g => g.includes(q.replace(/^#/, '')))));
  list = list.sort((x, y) => x.date < y.date ? 1 : x.date > y.date ? -1 : idx.get(y.id) - idx.get(x.id));
  const spent = sum(list.filter(t => t.type === 'expense').map(t => t.amt)), inc = sum(list.filter(t => t.type === 'income').map(t => t.amt));
  $('#aSub').textContent = `${plural(list.length, 'entry').replace('entrys', 'entries')}${list.length ? ` · spent ${fmt0(spent)}${inc > 0 ? ` · income ${fmt0(inc)}` : ''}` : ''}${A.scope === 'all' ? ' across all time' : ' in ' + V.info.name}`;
  const shown = list.slice(0, A.limit); let h = '', lastDate = '';
  shown.forEach(t => {
    if (t.date !== lastDate) {
      lastDate = t.date; const dt = B.parse(t.date), day = sum(list.filter(x => x.date === t.date && x.type === 'expense').map(x => x.amt));
      h += `<li class="dhdr"><span>${B.WD[dt.getDay()]} ${dt.getDate()} ${B.MON[dt.getMonth()]}${dt.getFullYear() !== new Date().getFullYear() ? ' ' + dt.getFullYear() : ''}</span><span>${day > 0 ? '−' + fmt0(day) : ''}</span></li>`;
    }
    h += actRow(t);
  });
  $('#aList').innerHTML = h || `<li class="empty big">${st.tx.length ? 'No entries match these filters.' : 'No entries yet. Tap the + button to add your first one.'}</li>`;
  const more = $('#aMore'); more.hidden = list.length <= A.limit; more.textContent = `Show ${Math.min(30, list.length - A.limit)} more`;
}
function actRow(t) {
  const c = B.catById(t.cat), a = B.acctById(t.acct), split = t.splits && t.splits.length;
  const col = t.type === 'income' ? 'var(--income)' : t.type === 'transfer' ? 'var(--ink-3)' : split ? 'var(--ink-3)' : B.cvar(c ? c.color : 'gray');
  const sub = [t.type === 'transfer' ? `To ${esc((B.acctById(t.toAcct) || {}).name || '?')}` : t.type === 'income' ? 'Income' : split ? t.splits.map(l => esc((B.catById(l.cat) || {}).name || '?')).join(' + ') : esc(c ? c.name : 'Uncategorised'), a ? `<i class="adot" style="--c:${B.cvar(B.acctColor(a))}"></i>${esc(a.name)}` : '']
    .concat((t.tags || []).map(g => '#' + esc(g))).filter(Boolean).join(' · ');
  const badges = (split ? ICO.split : '') + (t.receipt ? ICO.clip : '') + (t.rule ? ICO.repeat : '') + (t.est ? '<span class="tag">Estimate</span>' : '');
  return `<li><button class="arow" data-tx="${t.id}"><i class="k dot" style="--c:${col}"></i><span class="am"><span class="an">${esc(t.payee || (t.type === 'transfer' ? 'Transfer' : t.type === 'income' ? 'Income' : 'Entry'))}<span class="bd">${badges}</span></span><span class="as">${sub}</span>${t.note ? `<span class="ano">${esc(t.note)}</span>` : ''}</span><span class="aa ${t.type}">${t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}${fmt2(t.amt)}</span></button></li>`;
}

/* ---------------- manage ---------------- */
function when(r) {
  const s = B.parse(r.start), ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  return r.freq === 'weekly' ? `Every ${B.WD[s.getDay()]}` : r.freq === 'yearly' ? `Every year on ${s.getDate()} ${B.MON[s.getMonth()]}` : `Monthly on the ${ord(s.getDate())}`;
}
function renderManage(V) {
  const st = B.state, s = st.settings;
  // accounts
  const bal = st.accts.map(a => ({ a, b: B.balance(a) })), net = sum(bal.map(x => x.b));
  $('#mAccts').innerHTML = (bal.length ? bal.map(({ a, b }, i) => `<li class="catrow"><button class="mrow" data-act="edit-acct" data-id="${a.id}"><i class="cdot" style="--c:${B.cvar(B.acctColor(a))}"></i><span class="mtxt"><b>${esc(a.name)}${a.archived ? '<span class="tag">Archived</span>' : ''}</b><small>${KIND[a.kind] || 'Account'}</small></span><span class="mval ${b < 0 ? 'neg' : ''}">${fmt2(b)}</span></button><span class="mv"><button class="mini" data-act="acct-up" data-id="${a.id}" aria-label="Move ${esc(a.name)} up" ${i === 0 ? 'disabled' : ''}>${ICO.up}</button><button class="mini" data-act="acct-down" data-id="${a.id}" aria-label="Move ${esc(a.name)} down" ${i === bal.length - 1 ? 'disabled' : ''}>${ICO.down}</button></span></li>`).join('') : '<li class="empty">No accounts yet.</li>') +
    (bal.length > 1 ? `<li class="mtot"><span>Total across accounts</span><b>${fmt2(net)}</b></li>` : '');
  // categories
  const total = sum(st.cats.filter(c => !c.archived).map(c => c.limit || 0)), inc = s.incomeExpected || 0;
  $('#mCatSum').innerHTML = `<div><dt>Budgeted</dt><dd>${fmt0(total)}</dd></div><div><dt>Expected income</dt><dd>${inc > 0 ? fmt0(inc) : '<button class="link" data-act="focus-income">Set</button>'}</dd></div><div><dt>${inc - total >= 0 ? 'Unassigned' : 'Over income'}</dt><dd class="${inc > 0 && inc - total < 0 ? 'neg' : ''}">${inc > 0 ? fmt0(Math.abs(inc - total)) : '–'}</dd></div>`;
  $('#mCats').innerHTML = st.cats.length ? st.cats.map((c, i) => `<li class="catrow"><button class="mrow" data-act="edit-cat" data-id="${c.id}"><i class="cdot" style="--c:${B.cvar(c.color)}"></i><span class="mtxt"><b>${esc(c.name)}${c.archived ? '<span class="tag">Archived</span>' : ''}</b><small>${[c.fixed ? 'Fixed bill' : 'Flexible', c.rollover ? 'rolls over' : ''].filter(Boolean).join(' · ')}</small></span><span class="mval">${c.limit > 0 ? fmt0(c.limit) : 'No limit'}</span></button><span class="mv"><button class="mini" data-act="cat-up" data-id="${c.id}" aria-label="Move ${esc(c.name)} up" ${i === 0 ? 'disabled' : ''}>${ICO.up}</button><button class="mini" data-act="cat-down" data-id="${c.id}" aria-label="Move ${esc(c.name)} down" ${i === st.cats.length - 1 ? 'disabled' : ''}>${ICO.down}</button></span></li>`).join('') : '<li class="empty">No categories yet.</li>';
  // repeating
  $('#mRules').innerHTML = st.rules.length ? st.rules.map(r => { const c = B.catById(r.cat); return `<li class="catrow"><button class="mrow" data-act="edit-rule" data-id="${r.id}"><i class="cdot" style="--c:${r.type === 'income' ? 'var(--income)' : r.type === 'transfer' ? 'var(--ink-3)' : B.cvar(c ? c.color : 'gray')}"></i><span class="mtxt"><b>${esc(r.payee)}${r.paused ? '<span class="tag">Paused</span>' : ''}</b><small>${when(r)}${r.variable ? ' · amount varies' : ''}${c ? ' · ' + esc(c.name) : r.type === 'transfer' ? ' · transfer' : ''}</small></span><span class="mval ${r.type === 'income' ? 'pos' : ''}">${r.type === 'income' ? '+' : ''}${fmt2(r.amt)}</span></button></li>`; }).join('') : '<li class="empty">Nothing repeats yet. Rent, bills, subscriptions and salary go here.</li>';
  // goals
  $('#mGoals').innerHTML = st.goals.length ? st.goals.map(g => { const sv = B.goalSaved(g), pc = Math.min(100, sv / g.target * 100); return `<li class="catrow"><button class="mrow stack" data-act="edit-goal" data-id="${g.id}"><span class="mline"><span class="mtxt"><b>${esc(g.name)}</b><small>${fmt0(sv)} of ${fmt0(g.target)}${g.monthly > 0 ? ' · plan ' + fmt0(g.monthly) + '/mo' : ''}</small></span><span class="mval">${Math.round(pc)}%</span></span><span class="gmeter slim"><i style="--w:${pc}%"></i></span></button><span class="mv"><button class="mini wide" data-act="goal-add" data-id="${g.id}">Add money</button></span></li>`; }).join('') : '<li class="empty">No goals yet.</li>';
  // preferences
  $('#pCur').value = s.currency; $('#pCycle').value = String(s.cycleDay); $('#pWeek').value = String(s.weekStart); $('#pTheme').value = B.getTheme() || 'system';
  if (document.activeElement !== $('#pIncome')) $('#pIncome').value = B.numStr(s.incomeExpected);
  $('#pCycleNote').textContent = s.cycleDay === 1 ? 'Follows the calendar month.' : `This period: ${P.info(P.cur()).label}.`;
  if (B.renderPlanCard) B.renderPlanCard();
  if (B.renderLockCard) B.renderLockCard();
  // data
  $('#dLast').textContent = s.lastBackup ? 'Last backup: ' + new Date(s.lastBackup).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No backup yet';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#dInstallText').textContent = standalone ? 'You are using the installed app.' : B.installPrompt ? 'Install it to open full screen from your home screen, with offline use.' : ios ? 'In Safari, tap Share, then Add to Home Screen. Open it from there from now on.' : 'Open the browser menu and choose Install app, or Add to Home screen.';
  $('#dInstall').hidden = standalone || !B.installPrompt;
  B.refreshStorage();
}
B.refreshStorage = async function () {
  const el = $('#dStore'); if (!el) return;
  let t = B.storeMode === 'idb' ? 'Saved on this device in the app’s own storage.' : 'Saved in basic browser storage. Photos will not be kept.';
  if (B.demo) t = 'Sample data is shown. Nothing is being saved.';
  try {
    if (navigator.storage && navigator.storage.persisted) B.persisted = await navigator.storage.persisted();
    if (!B.demo) t += B.persisted ? ' Protected: the phone will not clear it automatically.' : ' Not protected yet: the phone could clear it if space runs low.';
    if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e.usage != null) t += ` Using ${e.usage > 1048576 ? (e.usage / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(e.usage / 1024)) + ' KB'}.`; }
  } catch (e) { /* ignore */ }
  el.textContent = t;
  const pb = $('#dPersist'); if (pb) pb.hidden = !!B.persisted || B.demo || !(navigator.storage && navigator.storage.persist);
};

/* ---------------- dispatcher ---------------- */
function renderChrome(V) {
  $$('#tabs [data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === ui.view ? 'page' : 'false'));
  ['overview', 'insights', 'activity', 'manage'].forEach(v => { $('#v-' + v).hidden = v !== ui.view; });
  $('#demoBanner').hidden = !B.demo; $('#demoPill').hidden = !B.demo;
  const s = B.state.settings, stale = !B.demo && B.state.tx.length >= 15 && Date.now() - (s.lastBackup || 0) > 30 * 864e5 && !ui.bannerOff;
  $('#backupBanner').hidden = !stale;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), m = $('#themeMeta'); if (m && bg) m.setAttribute('content', bg);
  V_.renderControls(V);
}
B.render = function (opts) {
  opts = opts || {};
  if (opts.intro) B.introOn();
  if (!ui.key || ui.key > P.cur()) ui.key = P.cur();
  const V = B.V = B.compute(ui.key, ui.asOf);
  renderChrome(V);
  if (ui.view === 'overview') { V_.renderHero(V); V_.renderTrend(V); V_.renderCats(V); V_.renderInsights(V); V_.renderUpcoming(V); }
  else if (ui.view === 'insights') { V_.renderCal(V); V_.renderRhythm(V); V_.renderPayees(V); V_.renderTags(V); V_.renderPeriods(V); V_.renderGoals(V); }
  else if (ui.view === 'activity') renderActivity(V);
  else renderManage(V);
  if (B.afterRender) B.afterRender(V);
};
B.setAsOf = d => { const V = B.V; ui.asOf = d >= V.latest ? null : d; B.render(); };
B.setPeriod = k => { ui.key = k; ui.asOf = null; B.render({ intro: true }); };
B.renderActivity = renderActivity;
})();

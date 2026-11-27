/* Start-up, navigation, global events, backups and install. */
(function () {
'use strict';
const B = window.B, P = B.period, ui = B.ui, { $, $$ } = B;
const VIEWS = ['overview', 'activity', 'insights', 'manage'];

/* ---------------- theme (kept outside the budget data so it survives sample mode) ---------------- */
B.getTheme = () => { try { return localStorage.getItem('mb-theme'); } catch (e) { return null; } };
function applyTheme() { const t = B.getTheme(); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
B.setTheme = v => { try { if (v === 'light' || v === 'dark') localStorage.setItem('mb-theme', v); else localStorage.removeItem('mb-theme'); } catch (e) { /* ignore */ } applyTheme(); B.render(); };

/* ---------------- files ---------------- */
async function saveFile(name, mime, text) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'download';
}
const stamp = () => B.todayISO();

/* ---------------- actions ---------------- */
const ACT = {
  'go-manage': () => B.goTab('manage'), 'go-activity': () => B.goTab('activity'),
  'new-goal': () => B.openGoal(), 'edit-goal': el => B.openGoal(el.dataset.id), 'goal-add': el => B.openGoalMoney(el.dataset.id),
  'add-acct': () => B.openAcct(), 'edit-acct': el => B.openAcct(el.dataset.id),
  'add-cat': () => B.openCatEdit(), 'edit-cat': el => B.openCatEdit(el.dataset.id),
  'add-rule': () => B.openRule(), 'edit-rule': el => B.openRule(el.dataset.id),
  'cat-up': el => moveCat(el.dataset.id, -1), 'cat-down': el => moveCat(el.dataset.id, 1),
  'acct-up': el => moveAcct(el.dataset.id, -1), 'acct-down': el => moveAcct(el.dataset.id, 1),
  'plan': () => B.openPlan(), 'plan-review': () => B.openPlan({ review: true }),
  'lock-setup': () => B.lock.setup(), 'lock-now': () => B.lock.lockNow(), 'lock-change': () => B.lock.change(), 'lock-off': () => B.lock.off(),
  'focus-income': () => { const i = $('#pIncome'); i.scrollIntoView({ block: 'center' }); i.focus(); },
  'dismiss-backup': () => { ui.bannerOff = true; B.render(); },
  'backup-now': () => { B.goTab('manage'); exportJSON(); },
  'export-json': () => exportJSON(),
  'export-csv': async () => { const r = await saveFile(`my-budget-entries-${stamp()}.csv`, 'text/csv', B.exportCSV()); if (r !== 'cancel') B.toast('Entries exported'); },
  'import-json': () => $('#importFile').click(),
  'install': async () => { if (!B.installPrompt) return; B.installPrompt.prompt(); try { await B.installPrompt.userChoice; } catch (e) { /* ignore */ } B.installPrompt = null; B.render(); },
  'persist': async () => { try { B.persisted = await navigator.storage.persist(); } catch (e) { B.persisted = false; } B.toast(B.persisted ? 'Storage is now protected' : 'Your browser did not agree. Installing the app usually helps.'); B.refreshStorage(); },
  'demo': () => { B.enterDemo(); B.goTab('overview'); },
  'exit-demo': () => { B.exitDemo(); B.render({ intro: true }); if (!B.state.settings.onboarded && !B.state.tx.length && !B.state.cats.length) B.openOnboarding(); },
  'erase': () => B.confirm('Erase everything?', 'This deletes every entry, budget, account, goal and photo on this device. Export a backup first if you might want it back.', 'Erase everything', async () => {
    B.state = B.freshState(); await B.receipt.clear(); B.invalidate(); await B.flush(); ui.key = P.cur(); ui.asOf = null; B.sheet.close(true); B.render({ intro: true }); B.openOnboarding();
  })
};
function moveCat(id, dir) {
  const a = B.state.cats, i = a.findIndex(c => c.id === id), j = i + dir; if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; B.commit();
  const b = $(`#mCats [data-act="${dir < 0 ? 'cat-up' : 'cat-down'}"][data-id="${id}"]`); if (b && !b.disabled) b.focus();
}
function moveAcct(id, dir) {
  const a = B.state.accts, i = a.findIndex(x => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]]; B.commit();
  let b = $(`#mAccts [data-act="${dir < 0 ? 'acct-up' : 'acct-down'}"][data-id="${id}"]`); if (!b || b.disabled) b = $(`#mAccts [data-act="${dir < 0 ? 'acct-down' : 'acct-up'}"][data-id="${id}"]`); if (b && !b.disabled) b.focus();
}
async function exportJSON() {
  if (B.demo) return B.toast('Sample data is shown. Switch back to your budget to back it up.');
  const data = await B.exportData(), r = await saveFile(`my-budget-backup-${stamp()}.json`, 'application/json', JSON.stringify(data));
  if (r === 'cancel') return;
  B.state.settings.lastBackup = Date.now(); B.commit(); B.toast(r === 'shared' ? 'Backup ready. Save it to Files or send it to yourself.' : 'Backup downloaded');
}

/* ---------------- global click handling ---------------- */
document.addEventListener('click', e => {
  const t = e.target;
  const act = t.closest('[data-act]'); if (act && ACT[act.dataset.act]) { e.preventDefault(); ACT[act.dataset.act](act); return; }
  const tx = t.closest('[data-tx]'); if (tx) { B.openTx({ id: tx.dataset.tx }); return; }
  const cat = t.closest('#v-overview [data-cat]'); if (cat) { B.openCat(cat.dataset.cat); return; }
  const key = t.closest('#monthPills [data-key], #bul [data-key]'); if (key) { if (key.dataset.key !== ui.key) B.setPeriod(key.dataset.key); if (key.closest('#bul')) window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const day = t.closest('#calGrid .day'); if (day && !day.disabled) { B.setAsOf(+day.dataset.d); return; }
  const tab = t.closest('#tabs [data-view]'); if (tab) { location.hash = tab.dataset.view; return; }
});
$('#addBtn').addEventListener('click', () => B.openTx({}));
$('#sheetClose').addEventListener('click', () => B.sheet.close());
$('#sheetBack').addEventListener('click', () => B.sheet.back());
$('#scrim').addEventListener('click', () => B.sheet.close());
$('#scrub').addEventListener('input', e => B.setAsOf(+e.target.value));
$('#jump').addEventListener('click', () => { ui.asOf = null; B.render(); });
$('#trendSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { ui.mode = b.dataset.m; B.introOn(); B.render(); } });
$('#themeBtn').addEventListener('click', () => {
  const dark = B.getTheme() ? B.getTheme() === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  B.setTheme(dark ? 'light' : 'dark');
});
$('#segbar').addEventListener('pointermove', e => { const b = e.target.closest('[data-cat]'); if (!b) return; const V = B.V, c = V.cats.find(x => x.id === b.dataset.cat), tot = B.sum(V.cats.map(x => x.spent)); B.tip.show(e, c.name, [{ shape: 'box', color: B.cvar(c.color), value: B.fmt0(c.spent), label: `${Math.round(c.spent / tot * 100)}% of spending` }], c.limit > 0 ? `Limit ${B.fmt0(c.limit)}` : 'No limit set'); });
$('#segbar').addEventListener('pointerleave', B.tip.hide);
$('#wk').addEventListener('pointermove', e => { const b = e.target.closest('.wkc'); if (!b) return; const x = B.weekdayAvg(B.V.key, B.V.asOf)[+b.dataset.i]; B.tip.show(e, B.WDL[x.w], [{ shape: 'box', color: 'var(--accent)', value: B.fmt0(x.avg), label: 'average everyday spend' }]); });
$('#wk').addEventListener('pointerleave', B.tip.hide);

/* activity filters */
const A = ui.act;
$('#aQ').addEventListener('input', e => { A.q = e.target.value; A.limit = 30; B.renderActivity(B.V); });
[['#aType', 'type'], ['#aCat', 'cat'], ['#aAcct', 'acct'], ['#aTag', 'tag'], ['#aScope', 'scope']].forEach(([s, k]) => $(s).addEventListener('change', e => { A[k] = e.target.value; A.limit = 30; B.render(); }));
$('#aMore').addEventListener('click', () => { A.limit += 30; B.render(); });

/* preferences */
function pref(fn) { return e => { fn(e.target); B.commit(); }; }
$('#pCur').addEventListener('change', pref(el => { B.state.settings.currency = (el.value.trim() || 'RM').slice(0, 4); }));
$('#pCycle').addEventListener('change', pref(el => { B.state.settings.cycleDay = +el.value; ui.key = P.cur(); ui.asOf = null; B.toast(+el.value === 1 ? 'Months now follow the calendar' : `Your month now starts on day ${el.value}`); }));
$('#pWeek').addEventListener('change', pref(el => { B.state.settings.weekStart = +el.value; }));
$('#pIncome').addEventListener('change', pref(el => { B.state.settings.incomeExpected = B.parseAmt(el.value); }));
$('#pTheme').addEventListener('change', e => B.setTheme(e.target.value === 'system' ? null : e.target.value));

/* import */
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let obj; try { obj = JSON.parse(await file.text()); } catch (er) { return B.toast('That file could not be read.'); }
  if (!obj || obj.app !== 'my-budget' || !obj.state) return B.toast('That file is not a My Budget backup.');
  const n = (obj.state.tx || []).length, when = obj.exported ? new Date(obj.exported).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'an unknown date';
  B.confirm('Replace your data?', `This backup from ${when} has ${n} entries. Restoring it replaces everything currently on this device.`, 'Restore backup', async () => {
    try { if (B.demo) B.exitDemo(); await B.importData(obj); ui.key = P.cur(); ui.asOf = null; B.sheet.close(true); B.render({ intro: true }); B.toast('Backup restored'); } catch (er) { B.toast(er.message || 'Restore failed.'); }
  });
});

/* keyboard: Escape closes a sheet, Tab stays inside it */
document.addEventListener('keydown', e => {
  if (!B.sheet.isOpen() || document.documentElement.classList.contains('locked')) return;
  if (e.key === 'Escape') { B.sheet.close(); return; }
  if (e.key === 'Tab') {
    const f = $$('#sheet button, #sheet input, #sheet select, #sheet textarea, #sheet summary, #sheet a[href]').filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return; const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

/* routing */
function routeFromHash() { const h = location.hash.replace('#', ''); ui.view = VIEWS.includes(h) ? h : 'overview'; }
window.addEventListener('hashchange', () => { routeFromHash(); B.sheet.close(true); B.render({ intro: true }); window.scrollTo(0, 0); });

/* install prompt */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); B.installPrompt = e; if (ui.view === 'manage') B.render(); });
window.addEventListener('appinstalled', () => { B.installPrompt = null; B.toast('Installed. Open it from your home screen.'); });

/* a new day: add anything that came due while the app was closed */
let today = B.todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || B.demo) return;
  const n = B.postDue(B.state, B.todayISO());
  if (n || today !== B.todayISO()) { today = B.todayISO(); B.invalidate(); B.save(); B.render(); }
});

/* re-draw charts when the width changes (rotate, resize) */
let lastW = 0, rz;
new ResizeObserver(() => { const w = Math.round($('#app').clientWidth); if (w === lastW) return; lastW = w; cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (B.V) B.render(); }); }).observe($('#app'));

/* ---------------- start ---------------- */
(async function init() {
  applyTheme();
  try { await B.load(); } catch (e) { B.state = B.freshState(); }
  if (B.postDue(B.state, B.todayISO())) { B.invalidate(); B.save(); }
  B.receipt.keys().then(ks => { const keep = new Set(B.state.tx.filter(t => t.receipt).map(t => t.id)); ks.forEach(k => { if (!keep.has(k)) B.receipt.del(k); }); });
  await B.lock.whenUnlocked();   // nothing is drawn until the PIN is entered
  routeFromHash(); lastW = Math.round($('#app').clientWidth);
  B.render({ intro: true });
  if (!B.state.settings.onboarded && !B.state.tx.length && !B.state.cats.length) B.openOnboarding();
  const q = new URLSearchParams(location.search);
  if (q.get('add') === '1') { history.replaceState(null, '', location.pathname + location.hash); if (B.state.settings.onboarded || B.state.cats.length) B.openTx({}); }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) B.toast('Updated. Close and reopen to use the latest version.'); });
  }
  document.documentElement.classList.add('ready');
})();
})();

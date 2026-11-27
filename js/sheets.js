/* Sheets: add/edit entries, category detail and editing, accounts, repeating entries, goals, onboarding, confirmations. */
(function () {
'use strict';
const B = window.B, P = B.period, ui = B.ui, { $, $$, esc, fmt0, fmt2, clamp, sum, plural } = B;

/* ---------------- amounts: commas while typing ---------------- */
B.initMoney = function (root) { $$('input[inputmode="decimal"]', root).forEach(el => { if (el.value) el.value = B.fmtMoneyStr(el.value); }); };
document.addEventListener('input', e => {
  const el = e.target; if (!el || !el.matches || !el.matches('input[inputmode="decimal"]')) return;
  const caret = el.selectionStart, before = caret == null ? null : el.value.slice(0, caret).replace(/[^0-9.]/g, '').length;
  const v = B.fmtMoneyStr(el.value); if (v === el.value) return;
  el.value = v;
  if (before != null && document.activeElement === el) { let n = 0, pos = 0; while (pos < v.length && n < before) { if (/[0-9.]/.test(v[pos])) n++; pos++; } try { el.setSelectionRange(pos, pos); } catch (er) { /* ignore */ } }
});

/* ---------------- toast ---------------- */
let toastT;
B.toast = function (msg, act) {
  const t = $('#toast'); t.replaceChildren();
  const s = document.createElement('span'); s.textContent = msg; t.append(s);
  if (act) { const b = document.createElement('button'); b.textContent = act.label || 'Undo'; b.addEventListener('click', () => { clearTimeout(toastT); t.hidden = true; act.fn(); }); t.append(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, act ? 6500 : 2800);
};

/* ---------------- sheet frame ---------------- */
const S = { open: false, last: null, onClose: null, locked: false, back: null };
B.sheet = {
  open(title, html, o) {
    o = o || {};
    const sh = $('#sheet');
    if (!S.open) { S.last = document.activeElement; $('#scrim').hidden = false; sh.hidden = false; document.documentElement.classList.add('noscroll'); }
    S.open = true; S.onClose = o.onClose || null; S.locked = !!o.locked; S.back = o.back || null;
    $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html; $('#sheetBody').scrollTop = 0;
    B.initMoney($('#sheetBody'));
    $('#sheetClose').hidden = S.locked; $('#sheetBack').hidden = !o.back;
    const f = o.focus ? $(o.focus, sh) : null;
    setTimeout(() => { const el = f || (S.locked ? $('#sheetBody input, #sheetBody button') : $('#sheetClose')); if (el) el.focus(); }, 40);
  },
  close(force) {
    if (!S.open || (S.locked && !force)) return;
    S.open = false; $('#sheet').hidden = true; $('#scrim').hidden = true; document.documentElement.classList.remove('noscroll');
    const cb = S.onClose; S.onClose = null; if (cb) cb();
    if (S.last && S.last.focus && document.contains(S.last)) S.last.focus();
  },
  back() { if (S.back) S.back(); },
  isOpen: () => S.open
};
B.confirm = function (title, message, label, fn, back) {
  B.sheet.open(title, `<p class="lead">${esc(message)}</p><div class="actions"><button class="btn danger" id="cfOk">${esc(label)}</button><button class="btn" id="cfNo">Cancel</button></div>`, { back });
  $('#cfOk').addEventListener('click', () => { fn(); }); $('#cfNo').addEventListener('click', () => { if (back) back(); else B.sheet.close(); });
};

/* ---------------- helpers ---------------- */
const catOpts = (sel, withBlank) => (withBlank ? `<option value="">Choose…</option>` : '') + B.state.cats.filter(c => !c.archived || c.id === sel).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const acctOpts = sel => B.state.accts.filter(a => !a.archived || a.id === sel).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
const recentPayees = () => { const seen = new Set(), out = []; for (let i = B.state.tx.length - 1; i >= 0 && out.length < 80; i--) { const p = (B.state.tx[i].payee || '').trim(); if (p && !seen.has(p.toLowerCase())) { seen.add(p.toLowerCase()); out.push(p); } } return out; };
const cleanTag = s => String(s || '').trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9À-￿_-]/g, '').slice(0, 24);
const catUsed = id => B.state.tx.some(t => B.lines(t).some(l => l.cat === id)) || B.state.rules.some(r => r.cat === id);
const goTab = v => { ui.view = v; B.render(); window.scrollTo(0, 0); };
B.goTab = goTab;

/* ============================================================ add / edit entry */
B.openTx = function (opts) {
  opts = opts || {};
  const st = B.state, today = B.todayISO();
  const editing = opts.id ? st.tx.find(t => t.id === opts.id) : null, src = editing || opts.from || null;
  if (!st.accts.length) st.accts.push({ id: B.uid(), name: 'Cash', kind: 'cash', opening: 0 });
  const live = st.accts.filter(a => !a.archived);
  const f = {
    id: editing ? editing.id : B.uid(), isNew: !editing, type: src ? src.type : (opts.type || 'expense'), amt: src ? String(src.amt) : '', payee: src ? (src.payee || '') : '',
    cat: src ? src.cat : null, acct: src && B.acctById(src.acct) ? src.acct : (ui.lastAcct && live.some(a => a.id === ui.lastAcct) ? ui.lastAcct : ((opts.type === 'income' && live.find(a => a.kind === 'bank')) || live[0]).id),
    toAcct: src ? src.toAcct : null, date: editing ? editing.date : (opts.date || today), note: src ? (src.note || '') : '', tags: src ? (src.tags || []).slice() : [],
    splitOn: !!(src && src.splits && src.splits.length), splits: src && src.splits ? src.splits.map(l => ({ cat: l.cat, amt: String(l.amt) })) : [],
    repeat: 'none', variable: false, blob: null, hadReceipt: !!(editing && editing.receipt), removeReceipt: false, rule: editing ? editing.rule : null, touched: !!src
  };
  if (f.type === 'transfer' && !f.toAcct) f.toAcct = (live.find(a => a.id !== f.acct) || live[0]).id;
  const typed = { cat: false, acct: false };
  const tagSug = [...new Set(st.tx.flatMap(t => t.tags || []))];
  const locked = !!(editing && editing.rule);
  const moreOpen = !!(f.note || f.tags.length || f.splitOn || f.hadReceipt);
  const html = `<form id="txForm" class="form" autocomplete="off" novalidate>
    <div class="seg full" id="fType" role="group" aria-label="Entry type"><button type="button" data-t="expense">Expense</button><button type="button" data-t="income">Income</button><button type="button" data-t="transfer">Transfer</button></div>
    <label class="bigamt"><span>${esc(B.cur())}</span><input id="fAmt" type="text" inputmode="decimal" placeholder="0.00" aria-label="Amount" value="${esc(f.amt)}"></label>
    <p class="err" id="fErr" role="alert" hidden></p>
    <div class="field"><label for="fPayee" id="fPayeeLbl">Where did it go?</label><input id="fPayee" list="payeeList" maxlength="80" placeholder="e.g. Kopi Corner" value="${esc(f.payee)}"><datalist id="payeeList">${recentPayees().map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist><small id="fHint" hidden></small></div>
    <div class="field" id="fCatWrap"><div class="lbl" id="fCatLbl">Category</div><div class="chipgrid" id="fCats" role="group" aria-labelledby="fCatLbl">${st.cats.filter(c => !c.archived || c.id === f.cat).map(c => `<button type="button" class="cchip" data-cat="${c.id}" aria-pressed="${c.id === f.cat}"><i class="k dot" style="--c:${B.cvar(c.color)}"></i>${esc(c.name)}</button>`).join('')}</div></div>
    <div class="row2"><div class="field"><label for="fDate">Date</label><input id="fDate" type="date" max="${today}" value="${f.date}"><div class="quick"><button type="button" data-q="0">Today</button><button type="button" data-q="1">Yesterday</button></div></div>
    <div class="field"><label for="fAcct" id="fAcctLbl">Paid from</label><select id="fAcct">${acctOpts(f.acct)}</select></div></div>
    <div class="field" id="fToWrap" hidden><label for="fTo">To account</label><select id="fTo">${acctOpts(f.toAcct)}</select></div>
    <details class="more-d" id="fMore" ${moreOpen ? 'open' : ''}><summary>More detail <small>note, tags, split, repeat, receipt</small></summary>
      <div class="field"><label for="fNote">Note</label><textarea id="fNote" rows="2" maxlength="300" placeholder="Anything worth remembering">${esc(f.note)}</textarea></div>
      <div class="field"><label for="fTagIn">Tags</label><div class="tagbox" id="fTags"><input id="fTagIn" list="tagSug" maxlength="24" placeholder="Type a tag, press Enter"></div><datalist id="tagSug">${tagSug.map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist></div>
      <div class="field" id="fSplitWrap"><label class="switch"><input type="checkbox" id="fSplitOn" ${f.splitOn ? 'checked' : ''}><span class="tg"></span><span>Split across categories</span></label><div id="fSplits" hidden></div></div>
      <div class="field" id="fRepeatWrap">${locked ? '<p class="note">This came from a repeating entry. Changes here only affect this one.</p>' : `<label for="fRepeat">Repeat</label><select id="fRepeat"><option value="none">Does not repeat</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select><label class="check" id="fVarWrap" hidden><input type="checkbox" id="fVar"><span>The amount changes each time. Mark new ones as estimates.</span></label>`}</div>
      <div class="field" id="fRcWrap"><div class="lbl">Receipt photo</div><div id="fRc"></div></div>
    </details>
    <div class="actions" id="fActions">${f.isNew ? '<button class="btn primary" type="submit" id="fSave">Save</button><button class="btn" type="button" id="fAnother">Save and add another</button>' : '<button class="btn primary" type="submit" id="fSave">Save changes</button><button class="btn" type="button" id="fDup">Duplicate</button><button class="btn danger" type="button" id="fDel">Delete</button>'}</div></form>`;
  B.sheet.open(f.isNew ? 'Add an entry' : 'Edit entry', html, { focus: f.isNew ? '#fAmt' : '#fPayee' });

  const $f = s => $(s, $('#txForm')), showErr = (m, sel) => { const e = $('#fErr'); e.textContent = m; e.hidden = !m; if (m && sel) { const el = $f(sel); if (el) el.focus(); } };

  function syncType() {
    $$('#fType button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === f.type));
    const ex = f.type === 'expense', tr = f.type === 'transfer';
    $('#fCatWrap').hidden = !ex || f.splitOn; $('#fToWrap').hidden = !tr; $('#fSplitWrap').hidden = !ex; $('#fRcWrap').hidden = tr || B.demo;
    $('#fPayeeLbl').textContent = ex ? 'Where did it go?' : f.type === 'income' ? 'Where did it come from?' : 'Label (optional)';
    $('#fPayee').placeholder = ex ? 'e.g. Kopi Corner' : f.type === 'income' ? 'e.g. Salary' : 'e.g. Move to savings';
    $('#fAcctLbl').textContent = ex ? 'Paid from' : f.type === 'income' ? 'Paid into' : 'From account';
    if ($('#fRepeatWrap')) $('#fRepeatWrap').hidden = false;
  }
  function renderTags() {
    $$('#fTags .tchip').forEach(x => x.remove());
    const inp = $('#fTagIn');
    f.tags.forEach(g => { const c = document.createElement('span'); c.className = 'tchip'; c.append('#' + g); const x = document.createElement('button'); x.type = 'button'; x.dataset.rm = g; x.setAttribute('aria-label', 'Remove tag ' + g); x.textContent = '×'; c.append(x); inp.before(c); });
  }
  function addTag(raw) { raw.split(',').forEach(p => { const g = cleanTag(p); if (g && !f.tags.includes(g)) f.tags.push(g); }); $('#fTagIn').value = ''; renderTags(); }
  function remain() { const total = B.parseAmt($('#fAmt').value), used = sum(f.splits.map(l => B.parseAmt(l.amt))), d = Math.round((total - used) * 100) / 100; const el = $('#fRemain'); if (!el) return; el.textContent = !total ? 'Enter the total above first' : d === 0 ? 'All assigned' : d > 0 ? `${fmt2(d)} left to assign` : `${fmt2(-d)} too much`; el.className = d === 0 && total ? 'okr' : ''; }
  function renderSplits() {
    const box = $('#fSplits'); box.hidden = !f.splitOn; if (!f.splitOn) return;
    box.innerHTML = f.splits.map((l, i) => `<div class="splitrow"><select data-i="${i}" aria-label="Category for line ${i + 1}">${catOpts(l.cat, true)}</select><input data-i="${i}" inputmode="decimal" value="${esc(l.amt)}" placeholder="0.00" aria-label="Amount for line ${i + 1}">${f.splits.length > 2 ? `<button type="button" class="mini" data-rm="${i}" aria-label="Remove line ${i + 1}">×</button>` : '<span></span>'}</div>`).join('') + '<div class="splitfoot"><span id="fRemain"></span><button type="button" class="link" id="fAddLine">Add a line</button></div>';
    remain();
  }
  function renderReceipt() {
    const box = $('#fRc'); if (!box) return;
    const url = f.blob ? URL.createObjectURL(f.blob) : null;
    const show = (u) => { box.innerHTML = `<div class="rcprev"><img src="${u}" alt="Receipt photo"><div><button type="button" class="link" id="fRcDel">Remove photo</button></div></div>`; $('#fRcDel').addEventListener('click', () => { f.blob = null; f.removeReceipt = true; f.hadReceipt = false; renderReceipt(); }); };
    if (url) return show(url);
    if (f.hadReceipt && !f.removeReceipt) { B.receipt.get(f.id).then(b => { if (b) show(URL.createObjectURL(b)); else { f.hadReceipt = false; renderReceipt(); } }); return; }
    box.innerHTML = '<label class="filebtn"><input type="file" id="fRcIn" accept="image/*"><span>Add a photo</span></label>';
    $('#fRcIn').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { f.blob = await B.compressImage(file); f.removeReceipt = false; renderReceipt(); } catch (er) { showErr(er.message); } });
  }

  // wire up
  $('#fType').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; f.type = b.dataset.t; if (f.type === 'income' && !typed.acct && f.isNew) { const bk = live.find(a => a.kind === 'bank'); if (bk) $('#fAcct').value = bk.id; } if (f.type === 'transfer' && (!f.toAcct || f.toAcct === $('#fAcct').value)) { const o = live.find(a => a.id !== $('#fAcct').value); if (o) { f.toAcct = o.id; $('#fTo').value = o.id; } } syncType(); showErr(''); });
  $('#fAmt').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9.,]/g, ''); typed.amt = true; remain(); });
  $('#fAmt').addEventListener('blur', e => { const n = B.parseAmt(e.target.value); if (n > 0) e.target.value = B.numStr(n, true); });
  $('#fCats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; f.cat = b.dataset.cat; typed.cat = true; $$('#fCats .cchip').forEach(x => x.setAttribute('aria-pressed', x === b)); showErr(''); });
  $('#fAcct').addEventListener('change', () => { typed.acct = true; });
  $('#fPayee').addEventListener('change', () => {
    const p = $('#fPayee').value.trim().toLowerCase(); if (!p || !f.isNew) return;
    const last = [...st.tx].reverse().find(t => (t.payee || '').trim().toLowerCase() === p && t.type === f.type);
    if (!last) return; const did = [];
    if (f.type === 'expense' && !typed.cat && last.cat && !f.splitOn) { f.cat = last.cat; $$('#fCats .cchip').forEach(x => x.setAttribute('aria-pressed', x.dataset.cat === f.cat)); did.push('category'); }
    if (!typed.acct && B.acctById(last.acct) && !B.acctById(last.acct).archived) { $('#fAcct').value = last.acct; did.push('account'); }
    if (!B.parseAmt($('#fAmt').value) && last.amt) { $('#fAmt').value = B.numStr(last.amt, true); did.push('amount'); }
    if (!f.tags.length && (last.tags || []).length) { f.tags = last.tags.slice(); renderTags(); did.push('tags'); }
    if (did.length) { const h = $('#fHint'); h.textContent = 'Filled in the ' + (did.length > 1 ? did.slice(0, -1).join(', ') + ' and ' + did[did.length - 1] : did[0]) + ' from your last entry.'; h.hidden = false; }
  });
  $$('.quick button', $('#txForm')).forEach(b => b.addEventListener('click', () => { $('#fDate').value = B.iso(B.addDays(new Date(), -Number(b.dataset.q))); }));
  $('#fTags').addEventListener('click', e => { const x = e.target.closest('[data-rm]'); if (x) { f.tags = f.tags.filter(g => g !== x.dataset.rm); renderTags(); } else $('#fTagIn').focus(); });
  $('#fTagIn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag($('#fTagIn').value); } else if (e.key === 'Backspace' && !$('#fTagIn').value && f.tags.length) { f.tags.pop(); renderTags(); } });
  $('#fTagIn').addEventListener('change', () => { if ($('#fTagIn').value) addTag($('#fTagIn').value); });
  $('#fSplitOn').addEventListener('change', e => {
    f.splitOn = e.target.checked;
    if (f.splitOn && f.splits.length < 2) { const t = B.parseAmt($('#fAmt').value); f.splits = [{ cat: f.cat || '', amt: t ? String(t) : '' }, { cat: '', amt: '' }]; }
    $('#fCatWrap').hidden = f.splitOn || f.type !== 'expense'; renderSplits();
  });
  $('#fSplits').addEventListener('input', e => { const i = e.target.dataset.i; if (i == null) return; if (e.target.tagName === 'INPUT') { e.target.value = e.target.value.replace(/[^0-9.,]/g, ''); f.splits[i].amt = e.target.value; } else f.splits[i].cat = e.target.value; remain(); });
  $('#fSplits').addEventListener('click', e => { if (e.target.id === 'fAddLine') { f.splits.push({ cat: '', amt: '' }); renderSplits(); } const rm = e.target.closest('[data-rm]'); if (rm) { f.splits.splice(+rm.dataset.rm, 1); renderSplits(); } });
  const rep = $('#fRepeat'); if (rep) rep.addEventListener('change', () => { f.repeat = rep.value; $('#fVarWrap').hidden = rep.value === 'none'; });

  function collect() {
    const amt = B.parseAmt($('#fAmt').value), date = $('#fDate').value;
    if (!(amt > 0)) return { err: 'Enter an amount greater than zero.', sel: '#fAmt' };
    if (!date || isNaN(B.parse(date)) || date > today) return { err: 'Pick a date that is today or earlier.', sel: '#fDate' };
    const t = { id: f.id, date, type: f.type, amt, payee: $('#fPayee').value.trim(), cat: null, acct: $('#fAcct').value, toAcct: null, note: $('#fNote').value.trim(), tags: f.tags.slice() };
    if (f.type === 'expense') {
      if (f.splitOn) {
        const lines = f.splits.filter(l => l.cat || B.parseAmt(l.amt) > 0);
        if (lines.length < 2 || lines.some(l => !l.cat || !(B.parseAmt(l.amt) > 0))) return { err: 'Give each split line a category and an amount.', sel: '#fSplits select' };
        if (Math.abs(sum(lines.map(l => B.parseAmt(l.amt))) - amt) > 0.009) return { err: 'The split lines need to add up to the total.', sel: '#fSplits input' };
        t.splits = lines.map(l => ({ cat: l.cat, amt: B.parseAmt(l.amt) }));
      } else { if (!f.cat) return { err: 'Pick a category.', sel: '#fCats button' }; t.cat = f.cat; }
    }
    if (f.type === 'transfer') { t.toAcct = $('#fTo').value; if (t.toAcct === t.acct) return { err: 'Choose two different accounts.', sel: '#fTo' }; }
    if (f.rule) t.rule = f.rule;
    if (f.hadReceipt && !f.removeReceipt || f.blob) t.receipt = true;
    return { t };
  }
  async function commit(another) {
    showErr(''); const r = collect(); if (r.err) return showErr(r.err, r.sel);
    const t = r.t, before = editing ? JSON.parse(JSON.stringify(editing)) : null; let newRule = null;
    if (f.repeat !== 'none' && !locked) {
      newRule = { id: B.uid(), payee: t.payee || (t.cat ? (B.catById(t.cat) || {}).name : 'Repeating entry'), type: t.type, amt: t.amt, cat: t.cat, acct: t.acct, toAcct: t.toAcct, freq: f.repeat, start: t.date, end: null, last: B.todayISO(), variable: !!($('#fVar') && $('#fVar').checked), tags: t.tags.slice(), paused: false };
      if (t.splits) newRule.cat = t.splits[0].cat;
      st.rules.push(newRule); t.rule = newRule.id;
    }
    if (f.blob) await B.receipt.put(t.id, f.blob); else if (f.removeReceipt) await B.receipt.del(t.id);
    const i = st.tx.findIndex(x => x.id === t.id); if (i >= 0) st.tx[i] = t; else st.tx.push(t);
    if (t.type === 'expense') ui.lastCat = t.cat; ui.lastAcct = t.acct;
    B.commit(); const amtTxt = fmt2(t.amt);
    B.toast(`${f.isNew ? 'Saved' : 'Updated'} ${amtTxt}${t.payee ? ' · ' + t.payee : ''}`, { label: 'Undo', fn: () => {
      if (before) { const j = st.tx.findIndex(x => x.id === t.id); if (j >= 0) st.tx[j] = before; } else st.tx = st.tx.filter(x => x.id !== t.id);
      if (newRule) st.rules = st.rules.filter(x => x.id !== newRule.id);
      B.commit();
    } });
    if (another && f.isNew) { B.openTx({ date: t.date, type: f.type }); } else B.sheet.close();
  }
  $('#txForm').addEventListener('submit', e => { e.preventDefault(); commit(false); });
  const an = $('#fAnother'); if (an) an.addEventListener('click', () => commit(true));
  const dup = $('#fDup'); if (dup) dup.addEventListener('click', () => { const c = JSON.parse(JSON.stringify(editing)); delete c.rule; delete c.est; B.openTx({ from: c, date: B.todayISO() }); });
  const del = $('#fDel');
  if (del) del.addEventListener('click', () => {
    if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = 'Delete'; } }, 3500); return; }
    const idx = st.tx.findIndex(x => x.id === f.id), copy = st.tx[idx];
    st.tx.splice(idx, 1); B.commit(); B.sheet.close();
    B.toast('Entry deleted', { label: 'Undo', fn: () => { st.tx.splice(Math.min(idx, st.tx.length), 0, copy); B.commit(); } });
  });
  syncType(); renderTags(); renderSplits(); renderReceipt();
  if (f.isNew) { $('#fAmt').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#fPayee').focus(); } }); }
};

/* ============================================================ category detail */
B.openCat = function (id) {
  const V = B.V, c = V.cats.find(x => x.id === id); if (!c) return;
  const raw = B.catById(id), key = V.key, readOnly = B.demo;
  let scope = c.override ? 'period' : 'all', max = Math.max(100, Math.ceil(Math.max(c.base, raw.limit || 0) * 2 / 50) * 50);
  const sums = B.firstKey() ? P.keys(6).map(k => ({ k, info: P.info(k), v: B.catSpend(k, 999)[id] || 0 })) : [];
  const mine = V.D.tx.filter(t => t.type === 'expense' && B.lines(t).some(l => l.cat === id) && P.dayIdx(V.info, t.date) <= V.asOf).sort((x, y) => x.date < y.date ? 1 : -1);
  const html = `<div class="dsum"><div><span class="big" id="dSpent"></span><span class="of" id="dOf"></span></div><span class="pill" id="dPill"></span></div>
    <div class="meter" id="dMeter"><span class="fill"></span><span class="tick"></span></div>
    <p class="cnote2" id="dNote"></p>
    <div class="edit"><div class="row"><label class="t" for="dRange">Limit</label><div class="stepper"><button type="button" id="dMinus" aria-label="Lower limit by 10">&minus;</button><output id="dLimit" for="dRange"></output><button type="button" id="dPlus" aria-label="Raise limit by 10">+</button></div></div>
      <input type="range" id="dRange" min="0" max="${max}" step="10" aria-label="Limit">
      <div class="seg full tight" id="dScope" role="group" aria-label="Apply limit to"><button type="button" data-s="all">Every period</button><button type="button" data-s="period">Only ${esc(V.info.short)}</button></div>
      <div class="cscope"><small id="dScopeNote"></small> <button type="button" class="link" id="dReset" hidden>Use the usual limit for this period</button></div></div>
    <label class="switch"><input type="checkbox" id="dAlert" ${B.state.alerts[id] ? 'checked' : ''}><span class="tg"></span><span>Alert me at 80% of this limit</span></label>
    <div><h3 class="hl">Last periods<span><i class="k thin" style="--c:var(--ink-3)"></i>Limit</span></h3><div class="dcols" id="dCols" style="--c:${B.cvar(c.color)}"></div></div>
    <div><h3>Top payees</h3><ul class="mrows" id="dMerch"></ul></div>
    <div><h3>Entries</h3><ul class="dl" id="dTx"></ul></div>
    <div class="actions"><button class="btn" type="button" id="dEdit">Edit category</button><button class="btn primary" type="button" id="dAdd">Add expense here</button></div>`;
  B.sheet.open(c.name, html, { focus: '#sheetClose' });
  const lim = () => B.baseLimit(raw, key);
  function paint() {
    const V2 = B.V, c2 = V2.cats.find(x => x.id === id) || c;
    $('#dSpent').textContent = fmt0(c2.spent); $('#dOf').textContent = c2.limit > 0 ? `of ${fmt0(c2.limit)}` : 'no limit set';
    const p = $('#dPill'); p.className = 'pill ' + c2.status; p.innerHTML = B.PILL[c2.status] + c2.label;
    const m = $('#dMeter'); m.className = 'meter ' + c2.status; m.style.setProperty('--w', clamp(c2.pct * 100, 0, 100) + '%');
    if (c2.expected != null) m.style.setProperty('--e', c2.expected * 100 + '%'); m.querySelector('.tick').hidden = c2.expected == null || c2.limit <= 0;
    $('#dNote').textContent = [c2.carry > 0 ? `${fmt0(c2.carry)} carried over from earlier periods.` : '', c2.override ? 'This period has its own limit.' : ''].filter(Boolean).join(' ');
    $('#dLimit').textContent = fmt0(lim()); $('#dRange').value = lim(); $('#dRange').style.setProperty('--p', clamp(lim() / max * 100, 0, 100) + '%');
    $$('#dScope button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === scope));
    $('#dScopeNote').textContent = scope === 'all' ? 'Changes apply to every period, past and future.' : `Changes apply to ${V2.info.name} only.`;
    $('#dReset').hidden = !c2.override;
    const mx = Math.max(c2.limit * 1.15, ...sums.map(s => s.v), 1);
    $('#dCols').innerHTML = sums.map((s, i) => `<div class="c${s.k === key ? ' cur' : ''}"><span class="v">${s.v > 0 ? B.num0(s.v) : ''}</span><div class="b" style="height:${Math.max(2, s.v / mx * 100)}px"></div><span class="m">${esc(s.info.short)}</span></div>`).join('') + `<div class="dbline" style="bottom:calc(${c2.limit / mx * 100}px + 31px)"></div>`;
  }
  function set(v) {
    if (readOnly) return B.toast('Sample data: changes are not saved.');
    v = clamp(Math.round(v / 10) * 10, 0, max);
    if (scope === 'all') { raw.limit = v; if (B.state.overrides[key]) delete B.state.overrides[key][id]; } else { (B.state.overrides[key] = B.state.overrides[key] || {})[id] = v; }
    B.invalidate(); B.save(); B.V = B.compute(ui.key, ui.asOf); B.render(); paint();
  }
  $('#dRange').addEventListener('input', e => set(+e.target.value));
  $('#dMinus').addEventListener('click', () => set(lim() - 10)); $('#dPlus').addEventListener('click', () => set(lim() + 10));
  $('#dScope').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; scope = b.dataset.s; paint(); });
  $('#dReset').addEventListener('click', () => { if (B.state.overrides[key]) delete B.state.overrides[key][id]; B.commit(); scope = 'all'; paint(); });
  $('#dAlert').addEventListener('change', e => { B.state.alerts[id] = e.target.checked; B.save(); B.render(); B.toast(e.target.checked ? `Alert on for ${raw.name}` : 'Alert turned off'); });
  $('#dMerch').innerHTML = (() => { const rows = B.payeeRows(mine.map(t => ({ ...t, rule: null })), 5), mx = rows.length ? rows[0].s : 1; return rows.length ? rows.map(r => `<li><span class="nm">${esc(r.name)}<small>${plural(r.n, 'visit')}</small></span><span class="amt">${fmt0(r.s)}</span><span class="bw"><i style="--w:${Math.max(2, r.s / mx * 100)}%"></i></span></li>`).join('') : '<li class="empty">Nothing here yet.</li>'; })();
  $('#dTx').innerHTML = mine.length ? mine.slice(0, 8).map(B.txRow).join('') : '<li class="empty">No entries in this category for this period.</li>';
  $('#dEdit').addEventListener('click', () => B.openCatEdit(id, () => B.openCat(id)));
  $('#dAdd').addEventListener('click', () => { B.sheet.close(); B.openTx({}); setTimeout(() => { const b = $('#fCats [data-cat="' + id + '"]'); if (b) b.click(); }, 60); });
  paint();
};

/* ============================================================ category editor */
B.openCatEdit = function (id, back) {
  const st = B.state, c = id ? B.catById(id) : null, d = c || { name: '', color: B.COLORS[st.cats.length % 8], limit: 0, fixed: false, rollover: false, archived: false };
  let color = d.color;
  const html = `<form class="form" id="cForm" autocomplete="off" novalidate>
    <div class="field"><label for="cName">Name</label><input id="cName" maxlength="40" value="${esc(d.name)}" placeholder="e.g. Pets"></div>
    <div class="field"><div class="lbl" id="cColLbl">Colour</div><div class="swatches" id="cCols" role="group" aria-labelledby="cColLbl">${B.COLORS.map(k => `<button type="button" class="sw" data-c="${k}" style="--c:${B.cvar(k)}" aria-label="${k === 'gray' ? 'Grey' : 'Colour ' + (B.COLORS.indexOf(k) + 1)}" aria-pressed="${k === color}"></button>`).join('')}</div></div>
    <div class="field"><label for="cLimit">Limit each period (${esc(B.cur())})</label><input id="cLimit" inputmode="decimal" value="${d.limit > 0 ? d.limit : ''}" placeholder="0"></div>
    <label class="switch"><input type="checkbox" id="cFixed" ${d.fixed ? 'checked' : ''}><span class="tg"></span><span>Fixed bill<small>Paid once or on a schedule. Skips the daily pace marker.</small></span></label>
    <label class="switch"><input type="checkbox" id="cRoll" ${d.rollover ? 'checked' : ''}><span class="tg"></span><span>Carry unspent money forward<small>What you do not spend is added to next period’s limit.</small></span></label>
    <p class="err" id="cErr" role="alert" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${c ? 'Save changes' : 'Add category'}</button>${c ? `<button class="btn" type="button" id="cArch">${d.archived ? 'Bring back' : 'Archive'}</button><button class="btn danger" type="button" id="cDel">Delete</button>` : ''}</div>
    ${c ? '<p class="note">Archiving hides a category from new entries but keeps its history. You can only delete one that has no entries.</p>' : ''}</form>`;
  B.sheet.open(c ? 'Edit category' : 'New category', html, { focus: '#cName', back });
  $('#cCols').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; $$('#cCols .sw').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#cForm').addEventListener('submit', e => {
    e.preventDefault(); const name = $('#cName').value.trim(), err = $('#cErr');
    if (!name) { err.textContent = 'Give the category a name.'; err.hidden = false; return $('#cName').focus(); }
    if (st.cats.some(x => x.id !== (c && c.id) && x.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'You already have a category with that name.'; err.hidden = false; return; }
    const o = c || { id: B.uid() }; Object.assign(o, { name, color, limit: B.parseAmt($('#cLimit').value), fixed: $('#cFixed').checked, rollover: $('#cRoll').checked, archived: !!d.archived });
    if (!c) st.cats.push(o); B.commit(); B.toast(c ? 'Category updated' : 'Category added'); if (back) back(); else B.sheet.close();
  });
  if (c) {
    $('#cArch').addEventListener('click', () => { c.archived = !c.archived; B.commit(); B.toast(c.archived ? 'Archived' : 'Brought back'); B.sheet.close(); });
    $('#cDel').addEventListener('click', () => {
      if (catUsed(c.id)) { const e = $('#cErr'); e.textContent = 'This category has entries, so it can only be archived.'; e.hidden = false; return; }
      B.confirm('Delete category?', `${c.name} will be removed. This cannot be undone.`, 'Delete', () => { st.cats = st.cats.filter(x => x.id !== c.id); B.commit(); B.sheet.close(); B.toast('Category deleted'); }, () => B.openCatEdit(id, back));
    });
  }
};

/* ============================================================ account editor */
B.openAcct = function (id) {
  const st = B.state, a = id ? B.acctById(id) : null, used = new Set(st.accts.map(x => x.color));
  const d = a || { name: '', kind: 'bank', opening: 0, archived: false, color: B.COLORS.slice(0, 8).find(k => !used.has(k)) || B.COLORS[st.accts.length % 8] };
  let color = d.color || 'gray', owe = d.opening < 0, oweTouched = false;
  const html = `<form class="form" id="aForm" autocomplete="off" novalidate>
    <div class="field"><label for="aName">Name</label><input id="aName" maxlength="40" value="${esc(d.name)}" placeholder="e.g. Maybank Savings"></div>
    <div class="field"><label for="aKind">Type</label><select id="aKind">${Object.entries(B.KIND).map(([k, v]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><div class="lbl" id="aColLbl">Colour tag</div><div class="swatches" id="aCols" role="group" aria-labelledby="aColLbl">${B.COLORS.map(k => `<button type="button" class="sw" data-c="${k}" style="--c:${B.cvar(k)}" aria-label="${k === 'gray' ? 'Grey' : 'Colour ' + (B.COLORS.indexOf(k) + 1)}" aria-pressed="${k === color}"></button>`).join('')}</div></div>
    <div class="field"><label for="aOpen">Starting balance (${esc(B.cur())})</label>
      <div class="seg full" id="aSign" role="group" aria-label="Money you have or owe"><button type="button" data-o="0" aria-pressed="${!owe}">Money I have</button><button type="button" data-o="1" aria-pressed="${owe}">Money I owe</button></div>
      <input id="aOpen" inputmode="decimal" value="${d.opening ? Math.abs(d.opening) : ''}" placeholder="0.00"><small>What was in it the day you started using this app. Choose “owe” for a credit card balance.</small></div>
    <p class="err" id="aErr" role="alert" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${a ? 'Save changes' : 'Add account'}</button>${a ? `<button class="btn" type="button" id="aArch">${d.archived ? 'Bring back' : 'Archive'}</button><button class="btn danger" type="button" id="aDel">Delete</button>` : ''}</div></form>`;
  B.sheet.open(a ? 'Edit account' : 'New account', html, { focus: '#aName' });
  const paintSign = () => $$('#aSign button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.o === '1') === owe));
  $('#aCols').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; $$('#aCols .sw').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#aSign').addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (!b) return; owe = b.dataset.o === '1'; oweTouched = true; paintSign(); });
  $('#aKind').addEventListener('change', e => { if (!a && !oweTouched) { owe = e.target.value === 'card'; paintSign(); } });
  $('#aForm').addEventListener('submit', e => {
    e.preventDefault(); const name = $('#aName').value.trim();
    if (!name) { const er = $('#aErr'); er.textContent = 'Give the account a name.'; er.hidden = false; return; }
    const opening = (owe ? -1 : 1) * B.parseAmt($('#aOpen').value);
    const o = a || { id: B.uid() }; Object.assign(o, { name, kind: $('#aKind').value, opening, color, archived: !!d.archived });
    if (!a) st.accts.push(o); B.commit(); B.sheet.close(); B.toast(a ? 'Account updated' : 'Account added');
  });
  if (a) {
    $('#aArch').addEventListener('click', () => { a.archived = !a.archived; B.commit(); B.sheet.close(); });
    $('#aDel').addEventListener('click', () => {
      if (st.tx.some(t => t.acct === a.id || t.toAcct === a.id) || st.rules.some(r => r.acct === a.id || r.toAcct === a.id)) { const er = $('#aErr'); er.textContent = 'This account has entries, so it can only be archived.'; er.hidden = false; return; }
      B.confirm('Delete account?', `${a.name} will be removed.`, 'Delete', () => { st.accts = st.accts.filter(x => x.id !== a.id); B.commit(); B.sheet.close(); }, () => B.openAcct(id));
    });
  }
};

/* ============================================================ repeating entries */
B.openRule = function (id) {
  const st = B.state, r = id ? st.rules.find(x => x.id === id) : null, live = st.accts.filter(a => !a.archived);
  const d = r || { type: 'expense', payee: '', amt: 0, cat: (st.cats.find(c => !c.archived) || {}).id, acct: (live[0] || {}).id, toAcct: null, freq: 'monthly', start: B.todayISO(), end: '', variable: false, paused: false };
  const html = `<form class="form" id="rForm" autocomplete="off" novalidate>
    <div class="seg full" id="rType" role="group" aria-label="Type"><button type="button" data-t="expense">Bill or expense</button><button type="button" data-t="income">Income</button><button type="button" data-t="transfer">Transfer</button></div>
    <div class="field"><label for="rName">Name</label><input id="rName" maxlength="60" value="${esc(d.payee)}" placeholder="e.g. Rent, Netflix, Salary"></div>
    <label class="bigamt"><span>${esc(B.cur())}</span><input id="rAmt" inputmode="decimal" value="${d.amt ? Number(d.amt).toFixed(2) : ''}" placeholder="0.00" aria-label="Amount"></label>
    <div class="field" id="rCatWrap"><label for="rCat">Category</label><select id="rCat">${catOpts(d.cat, false)}</select></div>
    <div class="row2"><div class="field"><label for="rAcct" id="rAcctLbl">Account</label><select id="rAcct">${acctOpts(d.acct)}</select></div><div class="field" id="rToWrap"><label for="rTo">To account</label><select id="rTo">${acctOpts(d.toAcct || (live[1] || live[0] || {}).id)}</select></div></div>
    <div class="row2"><div class="field"><label for="rFreq">Repeats</label><select id="rFreq"><option value="weekly" ${d.freq === 'weekly' ? 'selected' : ''}>Every week</option><option value="monthly" ${d.freq === 'monthly' ? 'selected' : ''}>Every month</option><option value="yearly" ${d.freq === 'yearly' ? 'selected' : ''}>Every year</option></select></div>
    <div class="field"><label for="rStart">First or next due</label><input id="rStart" type="date" value="${d.start}"></div></div>
    <div class="field"><label for="rEnd">Ends (optional)</label><input id="rEnd" type="date" value="${d.end || ''}"></div>
    <label class="switch"><input type="checkbox" id="rVar" ${d.variable ? 'checked' : ''}><span class="tg"></span><span>Amount changes each time<small>New entries are marked as estimates until you correct them.</small></span></label>
    ${r ? `<label class="switch"><input type="checkbox" id="rPause" ${d.paused ? 'checked' : ''}><span class="tg"></span><span>Paused</span></label>` : ''}
    <p class="note" id="rNote"></p><p class="err" id="rErr" role="alert" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${r ? 'Save changes' : 'Add repeating entry'}</button>${r ? '<button class="btn danger" type="button" id="rDel">Delete</button>' : ''}</div></form>`;
  B.sheet.open(r ? 'Edit repeating entry' : 'New repeating entry', html, { focus: '#rName' });
  let type = d.type;
  const sync = () => {
    $$('#rType button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === type));
    $('#rCatWrap').hidden = type !== 'expense'; $('#rToWrap').hidden = type !== 'transfer'; $('#rAcctLbl').textContent = type === 'transfer' ? 'From account' : type === 'income' ? 'Paid into' : 'Paid from';
    const past = $('#rStart').value && $('#rStart').value < B.todayISO();
    $('#rNote').textContent = !r && past ? 'The start date is in the past, so entries from then up to today will be added now.' : '';
  };
  $('#rType').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; sync(); } });
  $('#rStart').addEventListener('change', sync);
  $('#rAmt').addEventListener('blur', e => { const n = B.parseAmt(e.target.value); if (n > 0) e.target.value = B.numStr(n, true); });
  $('#rForm').addEventListener('submit', e => {
    e.preventDefault(); const err = m => { const el = $('#rErr'); el.textContent = m; el.hidden = !m; };
    const name = $('#rName').value.trim(), amt = B.parseAmt($('#rAmt').value);
    if (!name) return err('Give it a name.'); if (!(amt > 0)) return err('Enter an amount greater than zero.'); if (!$('#rStart').value) return err('Pick the first or next due date.');
    if (type === 'expense' && !$('#rCat').value) return err('Choose a category.'); if (type === 'transfer' && $('#rAcct').value === $('#rTo').value) return err('Choose two different accounts.');
    const o = r || { id: B.uid(), last: null, tags: [] };
    Object.assign(o, { payee: name, type, amt, cat: type === 'expense' ? $('#rCat').value : null, acct: $('#rAcct').value, toAcct: type === 'transfer' ? $('#rTo').value : null, freq: $('#rFreq').value, start: $('#rStart').value, end: $('#rEnd').value || null, variable: $('#rVar').checked, paused: r ? $('#rPause').checked : false });
    if (!r) st.rules.push(o);
    const n = B.postDue(st, B.todayISO()); B.commit(); B.sheet.close(); B.toast(n ? `Saved. ${plural(n, 'entry').replace('entrys', 'entries')} added.` : 'Saved');
  });
  if (r) $('#rDel').addEventListener('click', () => B.confirm('Delete repeating entry?', `${r.payee} will stop repeating. Entries it already created stay in your history.`, 'Delete', () => { st.rules = st.rules.filter(x => x.id !== r.id); B.commit(); B.sheet.close(); }, () => B.openRule(id)));
  sync();
};

/* ============================================================ goals */
B.openGoal = function (id) {
  const st = B.state, g = id ? st.goals.find(x => x.id === id) : null, d = g || { name: '', target: 0, opening: 0, monthly: 0, contribs: [] };
  const html = `<form class="form" id="gForm" autocomplete="off" novalidate>
    <div class="field"><label for="gName">Goal</label><input id="gName" maxlength="40" value="${esc(d.name)}" placeholder="e.g. Japan trip"></div>
    <div class="row2"><div class="field"><label for="gTarget">Target (${esc(B.cur())})</label><input id="gTarget" inputmode="decimal" value="${d.target || ''}" placeholder="0"></div>
    <div class="field"><label for="gOpen">Already saved</label><input id="gOpen" inputmode="decimal" value="${d.opening || ''}" placeholder="0"></div></div>
    <div class="field"><label for="gMonthly">Planned saving each month (optional)</label><input id="gMonthly" inputmode="decimal" value="${d.monthly || ''}" placeholder="Leave blank to use your average"><small>Blank means the app estimates from what you have saved in finished periods.</small></div>
    <p class="err" id="gErr" role="alert" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">${g ? 'Save changes' : 'Add goal'}</button>${g ? '<button class="btn" type="button" id="gAdd">Add money</button><button class="btn danger" type="button" id="gDel">Delete</button>' : ''}</div></form>`;
  B.sheet.open(g ? 'Edit goal' : 'New goal', html, { focus: '#gName' });
  $('#gForm').addEventListener('submit', e => {
    e.preventDefault(); const name = $('#gName').value.trim(), target = B.parseAmt($('#gTarget').value), er = $('#gErr');
    if (!name) { er.textContent = 'Give the goal a name.'; er.hidden = false; return; } if (!(target > 0)) { er.textContent = 'Enter a target amount.'; er.hidden = false; return; }
    const o = g || { id: B.uid(), contribs: [] }; Object.assign(o, { name, target, opening: B.parseAmt($('#gOpen').value), monthly: B.parseAmt($('#gMonthly').value) });
    if (!g) { st.goals.push(o); ui.goalId = o.id; } B.commit(); B.sheet.close(); B.toast('Goal saved');
  });
  if (g) {
    $('#gAdd').addEventListener('click', () => B.openGoalMoney(id));
    $('#gDel').addEventListener('click', () => B.confirm('Delete goal?', `${g.name} and its history will be removed.`, 'Delete', () => { st.goals = st.goals.filter(x => x.id !== g.id); B.commit(); B.sheet.close(); }, () => B.openGoal(id)));
  }
};
B.openGoalMoney = function (id) {
  const g = B.state.goals.find(x => x.id === id); if (!g) return;
  const html = `<form class="form" id="gmForm" autocomplete="off" novalidate><p class="lead">${fmt0(B.goalSaved(g))} of ${fmt0(g.target)} saved.</p>
    <label class="bigamt"><span>${esc(B.cur())}</span><input id="gmAmt" inputmode="decimal" placeholder="0.00" aria-label="Amount to add"></label>
    <div class="field"><label for="gmDate">Date</label><input id="gmDate" type="date" value="${B.todayISO()}" max="${B.todayISO()}"></div>
    <label class="check"><input type="checkbox" id="gmOut"><span>Take money out instead</span></label>
    <p class="err" id="gmErr" role="alert" hidden></p><div class="actions"><button class="btn primary" type="submit">Save</button></div></form>`;
  B.sheet.open('Add to ' + g.name, html, { focus: '#gmAmt' });
  $('#gmForm').addEventListener('submit', e => {
    e.preventDefault(); const a = B.parseAmt($('#gmAmt').value); if (!(a > 0)) { const er = $('#gmErr'); er.textContent = 'Enter an amount.'; er.hidden = false; return; }
    g.contribs.push({ date: $('#gmDate').value || B.todayISO(), amt: $('#gmOut').checked ? -a : a }); B.commit(); B.sheet.close(); B.toast('Goal updated');
  });
};

/* ============================================================ first run */
const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
B.openOnboarding = function () {
  const rows = {
    c: B.DEFAULT_CATS.map(c => ({ name: c[0], color: c[1], limit: B.numStr(c[2]), fixed: !!c[3].fixed })),
    a: [{ name: 'Cash', kind: 'cash', color: B.COLORS[0], open: '' }, { name: 'Bank account', kind: 'bank', color: B.COLORS[1], open: '' }]
  };
  const dot = (r, what) => `<button type="button" class="dotbtn" data-do="col" style="--c:${B.cvar(r.color)}" aria-label="Change colour for ${esc(r.name || what)}"></button>`;
  const rmb = (r, what, off) => `<button type="button" class="mini" data-do="rm" aria-label="Remove ${esc(r.name || what)}" ${off ? 'disabled' : ''}>×</button>`;
  const catRow = (r, i) => `<div class="orow2" data-g="c" data-i="${i}">${dot(r, 'category')}<input data-f="name" maxlength="40" value="${esc(r.name)}" placeholder="Category" aria-label="Category name"><input data-f="limit" inputmode="decimal" value="${esc(r.limit)}" placeholder="Limit" aria-label="Monthly limit for ${esc(r.name || 'this category')}">${rmb(r, 'category')}</div>`;
  const acctRow = (r, i) => `<div class="orow2" data-g="a" data-i="${i}">${dot(r, 'account')}<input data-f="name" maxlength="40" value="${esc(r.name)}" placeholder="Account name" aria-label="Account name"><input data-f="open" inputmode="decimal" value="${esc(r.open)}" placeholder="Balance" aria-label="Balance of ${esc(r.name || 'this account')}">${rmb(r, 'account', rows.a.length < 2)}</div>`;
  const sugg = () => B.EXTRA_CATS.filter(x => !rows.c.some(r => r.name.trim().toLowerCase() === x[0].toLowerCase()));
  const html = `<form class="form" id="oForm" autocomplete="off" novalidate>
    <p class="lead">Everything you enter stays on this device. Set up the basics now and change any of it later in Manage.</p>
    <div class="row2 cur"><div class="field"><label for="oCur">Currency</label><input id="oCur" maxlength="4" value="${esc(B.state.settings.currency || 'RM')}"></div>
    <div class="field"><label for="oInc">Monthly income</label><input id="oInc" inputmode="decimal" placeholder="e.g. 5,500"></div></div>
    <div class="field"><label for="oCycle">Month starts on</label><select id="oCycle">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${ordinal(i + 1)}${i === 0 ? ' (calendar)' : ''}</option>`).join('')}</select><small>Paid on the 25th? Start your month on the 25th and your budget lines up with your pay.</small></div>
    <div class="field"><div class="lbl">Accounts</div><div id="oAccts"></div>
      <button type="button" class="filebtn" id="oAddA">Add an account</button></div>
    <div class="field"><div class="lbl">Categories and monthly limits</div><div id="oCats"></div>
      <button type="button" class="filebtn" id="oAddC">Add a category</button>
      <div class="chipgrid" id="oSugg"></div>
      <small>Tap a dot to change its colour, × to remove. Rename anything. You can edit all of this later.</small></div>
    <p class="err" id="oErr" role="alert" hidden></p>
    <div class="actions"><button class="btn primary" type="submit">Start budgeting</button><button class="btn" type="button" id="oPlan">Plan my budget with me</button><button class="btn" type="button" id="oDemo">Look around with sample data</button></div></form>`;
  B.sheet.open('Welcome', html, { locked: true, focus: '#oInc' });
  const paint = () => {
    $('#oCats').innerHTML = rows.c.map(catRow).join('') || '<p class="note">No categories. Add one below, or start without any.</p>';
    $('#oAccts').innerHTML = rows.a.map(acctRow).join('');
    $('#oSugg').innerHTML = sugg().map(x => `<button type="button" class="cchip" data-sg="${esc(x[0])}">+ ${esc(x[0])}</button>`).join('');
    B.initMoney($('#oForm'));
  };
  paint();
  const form = $('#oForm'), showErr = m => { const e = $('#oErr'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ block: 'nearest' }); };
  form.addEventListener('input', e => { const row = e.target.closest('[data-g]'); if (!row || !e.target.dataset.f) return; rows[row.dataset.g][+row.dataset.i][e.target.dataset.f] = e.target.value; showErr(''); });
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.closest('[data-g]')) return;
    e.preventDefault(); const row = e.target.closest('[data-g]'), ins = $$('input', row), i = ins.indexOf(e.target); if (ins[i + 1]) ins[i + 1].focus(); else e.target.blur();
  });
  form.addEventListener('click', e => {
    const sg = e.target.closest('[data-sg]');
    if (sg) { const x = B.EXTRA_CATS.find(y => y[0] === sg.dataset.sg); rows.c.push({ name: x[0], color: x[1], limit: '', fixed: !!x[3].fixed }); paint(); const n = $$('#oCats [data-f="limit"]'); n[n.length - 1].focus(); return; }
    const b = e.target.closest('[data-do]'), row = e.target.closest('[data-g]'); if (!b || !row) return;
    const list = rows[row.dataset.g], i = +row.dataset.i;
    if (b.dataset.do === 'rm') { if (b.disabled) return; list.splice(i, 1); paint(); }
    else { list[i].color = B.COLORS[(B.COLORS.indexOf(list[i].color) + 1) % B.COLORS.length]; paint(); const d = $$(`[data-g="${row.dataset.g}"] .dotbtn`)[i]; if (d) d.focus(); }
  });
  $('#oAddC').addEventListener('click', () => { const used = new Set(rows.c.map(r => r.color)); rows.c.push({ name: '', color: B.COLORS.slice(0, 8).find(k => !used.has(k)) || 'gray', limit: '', fixed: false }); paint(); const n = $$('#oCats [data-f="name"]'); n[n.length - 1].focus(); });
  $('#oAddA').addEventListener('click', () => { const used = new Set(rows.a.map(r => r.color)); rows.a.push({ name: '', kind: 'bank', color: B.COLORS.slice(0, 8).find(k => !used.has(k)) || 'gray', open: '' }); paint(); const n = $$('#oAccts [data-f="name"]'); n[n.length - 1].focus(); });
  const finish = thenPlan => {
    const st = B.state, cats = rows.c.filter(r => r.name.trim()), seen = new Set();
    for (const r of cats) { const k = r.name.trim().toLowerCase(); if (seen.has(k)) return showErr(`Two categories are called “${r.name.trim()}”. Give each its own name.`); seen.add(k); }
    st.settings.currency = ($('#oCur').value.trim() || 'RM'); st.settings.incomeExpected = B.parseAmt($('#oInc').value); st.settings.cycleDay = +$('#oCycle').value; st.settings.onboarded = true;
    const accts = rows.a.filter(r => r.name.trim());
    st.accts = (accts.length ? accts : [{ name: 'Cash', kind: 'cash', color: B.COLORS[0], open: '' }]).map(r => ({ id: B.uid(), name: r.name.trim(), kind: r.kind, opening: B.parseAmt(r.open), color: r.color }));
    st.cats = cats.map(r => ({ id: B.uid(), name: r.name.trim(), color: r.color, limit: B.parseAmt(r.limit), fixed: r.fixed, rollover: false, archived: false }));
    B.sheet.close(true); B.ui.key = B.period.cur(); B.ui.asOf = null; B.commit({ intro: true });
    if (thenPlan) setTimeout(() => B.openPlan(), 60); else B.toast('You are set up. Tap + to add your first entry.');
  };
  form.addEventListener('submit', e => { e.preventDefault(); finish(false); });
  $('#oPlan').addEventListener('click', () => finish(true));
  $('#oDemo').addEventListener('click', () => { B.sheet.close(true); B.enterDemo(); B.render({ intro: true }); });
};
})();

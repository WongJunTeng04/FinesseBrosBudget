/* App lock: a PIN screen that covers the app when it opens and after you have been away.
   It keeps casual snoopers out. It does NOT encrypt your data, and backup files are not protected by it.
   The PIN is stored as a salted hash (PBKDF2 where the browser allows it) in this browser's local storage,
   separate from your budget data. There is no way to recover a forgotten PIN: the only way back in is to erase the app.
   Wrong guesses are slowed down: 5 wrong tries wait 30 seconds, 10 wait a minute, and so on up to 15 minutes. */
(function () {
'use strict';
const B = window.B, { $, $$, esc } = B;
const KEY = 'mb-lock', ITER = 150000, root = document.documentElement, enc = new TextEncoder();
const b64 = a => btoa(String.fromCharCode.apply(null, new Uint8Array(a)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const read = () => { try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && r.hash && r.salt ? r : null; } catch (e) { return null; } };
const write = r => { try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY); return true; } catch (e) { return false; } };
const hasCrypto = () => !!(window.crypto && crypto.subtle);

/* ---------------- hashing ---------------- */
function weak(pin, salt) {   // only where Web Crypto is missing (a plain http address); weaker, still stops a casual look
  const s = pin + ':' + b64(salt); let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let n = 0; n < 20000; n++) for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); h1 ^= h2 >>> 13; h2 ^= h1 >>> 11; }
  return (h2 >>> 0).toString(36) + '.' + (h1 >>> 0).toString(36);
}
async function derive(pin, salt, alg) {
  if (alg === 'pbkdf2') {
    if (!hasCrypto()) throw new Error('nocrypto');
    const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, k, 256));
  }
  return weak(pin, salt);
}
async function make(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), alg = hasCrypto() ? 'pbkdf2' : 'weak';
  return { alg, salt: b64(salt), hash: await derive(pin, salt, alg) };
}
// Returns nothing when the PIN is right, or a message when it is wrong. Keeps the count of wrong tries.
async function check(pin) {
  const r = read(); if (!r) return;
  if (r.until > Date.now()) return 'Too many tries. Please wait.';
  let ok = false;
  try { ok = (await derive(pin, unb64(r.salt), r.alg)) === r.hash; } catch (e) { return 'This browser cannot check the PIN here.'; }
  if (ok) { if (r.fails || r.until) { r.fails = 0; r.until = 0; write(r); } return; }
  r.fails = (r.fails || 0) + 1; r.until = 0;
  if (r.fails % 5 === 0) r.until = Date.now() + Math.min(900, 30 * Math.pow(2, r.fails / 5 - 1)) * 1000;
  write(r);
  const left = 5 - r.fails % 5;
  return r.until ? 'Wrong PIN.' : `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before a short wait.`;
}

/* ---------------- the keypad ---------------- */
const BACK = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9.5l-5 5M12 9.5l5 5"/></svg>';
B.pinpad = function (el, o) {
  if (el._ppEnd) el._ppEnd();   // a keypad already lives here (for example the PIN length was changed): retire it first
  const len = o.len; let pin = '', busy = false, out = false, tick = 0;
  const key = d => `<button type="button" data-k="${d}" aria-label="${d}">${d}</button>`;
  el.classList.add('pp');
  el.innerHTML = `<p class="pp-label"></p><div class="pp-dots" role="img">${'<i></i>'.repeat(len)}</div><p class="pp-msg" role="alert"></p><div class="pp-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('')}<span class="blank"></span>${key(0)}<button type="button" data-k="del" class="del" aria-label="Delete last digit">${BACK}</button></div>`;
  const dots = $('.pp-dots', el), msg = $('.pp-msg', el);
  $('.pp-label', el).textContent = o.label || '';
  const draw = () => { $$('i', dots).forEach((d, i) => d.classList.toggle('on', i < pin.length)); dots.setAttribute('aria-label', `${pin.length} of ${len} digits entered`); };
  draw();
  const reset = () => { pin = ''; draw(); busy = false; };
  const press = k => {
    if (busy || out || !el.isConnected || !el.getClientRects().length || el.closest('[inert]')) return;
    if (k === 'del') pin = pin.slice(0, -1); else if (pin.length < len) pin += k; else return;
    msg.textContent = ''; draw();
    if (pin.length < len) return;
    busy = true;
    Promise.resolve(o.onDone(pin)).then(res => {
      if (typeof res === 'string') { msg.textContent = res; dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); setTimeout(reset, 380); } else reset();
    }, reset);
  };
  const onClick = e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
  const onKey = e => {
    if (!el.isConnected) return document.removeEventListener('keydown', onKey);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
  };
  el.addEventListener('click', onClick); document.addEventListener('keydown', onKey);
  el._ppEnd = () => { el.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); clearInterval(tick); busy = true; };
  return {
    msg(t) { msg.textContent = t || ''; },
    lockout(until) {
      clearInterval(tick);
      const step = () => {
        const s = Math.ceil((until - Date.now()) / 1000);
        if (s <= 0 || !el.isConnected) { clearInterval(tick); out = false; el.classList.remove('pp-out'); if (el.isConnected) msg.textContent = ''; return; }
        out = true; el.classList.add('pp-out'); msg.textContent = `Too many tries. Try again in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.`;
      };
      step(); tick = setInterval(step, 1000);
    }
  };
};
// shared by the lock screen and the sheets: check the PIN, start the wait when needed, run `ok` when right
const guarded = (getApi, ok) => async pin => {
  const m = await check(pin);
  if (m) { const r = read(); if (r && r.until > Date.now()) setTimeout(() => getApi().lockout(r.until), 0); return m; }
  ok(pin);
};

/* ---------------- the lock screen ---------------- */
const S = { locked: false, hiddenAt: 0, waiters: [] };
const setInert = v => ['#app', '#sheet', '#scrim', '#toast', '#tip'].forEach(s => { const e = $(s); if (e) e.inert = v; });
function mount() {
  const r = read(), host = $('#lockPad'); if (!r || !host) return;
  $('#lockForgot').hidden = false;
  const api = B.pinpad(host, { len: r.len, label: 'Enter your PIN', onDone: guarded(() => api, () => unlock()) });
  if (r.until > Date.now()) api.lockout(r.until);
}
function lock() {
  if (!read()) return;
  S.locked = true; root.classList.add('locked'); root.classList.remove('cover'); setInert(true);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  mount();
}
function unlock() {
  S.locked = false; root.classList.remove('locked', 'cover'); setInert(false);
  const w = S.waiters.splice(0); w.forEach(f => f());
}
document.addEventListener('visibilitychange', () => {
  const r = read(); if (!r || S.locked) return;
  if (document.visibilityState === 'hidden') { S.hiddenAt = Date.now(); root.classList.add('cover'); }   // hides the app in the phone's app switcher
  else if (S.hiddenAt && (Date.now() - S.hiddenAt) / 1000 >= (r.auto || 0)) lock();
  else root.classList.remove('cover');
});
window.addEventListener('pageshow', e => { if (e.persisted && read() && !S.locked) lock(); });
$('#lockForgot').addEventListener('click', () => {
  $('#lockForgot').hidden = true;
  if ($('#lockPad')._ppEnd) $('#lockPad')._ppEnd();
  $('#lockPad').innerHTML = `<div class="lock-forgot-box"><p class="lead">Forgot your PIN?</p><p class="note">The only way back in is to erase the app. Your entries, budgets, accounts, goals and photos on this device will be deleted and the PIN removed. If you have a backup file, you can restore it afterwards.</p><div class="actions"><button class="btn danger" id="lfErase">Erase everything</button><button class="btn" id="lfBack">Back</button></div></div>`;
  $('#lfBack').addEventListener('click', mount);
  $('#lfErase').addEventListener('click', async () => {
    write(null); B.state = B.freshState(); try { await B.receipt.clear(); B.invalidate(); await B.flush(); } catch (e) { /* ignore */ }
    location.reload();
  });
});

/* ---------------- setting a PIN, changing it, turning it off ---------------- */
function openSetup(change) {
  let len = (read() || {}).len || 4;
  const title = change ? 'Change PIN' : 'Set a PIN';
  const choose = note => {
    B.sheet.open(title, `<div class="pp-wrap"><p class="lead">Pick a PIN you will remember. It cannot be recovered if you forget it.</p><div class="seg full" id="ppLen" role="group" aria-label="PIN length"><button type="button" data-n="4" aria-pressed="${len === 4}">4 digits</button><button type="button" data-n="6" aria-pressed="${len === 6}">6 digits</button></div><div id="ppHost"></div></div>`);
    const mountPad = () => { const api = B.pinpad($('#ppHost'), { len, label: 'Choose a PIN', onDone: pin => { again(pin); } }); return api; };
    let api = mountPad(); if (note) api.msg(note);
    $('#ppLen').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (!b) return; len = +b.dataset.n; $$('#ppLen button').forEach(x => x.setAttribute('aria-pressed', x === b)); api = mountPad(); });
  };
  const again = pin1 => {
    B.sheet.open(title, `<div class="pp-wrap"><p class="lead">Enter the same PIN once more.</p><div id="ppHost"></div><div class="actions"><button class="btn" type="button" id="ppBack">Back</button></div></div>`);
    $('#ppBack').addEventListener('click', () => choose());
    B.pinpad($('#ppHost'), { len, label: 'Confirm your PIN', onDone: async pin2 => {
      if (pin2 !== pin1) { choose('Those did not match. Try again.'); return; }
      let rec; try { rec = await make(pin1); } catch (e) { return 'Could not set the PIN in this browser.'; }
      const old = read() || {};
      if (!write(Object.assign({ v: 1 }, rec, { len, auto: old.auto == null ? 60 : old.auto, fails: 0, until: 0 }))) return 'Could not save the PIN on this device.';
      B.sheet.close(); B.toast(change ? 'PIN changed' : 'PIN lock is on'); B.render();
    } });
  };
  choose();
}
function verify(title, next) {
  const r = read(); if (!r) return next();
  B.sheet.open(title, '<div class="pp-wrap"><p class="lead">Enter your current PIN to continue.</p><div id="ppHost"></div></div>');
  const api = B.pinpad($('#ppHost'), { len: r.len, label: 'Enter your PIN', onDone: guarded(() => api, next) });
  if (r.until > Date.now()) api.lockout(r.until);
}
B.lock = {
  isOn: () => !!read(), isLocked: () => S.locked,
  whenUnlocked: () => S.locked ? new Promise(res => S.waiters.push(res)) : Promise.resolve(),
  lockNow: () => { if (read()) lock(); },
  setup: () => openSetup(false),
  change: () => verify('Change PIN', () => openSetup(true)),
  off: () => verify('Turn off PIN lock', () => { write(null); B.sheet.close(); B.toast('PIN lock is off'); B.render(); })
};

/* ---------------- Manage card ---------------- */
const AUTO = [[0, 'Right away'], [60, '1 minute'], [300, '5 minutes'], [900, '15 minutes']];
B.renderLockCard = function () {
  const body = $('#lockBody'), sub = $('#lockSub'); if (!body) return;
  const r = read();
  const limits = '<p class="note">A PIN keeps casual snoopers out and hides the app in your phone’s app switcher. It does not encrypt your data, and backup files are not protected by it. Your phone’s own passcode is still the strongest protection. A forgotten PIN cannot be recovered; the only way back in is to erase the app.</p>';
  if (!r) { sub.textContent = 'Ask for a PIN when the app opens.'; body.innerHTML = `<div class="actions"><button class="btn primary" data-act="lock-setup">Set a PIN</button></div>${limits}`; return; }
  sub.textContent = `On, with a ${r.len}-digit PIN.`;
  body.innerHTML = `<div class="field"><label for="lockAuto">Lock after</label><select id="lockAuto">${AUTO.map(([s, l]) => `<option value="${s}" ${s === (r.auto || 0) ? 'selected' : ''}>${l}</option>`).join('')}</select><small>How long you can be away from the app before it asks for the PIN again.</small></div>
    <div class="actions"><button class="btn" data-act="lock-now">Lock now</button><button class="btn" data-act="lock-change">Change PIN</button><button class="btn danger" data-act="lock-off">Turn off</button></div>${limits}`;
};
document.addEventListener('change', e => {
  if (e.target.id !== 'lockAuto') return;
  const r = read(); if (!r) return; r.auto = +e.target.value; write(r); B.toast(`Locks after ${(AUTO.find(a => a[0] === r.auto) || [0, 'a while'])[1].toLowerCase()}`);
});

/* ---------------- start ---------------- */
if (read()) lock(); else root.classList.remove('locked', 'cover');
})();

/* Charts (inline SVG) and the shared hover tooltip. */
(function () {
'use strict';
const B = window.B, P = B.period, { fmt0, fmt2, clamp, esc } = B;
const C = B.charts = {};

/* ---------------- tooltip ---------------- */
const tipEl = () => B.$('#tip');
B.tip = {
  show(ev, title, rows, foot) {
    const el = tipEl(); el.replaceChildren();
    const t = document.createElement('div'); t.className = 'tt'; t.textContent = title; el.append(t);
    rows.forEach(r => {
      const row = document.createElement('div'); row.className = 'tr';
      const k = document.createElement('i'); k.className = 'k ' + (r.shape || 'line'); if (r.color) k.style.setProperty('--c', r.color);
      const v = document.createElement('b'); v.textContent = r.value;
      const l = document.createElement('span'); l.textContent = r.label;
      row.append(k, v, l); el.append(row);
    });
    if (foot) { const f = document.createElement('div'); f.className = 'tf'; f.textContent = foot; el.append(f); }
    el.hidden = false; B.tip.move(ev);
  },
  move(ev) {
    const el = tipEl(), w = el.offsetWidth, h = el.offsetHeight;
    let x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 16;
    if (y + h > innerHeight - 8) y = ev.clientY - h - 16;
    el.style.transform = `translate(${Math.max(8, x)}px,${Math.max(8, y)}px)`;
  },
  hide() { tipEl().hidden = true; }
};

B.dlabel = (info, d) => { const dt = P.dateOf(info, d); return `${B.WD[dt.getDay()]} ${dt.getDate()} ${B.MON[dt.getMonth()]}`; };
const tickLabel = (info, d) => { const dt = P.dateOf(info, d); return (d === 1 || dt.getDate() === 1) ? `${dt.getDate()} ${B.MON[dt.getMonth()]}` : String(dt.getDate()); };

function niceTicks(max) {
  const raw = Math.max(max, 1) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const ticks = []; let v = 0; while (v < max - 1e-9) { ticks.push(v); v += step; } ticks.push(v);
  return { ticks, top: v };
}
const barPath = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
const xTicks = (len, W) => [1, 5, 10, 15, 20, 25, 30].filter(d => d <= len && !(W < 520 && d === 5));

/* ---------------- running total ---------------- */
C.cum = function (el, V, cls) {
  const W = Math.max(300, Math.round(el.clientWidth)), H = 360, ml = 46, mr = 18, mt = 18, mb = 30, iw = W - ml - mr, ih = H - mt - mb, len = V.len, a = V.asOf;
  const px = d => ml + (d - 1) / Math.max(1, len - 1) * iw;
  const prevEnd = V.prevCum ? V.prevCum[Math.min(V.prevCum.length - 1, len)] : 0;
  const showProj = V.remaining > 0 && (V.avgDisc > 0 || V.upBills > 0) && V.hasData;
  const maxV = Math.max(V.hasBudget ? V.budget * 1.04 : 0, V.cum[a], showProj ? V.projEnd : 0, prevEnd, 100);
  const T = niceTicks(maxV), py = v => mt + ih - v / T.top * ih;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Running spend for ${esc(V.info.name)}: ${fmt0(V.cum[a])} by day ${a}${V.hasBudget ? ', against a budget of ' + fmt0(V.budget) : ''}. Switch to the table view to read every day.">`;
  T.ticks.forEach(v => { s += `<line class="${v === 0 ? 'axis-l' : 'grid-l'}" x1="${ml}" x2="${W - mr}" y1="${py(v)}" y2="${py(v)}"/><text class="ax" x="${ml - 8}" y="${py(v) + 4}" text-anchor="end">${B.axFmt(v)}</text>`; });
  xTicks(len, W).forEach(d => { s += `<text class="ax" x="${px(d)}" y="${H - 8}" text-anchor="${d === 1 ? 'start' : 'middle'}">${tickLabel(V.info, d)}</text>`; });
  if (V.hasBudget) {
    s += `<line class="cap-l" x1="${ml}" x2="${W - mr}" y1="${py(V.budget)}" y2="${py(V.budget)}"/><text class="axs" x="${ml + 6}" y="${py(V.budget) - 7}">Budget ${fmt0(V.budget)}</text>`;
    let pd = ''; for (let d = 1; d <= len; d++) pd += (d === 1 ? 'M' : 'L') + px(d).toFixed(1) + ',' + py(V.pace[d]).toFixed(1);
    s += `<path class="ln pace" pathLength="1" d="${pd}"/>`;
  }
  if (V.prevCum) { let qd = ''; const n = Math.min(V.prevCum.length - 1, len); for (let d = 1; d <= n; d++) qd += (d === 1 ? 'M' : 'L') + px(d).toFixed(1) + ',' + py(V.prevCum[d]).toFixed(1); s += `<path class="ln prev" pathLength="1" d="${qd}"/>`; }
  let ld = ''; for (let d = 1; d <= a; d++) ld += (d === 1 ? 'M' : 'L') + px(d).toFixed(1) + ',' + py(V.cum[d]).toFixed(1);
  s += `<path class="area" d="${ld}L${px(a)},${py(0)}L${px(1)},${py(0)}Z"/><path class="ln main" pathLength="1" d="${ld}"/>`;
  if (showProj) {
    s += `<path class="ln proj" d="M${px(a)},${py(V.cum[a])}L${px(len)},${py(V.projEnd)}"/><circle class="late" cx="${px(len)}" cy="${py(V.projEnd)}" r="4" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>`;
    s += `<text class="axs late" x="${px(len)}" y="${py(V.projEnd) - 12}" text-anchor="end">Projected ${fmt0(V.projEnd)}</text>`;
  }
  const ex = px(a), ey = py(V.cum[a]);
  s += `<circle cx="${ex}" cy="${ey}" r="7" fill="var(--surface)"/><circle cx="${ex}" cy="${ey}" r="5" fill="var(--accent)"/>`;
  if (V.cum[a] > 0) s += `<text class="axb" x="${a < 6 ? ex + 12 : ex - 12}" y="${ey - 12}" text-anchor="${a < 6 ? 'start' : 'end'}">${fmt0(V.cum[a])}</text>`;
  s += `<g class="xhg" style="display:none"><line class="xh" y1="${mt}" y2="${mt + ih}"/><circle class="xd1" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><circle class="xd2" r="4" fill="var(--ink-3)" stroke="var(--surface)" stroke-width="2"/></g>`;
  s += `<rect class="hit" x="${ml}" y="${mt}" width="${iw}" height="${ih}"/></svg>`;
  el.className = 'chart' + (cls || ''); el.innerHTML = s;

  const svg = el.querySelector('svg'), hit = el.querySelector('.hit'), g = el.querySelector('.xhg');
  const dayAt = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width); return clamp(Math.round((x - ml) / iw * (len - 1)) + 1, 1, len); };
  hit.addEventListener('pointermove', e => {
    const d = dayAt(e), x = px(d); g.style.display = '';
    const xh = g.querySelector('.xh'); xh.setAttribute('x1', x); xh.setAttribute('x2', x);
    const d1 = g.querySelector('.xd1'), d2 = g.querySelector('.xd2');
    if (d <= a) { d1.style.display = ''; d1.setAttribute('cx', x); d1.setAttribute('cy', py(V.cum[d])); } else d1.style.display = 'none';
    if (V.prevCum && d < V.prevCum.length) { d2.style.display = ''; d2.setAttribute('cx', x); d2.setAttribute('cy', py(V.prevCum[d])); } else d2.style.display = 'none';
    const rows = [];
    if (d <= a) rows.push({ color: 'var(--accent)', value: fmt0(V.cum[d]), label: 'This month' });
    else if (showProj) rows.push({ shape: 'dots', color: 'var(--accent)', value: fmt0(V.cum[a] + (V.projEnd - V.cum[a]) * (d - a) / Math.max(1, len - a)), label: 'Projected' });
    if (V.prevCum && d < V.prevCum.length) rows.push({ color: 'var(--ink-3)', value: fmt0(V.prevCum[d]), label: V.pm.short });
    if (V.hasBudget) rows.push({ shape: 'thin', color: 'var(--axis)', value: fmt0(V.pace[d]), label: 'Budget pace' });
    let foot = '';
    if (d <= a) { const tp = B.topPurchases(V, d, 2), day = V.D.spend[d]; foot = day > 0 ? `Spent ${fmt0(day)} that day` + (tp.length ? `: ${tp.map(t => (t.payee || 'Purchase') + ' ' + fmt0(t.amt)).join(', ')}` : '') : 'Nothing spent that day'; }
    B.tip.show(e, B.dlabel(V.info, d), rows, foot);
  });
  hit.addEventListener('pointerleave', () => { g.style.display = 'none'; B.tip.hide(); });
  hit.addEventListener('click', e => { const d = dayAt(e); if (d <= V.latest) B.setAsOf(d); });
};

/* ---------------- daily bars ---------------- */
C.daily = function (el, V, cls) {
  const W = Math.max(300, Math.round(el.clientWidth)), H = 360, ml = 46, mr = 10, mt = 30, mb = 30, iw = W - ml - mr, ih = H - mt - mb, len = V.len, a = V.asOf;
  const slot = iw / len, bw = Math.max(3, Math.min(24, slot - 2)), evs = V.D.ev.slice(1, a + 1);
  const T = niceTicks(Math.max(...evs, V.allow * 1.15, 20)), py = v => mt + ih - v / T.top * ih, cx = d => ml + slot * (d - 0.5);
  let top = 0; evs.forEach((v, i) => { if (v > (evs[top] || 0)) top = i; }); top += 1;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Everyday spending per day for ${esc(V.info.name)}. ${evs[top - 1] > 0 ? 'Biggest day was ' + B.dlabel(V.info, top) + ' at ' + fmt0(V.D.ev[top]) + '.' : 'Nothing recorded yet.'} Switch to the table view to read every day.">`;
  T.ticks.forEach(v => { s += `<line class="${v === 0 ? 'axis-l' : 'grid-l'}" x1="${ml}" x2="${W - mr}" y1="${py(v)}" y2="${py(v)}"/><text class="ax" x="${ml - 8}" y="${py(v) + 4}" text-anchor="end">${B.axFmt(v)}</text>`; });
  xTicks(len, W).forEach(d => { s += `<text class="ax" x="${cx(d)}" y="${H - 8}" text-anchor="${d === 1 ? 'start' : 'middle'}">${tickLabel(V.info, d)}</text>`; });
  const showAllow = V.hasBudget && V.allow > 0;
  for (let d = 1; d <= a; d++) {
    const v = V.D.ev[d];
    s += `<g class="col" data-d="${d}">` + (v > 0 ? `<path class="bar${showAllow && v > V.allow ? ' over' : ''}" style="animation-delay:${d * 14}ms" d="${barPath(cx(d) - bw / 2, py(0) - Math.max(2, v / T.top * ih), bw, Math.max(2, v / T.top * ih), 4)}"/>` : '') + `<rect x="${ml + slot * (d - 1)}" y="${mt}" width="${slot}" height="${ih}" fill="transparent"/></g>`;
  }
  if (showAllow) s += `<line class="cap-l" x1="${ml}" x2="${W - mr}" y1="${py(V.allow)}" y2="${py(V.allow)}"/><text class="axs" x="${W - mr}" y="${py(V.allow) - 7}" text-anchor="end">Allowance ${fmt0(V.allow)}/day</text>`;
  if (evs[top - 1] > 0) { const tx = clamp(cx(top), ml + 60, W - mr - 60); s += `<text class="axb" x="${tx}" y="${py(V.D.ev[top]) - 9}" text-anchor="middle">${B.dlabel(V.info, top).split(' ').slice(0, 2).join(' ')} · ${fmt0(V.D.ev[top])}</text>`; }
  s += '</svg>';
  el.className = 'chart' + (cls || ''); el.innerHTML = s;
  el.querySelectorAll('.col').forEach(c => {
    const d = +c.dataset.d;
    c.addEventListener('pointermove', e => {
      const v = V.D.ev[d], tp = B.topPurchases(V, d, 3), rows = [{ shape: 'box', color: showAllow && v > V.allow ? 'var(--serious)' : 'var(--accent)', value: fmt0(v), label: 'Everyday spend' }];
      if (showAllow) rows.push({ shape: 'thin', color: 'var(--ink-3)', value: fmt0(Math.abs(v - V.allow)), label: v > V.allow ? 'over the allowance' : 'under the allowance' });
      B.tip.show(e, B.dlabel(V.info, d), rows, tp.length ? tp.map(t => (t.payee || 'Purchase') + ' ' + fmt0(t.amt)).join(', ') : 'No everyday spending');
    });
    c.addEventListener('pointerleave', B.tip.hide);
    c.addEventListener('click', () => B.setAsOf(d));
  });
};

/* ---------------- goal projection ---------------- */
C.goal = function (el, g, M, cls) {
  const W = Math.max(280, Math.round(el.clientWidth)), H = 230, ml = 46, mr = 22, mt = 16, mb = 28, iw = W - ml - mr, ih = H - mt - mb;
  const far = Math.max(M.t0, M.t1), N = clamp(Math.ceil(isFinite(far) ? far : 6) + 1, 4, 24);
  const T = niceTicks(g.target * 1.12), py = v => mt + ih - v / T.top * ih, px = t => ml + t / N * iw, val = (m, t) => M.saved + m * t;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected savings toward ${fmt0(g.target)}. Current pace reaches it in ${B.monthLabel(M.t0)}; with your changes, ${B.monthLabel(M.t1)}.">`;
  T.ticks.forEach(v => { s += `<line class="${v === 0 ? 'axis-l' : 'grid-l'}" x1="${ml}" x2="${W - mr}" y1="${py(v)}" y2="${py(v)}"/><text class="ax" x="${ml - 8}" y="${py(v) + 4}" text-anchor="end">${B.axFmt(v)}</text>`; });
  const now = new Date(), every = N > 8 ? Math.ceil(N / 6) : (W < 420 ? 2 : 1);
  for (let t = 0; t <= N; t += every) { const d = new Date(now.getFullYear(), now.getMonth() + t, 1); s += `<text class="ax" x="${px(t)}" y="${H - 8}" text-anchor="middle">${t === 0 ? 'Now' : B.MON[d.getMonth()]}</text>`; }
  s += `<line class="cap-l" x1="${ml}" x2="${W - mr}" y1="${py(g.target)}" y2="${py(g.target)}"/><text class="axs" x="${ml + 6}" y="${py(g.target) - 7}">Goal ${fmt0(g.target)}</text>`;
  const line = (m, t, c) => { const end = Math.min(t, N); return `<path class="ln ${c}" pathLength="1" d="M${px(0)},${py(M.saved)}L${px(end)},${py(val(m, end))}"/>`; };
  s += line(M.base, M.t0, 'prev') + line(M.plus, M.t1, 'main');
  const dot = (t, col) => t <= N ? `<circle cx="${px(t)}" cy="${py(g.target)}" r="7" fill="var(--surface)"/><circle cx="${px(t)}" cy="${py(g.target)}" r="5" fill="${col}"/>` : '';
  s += dot(M.t0, 'var(--ink-3)') + dot(M.t1, 'var(--accent)');
  const same = Math.ceil(M.t0) === Math.ceil(M.t1);
  if (M.t1 <= N) s += `<text class="axb" x="${px(M.t1)}" y="${py(g.target) + (same ? 26 : -12)}" text-anchor="${M.t1 > N - 1.5 ? 'end' : 'middle'}">${B.monthLabel(M.t1)}</text>`;
  if (!same && M.t0 <= N) s += `<text class="axs" x="${Math.min(px(M.t0) + 6, W - mr)}" y="${py(g.target) + 26}" text-anchor="${M.t0 > N - 1.5 ? 'end' : 'start'}">${B.monthLabel(M.t0)}</text>`;
  s += '</svg>';
  el.className = 'chart' + (cls || ''); el.innerHTML = s;
};
})();

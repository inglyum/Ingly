// INGLY OS V2 — Intelligence Hub UI (live). Insight deterministici con fonte:
// tab Alert · Riordino · Anomalie · RFM · Prodotti · Forecast.
import * as INT from './intelligence.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + (Number(n || 0)).toLocaleString('it-IT', { maximumFractionDigits: 0 });
const uColor = { critical: '#f87171', high: '#f87171', medium: '#fbbf24', low: '#9a9aa2' };
const sevCls = { danger: 'rep-alert-danger', warn: 'rep-alert-warn', info: 'rep-alert-info' };

function insufficient(t) { return `<div class="v2-empty">Dati insufficienti per ${esc(t)}.</div>`; }

export function renderReorder(d) {
  if (!d.items.length) return `<div class="v2-empty">Nessun articolo da riordinare 👍</div>`;
  return `<div class="v2-table-wrap"><table class="v2-table"><thead><tr>
    <th>Prodotto</th><th>Disp.</th><th>Consumo/gg</th><th>Copertura</th><th>Da ordinare</th><th>Urgenza</th></tr></thead>
    <tbody>${d.items.map((r) => `<tr class="v2-row" title="${esc(r.reason)} · ${esc(r.source)}">
      <td>${esc(r.name)}</td><td class="v2-num">${r.available}</td><td class="v2-num">${r.avgDaily}</td>
      <td class="v2-num">${r.daysCover != null ? r.daysCover + ' gg' : '—'}</td><td class="v2-num"><b>${r.suggestQty}</b></td>
      <td style="color:${uColor[r.urgency]};font-weight:700">${esc(r.urgency)}</td></tr>`).join('')}</tbody></table></div>`;
}

export function renderAnomalies(d) {
  if (!d.items.length) return `<div class="v2-empty">Nessuna anomalia rilevata ✅</div>`;
  return `<div class="rep-alerts">${d.items.map((a) => `<div class="rep-alert ${sevCls[a.severity] || ''}" ${a.link ? `data-goto="${esc(a.link)}"` : ''}>
    <b>${esc(a.type)}: ${esc(a.entity)}</b> — ${esc(a.detail)}<span class="v2-muted"> · ${esc(a.source)}</span></div>`).join('')}</div>`;
}

export function renderRFM(d) {
  if (!d.items.length) return insufficient('RFM');
  const segColor = { Campione: '#4ade80', Fedele: '#fbbf24', 'A rischio': '#f87171', Occasionale: '#9a9aa2' };
  return `<div class="v2-table-wrap"><table class="v2-table"><thead><tr>
    <th>Cliente</th><th>RFM</th><th>Ordini</th><th>Speso</th><th>Ultimo (gg)</th><th>Segmento</th></tr></thead>
    <tbody>${d.items.map((r) => `<tr class="v2-row" title="${esc(r.reason)}">
      <td>${esc(r.name)}</td><td>${esc(r.rfm)}</td><td class="v2-num">${r.freq}</td><td class="v2-num">${eur(r.monetary)}</td>
      <td class="v2-num">${r.recencyDays}</td><td style="color:${segColor[r.segment] || ''};font-weight:700">${esc(r.segment)}</td></tr>`).join('')}</tbody></table></div>`;
}

export function renderProducts(d) {
  const list = (rows, fmt) => rows && rows.length ? `<ul class="v2-list">${rows.map((r) => `<li class="v2-li-act"><span>${esc(r.name)}</span><b>${fmt(r)}</b></li>`).join('')}</ul>` : '<div class="v2-empty">—</div>';
  return `<div class="v2-cols">
    <div class="v2-card"><h3>Best seller</h3>${list(d.best, (r) => r.qty + ' pz')}</div>
    <div class="v2-card"><h3>Dead stock</h3>${list(d.dead, (r) => r.qty + ' fermi')}</div>
    <div class="v2-card"><h3>Margine basso</h3>${list(d.lowMargin, (r) => r.marginPct + '%')}</div>
    <div class="v2-card"><h3>Margine alto</h3>${list(d.highMargin, (r) => r.marginPct + '%')}</div></div>`;
}

export function renderForecast(f) {
  if (!f.sufficient) return insufficient('la previsione (servono ordini recenti)');
  return `<div class="v2-grid">
    <div class="v2-kpi"><div class="v2-kpi-l">Ricavo mensile stimato</div><div class="v2-kpi-v">${eur(f.projMonthlyRevenue)}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Incasso atteso 30 gg</div><div class="v2-kpi-v">${eur(f.expectedInflow30)}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Scaduto da incassare</div><div class="v2-kpi-v">${eur(f.overdueInflow)}</div></div>
    <div class="v2-kpi"><div class="v2-kpi-l">Ordini ultimi 90 gg</div><div class="v2-kpi-v">${f.ordersLast90}</div></div>
  </div><p class="v2-muted">${esc(f.reason)} · Fonte: ${esc(f.source)}</p>`;
}

export function renderAlerts(d) {
  if (!d.items.length) return `<div class="v2-empty">Nessun alert. Tutto sotto controllo ✅</div>`;
  return `<div class="rep-alerts">${d.items.map((a) => `<div class="rep-alert ${sevCls[a.level] || ''}" ${a.link ? `data-goto="${esc(a.link)}"` : ''}>
    <b>${esc(a.text)}</b><span class="v2-muted"> · ${esc(a.source)}</span></div>`).join('')}</div>`;
}

const loading = (m) => `<div class="v2-loading">⏳ ${esc(m || 'Caricamento…')}</div>`;
const errorBox = (m) => `<div class="v2-errbox">⚠️ ${esc(m || 'Errore')}</div>`;

export function mount(container, { sb }) {
  if (!container) return;
  const root = container.querySelector('[data-intel-root]') || container;
  root.innerHTML = `
    <div class="v2-tabs" data-int-tabs>
      <button class="v2-tab active" data-int-tab="alerts">🔔 Alert</button>
      <button class="v2-tab" data-int-tab="reorder">📦 Riordino</button>
      <button class="v2-tab" data-int-tab="anom">⚠️ Anomalie</button>
      <button class="v2-tab" data-int-tab="rfm">👑 RFM clienti</button>
      <button class="v2-tab" data-int-tab="prod">🏷️ Prodotti</button>
      <button class="v2-tab" data-int-tab="fc">🔮 Forecast</button>
    </div>
    <div data-int-pane>${loading('Elaboro gli insight…')}</div>`;
  const pane = root.querySelector('[data-int-pane]');
  const cache = {};
  const wireGoto = () => pane.querySelectorAll('[data-goto]').forEach((el) => { el.style.cursor = 'pointer'; el.addEventListener('click', () => { location.hash = '#/' + el.getAttribute('data-goto'); }); });

  async function show(tab) {
    pane.innerHTML = loading('Elaboro…');
    try {
      if (tab === 'reorder') { cache.reorder = cache.reorder || await INT.reorderIntelligence(sb, {}); pane.innerHTML = renderReorder(cache.reorder); }
      else if (tab === 'anom') { cache.anom = cache.anom || await INT.anomalyDetection(sb); pane.innerHTML = renderAnomalies(cache.anom); }
      else if (tab === 'rfm') { cache.rfm = cache.rfm || await INT.customerRFM(sb); pane.innerHTML = renderRFM(cache.rfm); }
      else if (tab === 'prod') { cache.prod = cache.prod || await INT.productIntelligence(sb); pane.innerHTML = renderProducts(cache.prod); }
      else if (tab === 'fc') { cache.fc = cache.fc || await INT.forecast(sb); pane.innerHTML = renderForecast(cache.fc); }
      else { cache.alerts = cache.alerts || await INT.businessAlerts(sb); pane.innerHTML = renderAlerts(cache.alerts); }
      wireGoto();
    } catch (e) { pane.innerHTML = errorBox(INT.friendlyError(e)); }
  }
  root.querySelectorAll('[data-int-tab]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-int-tab]').forEach((x) => x.classList.toggle('active', x === b));
    show(b.getAttribute('data-int-tab'));
  }));
  show('alerts');
}

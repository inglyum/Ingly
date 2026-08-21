// INGLY OS V2 — viste dei moduli. I 4 moduli prioritari riproducono l'IA reale
// di v96 (tab, toolbar, tabelle, kanban) con stati vuoti onesti; gli altri
// mostrano una pagina "non ancora connessa a V2" (nessun controllo finto).
import { findModule } from './modules.js';
import { roleForTenant } from './context.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// bottone che richiede backend → marcato esplicitamente, non finto-funzionante
const nyc = (label) => `<button class="v2-btn v2-nyc" disabled title="Non ancora connesso a V2">${esc(label)} <span class="v2-nyc-tag">non ancora connesso</span></button>`;
const empty = (msg) => `<div class="v2-empty">${esc(msg)}</div>`;
const head = (m, sub) => `<div class="v2-page-head"><div><h2>${m.icon} ${esc(m.n)}</h2>
  <div class="v2-muted">${esc(sub || '')}</div></div><div class="v2-page-actions" data-actions></div></div>`;

function tabs(id, items, active) {
  return `<div class="v2-tabs" data-tabs="${id}">${items.map(([k, l]) =>
    `<button class="v2-tab${k === active ? ' active' : ''}" data-tab="${k}">${esc(l)}</button>`).join('')}</div>`;
}

// ── DASHBOARD ────────────────────────────────────────────────────────────
function viewDashboard(ctx) {
  const kpis = [
    ['Ricavi MTD', '—'], ['Ordini attivi', '—'], ['Preventivi', '—'], ['Margine', '—'],
  ];
  return `${head({ icon: '📊', n: 'Dashboard ROI' }, 'Panoramica business · tenant ' + esc(ctx.activeTenant || '—'))}
    <div class="v2-grid">${kpis.map(([l, v]) =>
      `<div class="v2-kpi"><div class="v2-kpi-l">${l}</div><div class="v2-kpi-v">${v}</div></div>`).join('')}</div>
    <div class="v2-cols">
      <div class="v2-card"><h3>Ultime Vendite</h3>${empty('Nessun dato — collega il backend staging per caricare le vendite.')}</div>
      <div class="v2-card"><h3>Preventivi Recenti</h3>${empty('Nessun preventivo — collega il backend staging.')}</div>
    </div>
    <div class="v2-note">I valori si popoleranno da Supabase (staging) quando il modulo Vendite/Preventivi V2 sarà connesso.</div>`;
}

// ── CRM CLIENTI (live: montato dal router via crm-ui.js) ───────────────────
function viewClients() {
  return `${head({ icon: '👥', n: 'CRM Clienti' }, 'Clienti · contatti · attività · connesso a Supabase')}
    <div data-crm-root><div data-crm-pane><div class="v2-loading">⏳ Inizializzazione CRM…</div></div></div>`;
}

// ── CATALOGO ─────────────────────────────────────────────────────────────
function viewCatalog() {
  return `${head({ icon: '📚', n: 'Catalogo' }, 'Prodotti · varianti · pricing')}
    <div class="v2-toolbar">
      <input class="v2-search" data-search="catalog" placeholder="🔍 Cerca prodotto per nome/SKU…">
      <label class="v2-chk"><input type="checkbox" data-filter="onlyIngly"> Solo Ingly</label>
      ${nyc('+ Prodotto')} ${nyc('Importa catalogo')}
    </div>
    <div class="v2-cards-grid" data-rows="catalog">${empty('Nessun prodotto — collega il backend staging per caricare il catalogo.')}</div>`;
}

// ── ORDINI & WORKFLOW ────────────────────────────────────────────────────
function viewOrders() {
  const cols = [['bozza', 'Bozza'], ['produzione', 'In produzione'], ['pronto', 'Pronto'], ['consegnato', 'Consegnato']];
  return `${head({ icon: '📦', n: 'Ordini & Workflow' }, 'Kanban ordini · coda produzione')}
    <div class="v2-toolbar">${nyc('+ Nuovo ordine')} ${nyc('Nuovo preventivo rapido')}</div>
    <div class="v2-kanban">${cols.map(([k, l]) =>
      `<div class="v2-kcol" data-col="${k}"><div class="v2-kcol-h">${esc(l)} <span class="v2-kcount">0</span></div>
        <div class="v2-kbody">${empty('—')}</div></div>`).join('')}</div>
    <div class="v2-note">Le colonne rispecchiano gli stati ordine di v96. I dati arriveranno da Supabase (staging).</div>`;
}

// ── GENERICO (modulo non ancora connesso) ────────────────────────────────
function viewGeneric(section) {
  const m = findModule(section) || { icon: '📦', n: section, group: '' };
  return `${head(m, 'Categoria: ' + esc(m.group))}
    <div class="v2-card">
      <div class="v2-badge-nyc">Modulo non ancora connesso a V2</div>
      <p>Questo modulo esiste nell'ERP attuale (v96, categoria <b>${esc(m.group)}</b>) ed è
      registrato nella navigazione V2. La sua interfaccia sarà ricostruita in una
      prossima iterazione, con i dati serviti da Supabase (staging).</p>
      <p class="v2-muted">Route: <code>#/${esc(section)}</code> · Sezione v96: <code>${esc(section)}</code></p>
    </div>`;
}

const SPECIAL = { dashboard: viewDashboard, clients: viewClients, catalog: viewCatalog, gestione_ordini: viewOrders };

export function renderView(section, ctx) {
  const fn = SPECIAL[section];
  return `<div class="v2-page" data-page="${esc(section)}">${fn ? fn(ctx) : viewGeneric(section)}</div>`;
}
export const IMPLEMENTED = Object.keys(SPECIAL);

// wiring locale: tab, ricerca (su liste vuote è comunque reale), filtri
export function wireView(root) {
  root.querySelectorAll('[data-tabs]').forEach((bar) => {
    bar.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      bar.querySelectorAll('[data-tab]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      const page = bar.closest('.v2-page');
      page.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.getAttribute('data-pane') !== b.getAttribute('data-tab'); });
    }));
  });
}

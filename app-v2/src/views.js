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
  return `${head({ icon: '📊', n: 'Dashboard ROI' }, 'Panoramica business · tenant ' + esc(ctx.activeTenant || '—'))}
    <div data-dash-pane><div class="v2-loading">⏳ Inizializzazione dashboard…</div></div>`;
}

// ── CRM CLIENTI (live: montato dal router via crm-ui.js) ───────────────────
function viewClients() {
  return `${head({ icon: '👥', n: 'CRM Clienti' }, 'Clienti · contatti · attività · connesso a Supabase')}
    <div data-crm-root><div data-crm-pane><div class="v2-loading">⏳ Inizializzazione CRM…</div></div></div>`;
}

// ── CATALOGO (live: montato dal router via catalog-ui.js) ──────────────────
function viewCatalog() {
  return `${head({ icon: '📚', n: 'Catalogo' }, 'Prodotti · servizi · pricing · connesso a Supabase')}
    <div data-catalog-root><div class="v2-loading">⏳ Inizializzazione catalogo…</div></div>`;
}

// ── ORDINI & WORKFLOW (live: montato dal router via orders-ui.js) ──────────
function viewOrders() {
  return `${head({ icon: '📦', n: 'Ordini & Workflow' }, 'Kanban ordini · da preventivo · connesso a Supabase')}
    <div data-orders-root><div class="v2-loading">⏳ Inizializzazione ordini…</div></div>`;
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

function viewQuotes() {
  return `${head({ icon: '🧾', n: 'Preventivi' }, 'Preventivi · righe · totali · validità 7gg · connesso a Supabase')}
    <div data-quotes-root><div class="v2-loading">⏳ Inizializzazione preventivi…</div></div>`;
}

function viewInvoices() {
  return `${head({ icon: '🧮', n: 'Fatture' }, 'Fatture · imponibile/IVA · scadenze · connesso a Supabase')}
    <div data-invoices-root><div class="v2-loading">⏳ Inizializzazione fatture…</div></div>`;
}

function viewAging() {
  return `${head({ icon: '⏰', n: 'Scadenziario' }, 'Scadenze incassi · aging · derivato dalle fatture')}
    <div data-aging-root><div class="v2-loading">⏳ Inizializzazione scadenziario…</div></div>`;
}

function viewSuppliers() {
  return `${head({ icon: '\u{1F69A}', n: 'Fornitori' }, 'Anagrafica fornitori \u00b7 ciclo passivo \u00b7 connesso a Supabase')}
    <div data-suppliers-root><div class="v2-loading">\u23f3 Inizializzazione fornitori\u2026</div></div>`;
}

function viewPurchases() {
  return `${head({ icon: '\u{1F6D2}', n: 'Acquisti' }, 'Ordini di acquisto \u00b7 fornitori \u00b7 ricezione prevista \u00b7 connesso a Supabase')}
    <div data-purchases-root><div class="v2-loading">\u23f3 Inizializzazione acquisti\u2026</div></div>`;
}

function viewWarehouse() {
  return `${head({ icon: '\u{1F5C4}', n: 'Magazzino' }, 'Giacenze \u00b7 movimenti \u00b7 valore stock \u00b7 connesso a Supabase')}
    <div data-warehouse-root><div class="v2-loading">\u23f3 Inizializzazione magazzino\u2026</div></div>`;
}

function viewProjects() {
  return `${head({ icon: '\u{1F4C1}', n: 'Commesse' }, 'Progetti \u00b7 task \u00b7 ricavi/costi/margine \u00b7 connesso a Supabase')}
    <div data-projects-root><div class="v2-loading">\u23f3 Inizializzazione commesse\u2026</div></div>`;
}

function viewFinance() {
  return `${head({ icon: '\u{1F4B0}', n: 'Finanza' }, 'Cashflow \u00b7 incassi \u00b7 pagamenti \u00b7 esposizione \u00b7 derivato dai documenti')}
    <div data-finance-root><div class="v2-loading">\u23f3 Inizializzazione finanza\u2026</div></div>`;
}

const SPECIAL = { dashboard: viewDashboard, clients: viewClients, catalog: viewCatalog, quotes: viewQuotes, gestione_ordini: viewOrders, invoices: viewInvoices, aging: viewAging, suppliers: viewSuppliers, purchases: viewPurchases, inventory: viewWarehouse, projects: viewProjects, finance: viewFinance };

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

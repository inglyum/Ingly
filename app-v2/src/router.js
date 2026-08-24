// INGLY OS V2 — router hash-based. Ogni sezione (route) rende una vista reale.
import { renderView, wireView } from './views.js';
import { findModule } from './modules.js';
import { mount as mountCrm } from './crm-ui.js';
import { mount as mountDashboard } from './dashboard-ui.js';
import { mount as mountCatalog } from './catalog-ui.js';
import { mount as mountQuotes } from './quotes-ui.js';
import { mount as mountOrders } from './orders-ui.js';
import { mount as mountInvoices } from './invoices-ui.js';
import { mount as mountAging } from './aging-ui.js';
import { mount as mountSuppliers } from './suppliers-ui.js';
import { mount as mountPurchases } from './purchases-ui.js';
import { mount as mountWarehouse } from './warehouse-ui.js';
import { mount as mountProjects } from './projects-ui.js';
import { mount as mountFinance } from './finance-ui.js';
import { mount as mountReports } from './reports-ui.js';
import { mount as mountIntel } from './intelligence-ui.js';
import { mount as mountProduction } from './production-ui.js';
import { mount as mountLogistics } from './logistics-ui.js';
import { mount as mountSearch } from './search-ui.js';
import { mount as mountQuoter } from './quoterstudio-ui.js';
import { mount as mountSettings } from './settings-ui.js';
import { mount as mountProfitFirst } from './profitfirst-ui.js';
import { mount as mountRecurring } from './recurring-ui.js';
import { mount as mountTimeTracker } from './timetracker-ui.js';
import { mount as mountFixedCosts } from './fixedcosts-ui.js';
import { mount as mountAudit } from './audit-ui.js';
import { mount as mountBackup } from './exporter-ui.js';
import { mount as mountEquipment } from './equipment-ui.js';

export function currentRoute() {
  const h = (typeof location !== 'undefined' && location.hash || '').replace(/^#\/?/, '');
  return h || 'dashboard';
}

export function mountRouter(root, ctx, sb) {
  const view = root.querySelector('#v2-view');
  if (!view) return () => {};
  function render() {
    const r = currentRoute();
    view.innerHTML = renderView(r, ctx);
    wireView(view);
    if (r === 'clients' && sb) { try { mountCrm(view, { sb, ctx }); } catch (_) {} }
    if (r === 'dashboard' && sb) { try { mountDashboard(view, { sb }); } catch (_) {} }
    if (r === 'catalog' && sb) { try { mountCatalog(view, { sb, ctx }); } catch (_) {} }
    if (r === 'quotes' && sb) { try { mountQuotes(view, { sb, ctx }); } catch (_) {} }
    if (r === 'gestione_ordini' && sb) { try { mountOrders(view, { sb, ctx }); } catch (_) {} }
    if (r === 'invoices' && sb) { try { mountInvoices(view, { sb, ctx }); } catch (_) {} }
    if (r === 'aging' && sb) { try { mountAging(view, { sb }); } catch (_) {} }
    if (r === 'suppliers' && sb) { try { mountSuppliers(view, { sb, ctx }); } catch (_) {} }
    if (r === 'purchases' && sb) { try { mountPurchases(view, { sb, ctx }); } catch (_) {} }
    if (r === 'inventory' && sb) { try { mountWarehouse(view, { sb, ctx }); } catch (_) {} }
    if (r === 'projects' && sb) { try { mountProjects(view, { sb, ctx }); } catch (_) {} }
    if (r === 'finance' && sb) { try { mountFinance(view, { sb, ctx }); } catch (_) {} }
    if (r === 'analytics' && sb) { try { mountReports(view, { sb }); } catch (_) {} }
    if (r === 'intel' && sb) { try { mountIntel(view, { sb }); } catch (_) {} }
    if (r === 'production' && sb) { try { mountProduction(view, { sb, ctx }); } catch (_) {} }
    if (r === 'logistics' && sb) { try { mountLogistics(view, { sb, ctx }); } catch (_) {} }
    if (r === 'search' && sb) { try { mountSearch(view, { sb }); } catch (_) {} }
    if (r === 'quoter' && sb) { try { mountQuoter(view, { sb, ctx }); } catch (_) {} }
    if (r === 'settings' && sb) { try { mountSettings(view, { sb, ctx }); } catch (_) {} }
    if (r === 'cashflow' && sb) { try { mountProfitFirst(view, { sb, ctx }); } catch (_) {} }
    if (r === 'recurring' && sb) { try { mountRecurring(view, { sb, ctx }); } catch (_) {} }
    if (r === 'timetracker' && sb) { try { mountTimeTracker(view, { sb, ctx }); } catch (_) {} }
    if (r === 'fixed_costs' && sb) { try { mountFixedCosts(view, { sb, ctx }); } catch (_) {} }
    if (r === 'history' && sb) { try { mountAudit(view, { sb, ctx }); } catch (_) {} }
    if (r === 'backup' && sb) { try { mountBackup(view, { sb, ctx }); } catch (_) {} }
    if (r === 'equipment' && sb) { try { mountEquipment(view, { sb, ctx }); } catch (_) {} }
    root.querySelectorAll('[data-route]').forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-route') === r));
    const crumb = root.querySelector('#v2-crumb');
    const m = findModule(r);
    if (crumb) crumb.textContent = m ? m.n : r;
  }
  window.addEventListener('hashchange', render);
  render();
  return render;
}

// INGLY OS V2 — matrice RBAC (mirror della migrazione 0006) — offline.
// NB: questo verifica la matrice INTESA; la prova che il SERVER (RLS+trigger)
// la applica davvero va eseguita a runtime in staging (documentato).
import { describe, it, assert, assertEq } from './harness.mjs';

// Mirror di security.role_perm_cache seminata in 0006_crm_server_rbac.sql
function crmCan(role, resource, action) {
  const entity = ['crm.company', 'crm.customer', 'crm.contact'].includes(resource);
  if (entity) {
    if (action === 'read') return true; // tutti i ruoli
    if (action === 'create' || action === 'update') return ['OWNER', 'ADMIN', 'MANAGER', 'SALES'].includes(role);
    if (action === 'delete') return ['OWNER', 'ADMIN', 'MANAGER'].includes(role);
    return false;
  }
  if (resource === 'crm.activity') {
    if (action === 'read') return true;
    if (action === 'create') return ['OWNER', 'ADMIN', 'MANAGER', 'SALES'].includes(role);
    return false; // update/delete mai
  }
  return false;
}

describe('RBAC matrix (mirror server) — crm.customer', (s) => {
  const R = ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'VIEWER'];
  it(s, 'READ consentito a tutti i ruoli', async () => {
    R.forEach((r) => assert(crmCan(r, 'crm.customer', 'read'), r + ' read'));
  });
  it(s, 'CREATE/UPDATE: OWNER/ADMIN/MANAGER/SALES sì, VIEWER no', async () => {
    ['OWNER', 'ADMIN', 'MANAGER', 'SALES'].forEach((r) => {
      assert(crmCan(r, 'crm.customer', 'create'), r + ' create');
      assert(crmCan(r, 'crm.customer', 'update'), r + ' update');
    });
    assert(!crmCan('VIEWER', 'crm.customer', 'create'), 'VIEWER create denied');
    assert(!crmCan('VIEWER', 'crm.customer', 'update'), 'VIEWER update denied');
  });
  it(s, 'DELETE: MANAGER+ sì, SALES/VIEWER no', async () => {
    ['OWNER', 'ADMIN', 'MANAGER'].forEach((r) => assert(crmCan(r, 'crm.customer', 'delete'), r + ' delete'));
    assert(!crmCan('SALES', 'crm.customer', 'delete'), 'SALES delete DENIED');
    assert(!crmCan('VIEWER', 'crm.customer', 'delete'), 'VIEWER delete DENIED');
  });
});

describe('RBAC matrix — company/contact coerenti con customer', (s) => {
  ['crm.company', 'crm.contact'].forEach((res) => {
    it(s, `${res}: SALES no delete, VIEWER solo read`, async () => {
      assert(crmCan('SALES', res, 'update') && !crmCan('SALES', res, 'delete'), 'SALES ' + res);
      assert(crmCan('VIEWER', res, 'read') && !crmCan('VIEWER', res, 'create'), 'VIEWER ' + res);
    });
  });
});

describe('RBAC matrix — crm.activity (storico immutabile)', (s) => {
  it(s, 'READ tutti; CREATE write-roles; UPDATE/DELETE mai', async () => {
    ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'VIEWER'].forEach((r) => assert(crmCan(r, 'crm.activity', 'read'), r + ' read'));
    ['OWNER', 'ADMIN', 'MANAGER', 'SALES'].forEach((r) => assert(crmCan(r, 'crm.activity', 'create'), r + ' create'));
    assert(!crmCan('VIEWER', 'crm.activity', 'create'), 'VIEWER activity create denied');
    ['OWNER', 'ADMIN', 'MANAGER', 'SALES', 'VIEWER'].forEach((r) => {
      assert(!crmCan(r, 'crm.activity', 'update'), r + ' activity update denied');
      assert(!crmCan(r, 'crm.activity', 'delete'), r + ' activity delete denied');
    });
  });
});

describe('RBAC — Definition of Done (matrice completa)', (s) => {
  it(s, 'OWNER/ADMIN/MANAGER = full su customer', async () => {
    ['OWNER', 'ADMIN', 'MANAGER'].forEach((r) =>
      ['read', 'create', 'update', 'delete'].forEach((a) => assert(crmCan(r, 'crm.customer', a), `${r}/${a}`)));
  });
  it(s, 'SALES = read/create/update, delete DENIED', async () => {
    assertEq([crmCan('SALES', 'crm.customer', 'read'), crmCan('SALES', 'crm.customer', 'create'),
      crmCan('SALES', 'crm.customer', 'update'), crmCan('SALES', 'crm.customer', 'delete')].join(','), 'true,true,true,false');
  });
  it(s, 'VIEWER = read only', async () => {
    assertEq([crmCan('VIEWER', 'crm.customer', 'read'), crmCan('VIEWER', 'crm.customer', 'create'),
      crmCan('VIEWER', 'crm.customer', 'update'), crmCan('VIEWER', 'crm.customer', 'delete')].join(','), 'true,false,false,false');
  });
});

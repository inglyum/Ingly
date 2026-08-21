# 4E — RLS isolation tests (stub, non eseguiti)
Obiettivi (ognuno = un test automatizzato in staging):
1. Tenant A NON legge dati di Tenant B (SELECT su ogni tabella tenant-scoped → 0 righe).
2. Tenant A NON scrive su Tenant B (INSERT/UPDATE con tenant_id di B → negato).
3. Utente senza permesso NON esegue command protetto (Edge → 403).
4. Utente rimosso (membership=revoked) NON accede (claim rigenerato → RLS nega).
5. service-role NON esposto al client (scan bundle/HTML: assente).
6. Storage: oggetto di A non scaricabile da B (path/policy/signed URL).
7. audit_log NON aggiornabile/cancellabile da utente normale (revoke update/delete).
Criterio: tutti PASS, zero leakage.

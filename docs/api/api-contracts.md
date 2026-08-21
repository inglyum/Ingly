# INGLY OS V2 — API Contracts

> Fase 4A · documentazione. Definisce i confini API per tutti i domini. Nessuna
> implementazione eseguita. Backend: Supabase (PostgREST per CRUD, Edge Functions
> per comandi transazionali). Ogni accesso passa da **RLS** (vedi `authentication.md`).

## 1. Tipologie di operazione
- **READ**: query filtrate da RLS (PostgREST `GET` o RPC di lettura).
- **CRUD**: create/update/delete semplici su una tabella (PostgREST), consentiti da RLS.
- **TRANSACTIONAL COMMAND**: caso d'uso multi-tabella atomico → **Edge Function**
  in transazione, emette domain event (outbox) + audit.
- **ASYNC COMMAND**: accodato (`automation.job_queue`) ed eseguito da worker.

**Regola**: ogni operazione **critica** (stock, ordini, produzione, finanza, AI
irreversibile) è un **command server-side**, mai CRUD diretto dal client.

## 2. Convenzioni comuni
- Base CRUD: `https://<staging-ref>.supabase.co/rest/v1/<table>` (RLS-scoped).
- Commands: `https://<staging-ref>.functions.supabase.co/<command>` (Edge).
- Auth: header `Authorization: Bearer <JWT>` (mai service-role sul client).
- Idempotenza: header `Idempotency-Key` sui command che creano/modificano stato.
- Errori: modello uniforme (`error-model.md`). Paginazione/filtri: `pagination-filtering.md`.

## 3. Confini API per dominio

Legenda tipo: **R**=read · **C**=CRUD · **T**=transactional command · **A**=async.

### AUTH / TENANTS / USERS / RBAC
| Operazione | Tipo | Note |
|--|--|--|
| get_session / me | R | claims da JWT |
| list_tenants (dell'utente) | R | da membership |
| switch_tenant | T | rigenera claim (vedi authentication) |
| invite_member / accept_invite | T | crea membership + ruolo |
| assign_role / revoke_role | T | solo OWNER/ADMIN; audit |
| list_roles/permissions | R | globali |

### CRM
| customers/contacts/leads/opportunities/activities/tasks | C | RLS per tenant/ruolo |
| convert_lead_to_customer | T | crea customer + collega opportunity |
| recompute_customer_value | A | job analytics |

### CATALOG
| products/variants/services | C | |
| price_lists/price_rules | C | modifica non tocca documenti storici |
| compute_price (preview) | R/T | calcolo pricing centralizzato (server) |

### SALES
| quotes/quote_items | C | totals snapshot |
| **create_quote / update_quote** | T | congela prezzi/sconti/IVA come colonne |
| **accept_quote → order** | T | crea order dal quote |
| **confirm_order** | T | vedi domain-commands |
| orders/order_items (read) | R | |

### PURCHASING
| suppliers | C | |
| purchase_orders/items | C | |
| **receive_purchase_order** | T | genera `inv_movement` receipt |

### INVENTORY
| materials/locations/batches | C | |
| stock (available) | R | vista derivata (movimenti) |
| **reserve_material** | T | lock + idempotency (HR-1) |
| **release_material** | T | rilascia prenotazione |
| **consume_material** | T | movimento consume (da produzione) |
| **adjust_stock** | T | movimento adjust (auditato) |
| movements (read) | R | append-only |

### PRODUCTION
| bom/bom_items/routing/operations | C | |
| **create_work_order** | T | da order/design_version |
| **schedule_work_order** | T | assegna macchina/tempi |
| **start_production / complete_production** | T | transizioni stato + eventi |
| work_orders (read) | R | |

### MACHINES
| machines/profiles | C | |
| maintenance/downtime/jobs | C/T | job legati a operazioni |
| utilization | R | da MV per-tenant |

### QUALITY
| **record_quality_result** | T | pass/fail → eventi (fail→rework) |
| non_conformance (defect/rework/scrap) | C | tabella unificata |

### PROJECTS / DESIGN
| projects/assets | C | binari in Storage |
| designs | C | |
| **create_design_version** | T | versione immutabile |
| **run_preflight** | T/A | valida SVG/DXF |
| **publish_design_version** | T | congela versione |

### SHIPPING
| **create_shipment** | T | da order |
| shipment_events | C | tracking |

### FINANCE
| **issue_invoice** | T | da order; SDI status |
| **record_payment** | T | idempotente |
| expenses/cashflow | C | |
| AR/AP/cashflow (read) | R | viste/MV per-tenant |

### AUTOMATION
| automations/triggers/actions | C | conditions JSONB |
| executions/logs | R | |
| **run_automation (manual)** | T/A | |

### EVENTS
| domain_events (read) | R | interni; per-tenant |
| replay_event (admin) | A | idempotente |

### AI
| ai_runs/recommendations (read) | R | |
| **request_ai_analysis** | A | input strutturati |
| **approve_ai_recommendation** | T | gate azioni irreversibili |

### ANALYTICS
| kpi/reports/forecasts | R | MV per-tenant |
| refresh_analytics | A | schedulato |

## 4. Operazioni transazionali obbligatorie (server command)
`confirm_order, reserve_material, release_material, consume_material,
create_work_order, schedule_work_order, start_production, complete_production,
record_quality_result, create_shipment, issue_invoice, record_payment,
approve_ai_recommendation, receive_purchase_order, create_design_version,
publish_design_version`. Dettaglio I/O in `domain-commands.md`.

## 5. Cosa NON è esposto
Schemi `events/automation/ai/integ/audit/sync` non hanno API pubblica: accessibili
solo da Edge (service-role) con validazione ruolo/tenant.

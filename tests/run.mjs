// Runner della suite di test INGLY OS. Importa le spec (che si registrano) ed esegue.
import './critical.test.mjs';
import './catalog.test.mjs';
import './auth.test.mjs';
import './bundle.test.mjs';
import './staging_sql.test.mjs';
import './app_v2_shell.test.mjs';
import './crm.test.mjs';
import './context.test.mjs';
import './rbac.test.mjs';
import './dashboard.test.mjs';
import './catalog.v2.test.mjs';
import { run } from './harness.mjs';
await run();

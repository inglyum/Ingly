// Runner della suite di test INGLY OS. Importa le spec (che si registrano) ed esegue.
import './critical.test.mjs';
import './catalog.test.mjs';
import './bundle.test.mjs';
import { run } from './harness.mjs';
await run();

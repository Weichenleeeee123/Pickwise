import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './server/app.js';
import { createLlm, loadEnv } from './server/llm.js';
import { Store } from './server/store.js';
import { createDataForSeo } from './server/dataforseo.js';
import { createApify } from './server/apify.js';
import { createResearchSources } from './server/research-sources.js';
import { startMonitor } from './server/monitoring.js';
import { isRunning } from './server/agent/pipeline.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const env = loadEnv();
const llm = createLlm(env);
const dataForSeo = createDataForSeo({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
const apify = createApify({ token: env.APIFY_API_TOKEN });
const store = new Store(env.PICKWISE_DATA_DIR || fileURLToPath(new URL('./data/sessions', import.meta.url)));
await store.init();

const researchSources = createResearchSources({ token: env.APIFY_API_TOKEN, reviewsEnabled: env.APIFY_REVIEWS_ENABLED === 'true', noLoginReviewsEnabled: env.APIFY_NO_LOGIN_REVIEWS_ENABLED !== 'false' });
const handler = createApp({ store, llm, dataForSeo, apify, researchSources, publicDir: root });
startMonitor({ store, provider: apify, isRunning });
const server = createServer(handler);
const port = Number(env.PORT ?? 4173);
server.listen(port, '127.0.0.1', () => {
  console.log(`Pickwise ready at http://127.0.0.1:${port}`);
  console.log(llm.configured ? `模型：${llm.provider} / ${llm.model}` : '模型未配置：复制 .env.example 为 .env 并填写后重启。未配置时无法开始分析。');
  console.log(dataForSeo.configured ? 'Amazon 数据源：DataForSEO 已配置。' : 'Amazon 数据源未配置：可继续通过 CSV / JSON 导入证据。');
  console.log(apify.configured ? 'Amazon 数据源：Apify 已配置，将优先使用。' : '');
});

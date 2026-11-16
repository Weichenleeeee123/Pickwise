// Share a conservative run limit across product and specialist collectors.
// The current Free account allows five concurrent runs; keep headroom for manual runs.
const MAX_ACTIVE = 2;
const waiting = [];
let active = 0;

async function acquire() {
  if (active < MAX_ACTIVE) { active++; return; }
  await new Promise(resolve => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next(); else active--;
}

export async function withApifyRun(work) {
  for (let attempt = 0; ; attempt++) {
    await acquire();
    try { return await work(); }
    catch (error) {
      if (!(attempt < 2 && error.apifyResourceLimit === true)) throw error;
    } finally { release(); }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
}

export async function apifyResponseError(response, actor, token = '') {
  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = {}; }
  const code = String(payload.error?.type ?? payload.error?.code ?? 'unknown');
  let detail = String(payload.error?.message ?? raw ?? '').slice(0, 600);
  if (token) detail = detail.split(token).join('[REDACTED]');
  detail = detail.replace(/([?&]token=)[^&\s"']+/gi, '$1[REDACTED]');
  const error = new Error(`Apify ${actor} HTTP ${response.status} [${code}]: ${detail}`);
  error.apifyCode = code;
  error.status = response.status;
  error.apifyResourceLimit = response.status === 402 && [
    'actor-memory-limit-exceeded', 'actor-run-limit-exceeded',
    'actor-concurrent-run-limit-exceeded', 'max-concurrent-actor-jobs-exceeded'
  ].includes(code);
  return error;
}

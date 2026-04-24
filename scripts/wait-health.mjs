/** Poll GET /api/health until OK or timeout (default 120s). Used before starting Vite. */
const url = process.env.HEALTH_URL || 'http://127.0.0.1:3847/api/health';
const maxMs = Number(process.env.WAIT_MAX_MS || 120_000);
const stepMs = 400;
const deadline = Date.now() + maxMs;

while (true) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      console.log(`OK: ${url}`);
      process.exit(0);
    }
  } catch {
    /* retry */
  }
  if (Date.now() >= deadline) {
    console.error(`Timeout waiting for ${url} (${maxMs}ms)`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, stepMs));
}

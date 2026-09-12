let initialized = false;

export async function ensureGlobalHttpDispatcher(): Promise<void> {
  if (initialized) return;

  try {
    const undici = await import("undici");
    const agent = new undici.Agent({
      keepAliveTimeout: 60_000,
      connections: 500,
      pipelining: 1,
    });

    undici.setGlobalDispatcher(agent);
    initialized = true;
  } catch {
    // no-op fallback when runtime does not expose compatible undici internals
  }
}

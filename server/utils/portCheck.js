let _port3004Status = { reachable: true, lastCheck: 0 };

/**
 * Checks whether http://localhost:3004 is reachable.
 * Uses a short timeout and cached value to prevent request overhead.
 */
export async function isPort3004Reachable(force = false) {
  const now = Date.now();
  if (!force && (now - _port3004Status.lastCheck < 1500)) {
    return _port3004Status.reachable;
  }

  const primary = process.env.AUTH_SERV_URL || 'http://localhost:3004';
  const fallback = primary.replace('localhost', '127.0.0.1');

  let reachable = false;
  try {
    await fetch(primary, { signal: AbortSignal.timeout(1200) });
    reachable = true;
  } catch {
    try {
      await fetch(fallback, { signal: AbortSignal.timeout(1200) });
      reachable = true;
    } catch {
      reachable = false;
    }
  }

  _port3004Status = { reachable, lastCheck: Date.now() };
  return reachable;
}

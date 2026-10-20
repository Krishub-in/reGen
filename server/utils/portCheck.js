import net from 'net';

let _port3004Status = { reachable: false, lastCheck: 0 };

function checkTcp(port, host, timeout = 600) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Checks whether port 3004 (or AUTH_SERV_URL) is reachable.
 * Uses TCP socket connection and HTTP fetch with short timeout.
 */
export async function isPort3004Reachable(force = false) {
  const now = Date.now();
  if (!force && (now - _port3004Status.lastCheck < 1500)) {
    return _port3004Status.reachable;
  }

  const primary = process.env.AUTH_SERV_URL || 'http://localhost:3004';
  let port = 3004;
  let host = '127.0.0.1';

  try {
    const parsed = new URL(primary);
    if (parsed.port) port = parseInt(parsed.port, 10);
    if (parsed.hostname) host = parsed.hostname;
  } catch {}

  let reachable = false;
  // 1. Check TCP on primary host
  reachable = await checkTcp(port, host, 600);

  // 2. Fallback to alternate loopback address
  if (!reachable && (host === 'localhost' || host === '127.0.0.1')) {
    const altHost = host === 'localhost' ? '127.0.0.1' : 'localhost';
    reachable = await checkTcp(port, altHost, 600);
  }

  // 3. Fallback to fetch if TCP connection check could not determine
  if (!reachable) {
    try {
      await fetch(primary, { signal: AbortSignal.timeout(600) });
      reachable = true;
    } catch {
      try {
        const fallback = primary.replace('localhost', '127.0.0.1');
        await fetch(fallback, { signal: AbortSignal.timeout(600) });
        reachable = true;
      } catch {
        reachable = false;
      }
    }
  }

  _port3004Status = { reachable, lastCheck: Date.now() };
  return reachable;
}


import net from 'net';

let _port3004Status = { reachable: false, lastCheck: 0 };

function checkTcpPort(port, host = '127.0.0.1', timeout = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
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
    socket.connect(port, host);
  });
}

/**
 * Checks whether port 3004 (or AUTH_PORT / AUTH_SERV_URL) is reachable.
 * Uses rapid TCP probe with cached value to prevent overhead.
 */
export async function isPort3004Reachable(force = false) {
  const now = Date.now();
  if (!force && _port3004Status.lastCheck > 0 && (now - _port3004Status.lastCheck < 1500)) {
    return _port3004Status.reachable;
  }

  let targetPort = 3004;
  let targetHost = '127.0.0.1';
  if (process.env.AUTH_PORT) {
    targetPort = parseInt(process.env.AUTH_PORT, 10);
  } else if (process.env.AUTH_SERV_URL) {
    try {
      const u = new URL(process.env.AUTH_SERV_URL);
      targetPort = parseInt(u.port || (u.protocol === 'https:' ? '443' : '80'), 10);
      targetHost = u.hostname || '127.0.0.1';
    } catch {}
  }

  // Rapid TCP check on target port (IPv4 and IPv6)
  let reachable = await checkTcpPort(targetPort, targetHost, 500);
  if (!reachable && (targetHost === '127.0.0.1' || targetHost === 'localhost')) {
    reachable = await checkTcpPort(targetPort, '::1', 500);
  }

  // If failed on IPv4, test localhost or fetch
  if (!reachable) {
    try {
      const primary = process.env.AUTH_SERV_URL || `http://${targetHost}:${targetPort}`;
      await fetch(primary, { signal: AbortSignal.timeout(600) });
      reachable = true;
    } catch {
      reachable = false;
    }
  }

  _port3004Status = { reachable, lastCheck: Date.now() };
  return reachable;
}


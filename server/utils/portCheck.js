import net from 'net';

let _port3004Status = { reachable: true, lastCheck: 0, failCount: 0 };

function checkTcpPort(port, host = '127.0.0.1', timeout = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

/**
 * Checks whether port 3004 (or AUTH_PORT / AUTH_SERV_URL) is reachable.
 * Uses concurrent dual-stack TCP probes + HTTP probe with debounced failure smoothing.
 */
export async function isPort3004Reachable(force = false) {
  const now = Date.now();
  const cacheTtl = _port3004Status.reachable ? 2500 : 800;
  if (!force && _port3004Status.lastCheck > 0 && (now - _port3004Status.lastCheck < cacheTtl)) {
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

  // Concurrent TCP checks across 127.0.0.1, ::1, and localhost
  const probeHosts = (targetHost === '127.0.0.1' || targetHost === 'localhost')
    ? ['127.0.0.1', '::1', 'localhost']
    : [targetHost];

  let reachable = false;
  try {
    const results = await Promise.all(probeHosts.map(h => checkTcpPort(targetPort, h, 1200)));
    reachable = results.some(Boolean);
  } catch {
    reachable = false;
  }

  // If TCP check didn't connect, test HTTP probe (any response means port is alive)
  if (!reachable) {
    for (const h of probeHosts) {
      try {
        const url = `http://${h.includes(':') ? `[${h}]` : h}:${targetPort}`;
        await fetch(url, { signal: AbortSignal.timeout(1000) });
        reachable = true;
        break;
      } catch (err) {
        // If server responded with ANY HTTP status code, fetch resolves or throws only on network down
        if (err && err.name !== 'TypeError' && err.name !== 'TimeoutError') {
          reachable = true;
          break;
        }
      }
    }
  }

  if (reachable) {
    _port3004Status = { reachable: true, lastCheck: now, failCount: 0 };
    return true;
  }

  // Debounced failure smoothing: require 2 consecutive failed probes before flagging unreachable
  const nextFails = (_port3004Status.failCount || 0) + 1;
  const isReallyDown = nextFails >= 2;

  _port3004Status = {
    reachable: !isReallyDown,
    lastCheck: now,
    failCount: nextFails
  };

  return _port3004Status.reachable;
}


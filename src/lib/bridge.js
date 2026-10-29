import { useEffect, useState } from 'react';
import { useTable } from './useTable.js';

const ONLINE_MS = 30000;

// Which helper programs are connected right now. "Online" means it checked in during the last 30 seconds. Nothing is assumed.
export function useBridge(projectId) {
  const { rows, state } = useTable('cc_bridge_devices', projectId, { order: 'created_at', ascending: false, limit: 20 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t); }, []);
  const devices = rows.filter((d) => !d.revoked_at).map((d) => ({ ...d, online: !!d.last_seen_at && now - new Date(d.last_seen_at).getTime() < ONLINE_MS }));
  return { devices, online: devices.find((d) => d.online) ?? null, state };
}

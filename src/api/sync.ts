import { apiFetch } from './client.js';

export async function getSyncStatus(): Promise<{ available: true; myID: string } | { available: false }> {
  const res = await apiFetch('/api/v1/sync/status');
  if (res.status === 503) return { available: false };
  if (!res.ok) return { available: false };
  const data = await res.json();
  return { available: true, myID: data.myID };
}

export interface SyncConnection {
  connected: boolean;
  address: string;
}

export async function getSyncConnections(): Promise<Record<string, SyncConnection>> {
  const res = await apiFetch('/api/v1/sync/connections');
  if (!res.ok) return {};
  const data = await res.json();
  return data.connections ?? {};
}

export interface SyncDevice {
  deviceID: string;
  name: string;
}

export async function getSyncDevices(): Promise<SyncDevice[]> {
  const res = await apiFetch('/api/v1/sync/config/devices');
  if (!res.ok) return [];
  return await res.json();
}

export async function addSyncDevice(deviceID: string, name?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/api/v1/sync/config/devices', {
    method: 'POST',
    body: JSON.stringify({ deviceID, name }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || 'Failed to pair device' };
  return { ok: true };
}

export async function getSyncFolderStatus(): Promise<{ globalBytes: number; inSyncBytes: number } | null> {
  const res = await apiFetch('/api/v1/sync/folder/status');
  if (!res.ok) return null;
  return await res.json();
}

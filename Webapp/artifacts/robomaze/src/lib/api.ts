const BASE = '/roboapi';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    throw new Error(`API Error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export const api = {
  getStatus: () => request<any>('/status'),
  getTelemetry: () => request<any>('/telemetry'),
  sendCommand: (command: string, params?: any) =>
    request<any>('/command', { method: 'POST', body: JSON.stringify({ command, params }) }),
  getCommandHistory: () => request<any[]>('/command/history'),
  getMaze: () => request<any>('/maze'),
  getMazeStats: () => request<any>('/maze/stats'),
  resetMaze: () => request<any>('/maze/reset', { method: 'POST' }),
  getLogs: (filters?: { level?: string; category?: string; search?: string; since?: number; count?: number }) => {
    const params = new URLSearchParams();
    if (filters?.level) params.set('level', filters.level);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.since) params.set('since', String(filters.since));
    if (filters?.count) params.set('count', String(filters.count));
    return request<any[]>(`/logs?${params}`);
  },
  clearLogs: () => request<any>('/logs/clear', { method: 'POST' }),
  getSettings: () => request<any>('/settings'),
  updateSettings: (settings: any) =>
    request<any>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  resetSettings: () => request<any>('/settings/reset', { method: 'POST' }),
  connect: (config: any) =>
    request<any>('/connection', { method: 'POST', body: JSON.stringify(config) }),
  toggleEStop: () => request<any>('/estop', { method: 'POST' }),
};

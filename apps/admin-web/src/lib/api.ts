const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> ?? {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';

  const res = await fetch(`${API_URL}/api/v1${path}`, { ...options, headers });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).message ?? res.statusText); }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

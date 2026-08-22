import { env } from './env';

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> ?? {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';

  const res = await fetch(`${env.apiUrl}/api/v1${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'Request failed');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

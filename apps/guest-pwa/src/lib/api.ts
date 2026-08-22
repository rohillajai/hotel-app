import { env } from './env';

/**
 * Typed fetch wrapper for API calls.
 * Automatically attaches JWT and handles common error patterns.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = typeof window !== 'undefined'
    ? sessionStorage.getItem('access_token')
    : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }

  const res = await fetch(`${env.apiUrl}/api/v1${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.code ?? 'UNKNOWN', error.message ?? 'Request failed', error);
  }

  // Handle empty responses (204 etc)
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

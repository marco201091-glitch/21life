import { getApiBaseUrl } from '@/lib/env';
import { supabase } from '@/lib/supabase';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ApiResult<T> {
  data?: T;
  error?: string;
  status: number;
  requestId?: string;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  authenticated?: boolean;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function buildHeaders(
  options: ApiRequestOptions,
  token: string | null,
) {
  return {
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
}

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  const requestId = response.headers.get('X-Request-Id');
  return {
    data: payload,
    error: typeof payload?.error === 'string' ? payload.error : undefined,
    status: response.status,
    ...(requestId ? { requestId } : {}),
  };
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const authenticated = options.authenticated !== false;
  const controller = new AbortController();
  const handleAbort = () => controller.abort();
  options.signal?.addEventListener('abort', handleAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const execute = async (token: string | null) => fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers: await buildHeaders(options, token),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: controller.signal,
  });

  try {
    let token = authenticated ? await getAccessToken() : null;
    let response = await execute(token);

    if (authenticated && token && response.status === 401) {
      const { data } = await supabase.auth.refreshSession();
      token = data.session?.access_token ?? null;
      if (token) response = await execute(token);
    }

    return await parseResponse<T>(response);
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      error: aborted
        ? 'Request timed out.'
        : error instanceof Error
          ? error.message
          : 'Network request failed.',
      status: 0,
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', handleAbort);
  }
}

export function apiGet<T>(
  path: string,
  options?: Omit<ApiRequestOptions, 'method' | 'body'>,
) {
  return apiRequest<T>(path, { ...options, method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
  return apiRequest<T>(path, { ...options, method: 'POST', body });
}

export function apiPatch<T>(path: string, body: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
  return apiRequest<T>(path, { ...options, method: 'PATCH', body });
}

export function apiDelete<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) {
  return apiRequest<T>(path, { ...options, method: 'DELETE', body });
}

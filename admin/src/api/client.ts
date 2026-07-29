import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import i18n from '../i18n';

const baseURL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
  /\/$/,
  '',
) ?? '';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

const ACCESS_KEY = 'ecolife_admin_access';
const REFRESH_KEY = 'ecolife_admin_refresh';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function rotateRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${baseURL}/api/v1/auth/refresh`, {
      refreshToken,
    });
    const tokens = data.tokens as {
      accessToken: string;
      refreshToken: string;
    };
    setTokens(tokens.accessToken, tokens.refreshToken);
    return tokens.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retry = true;
      refreshPromise ??= rotateRefresh().finally(() => {
        refreshPromise = null;
      });
      const access = await refreshPromise;
      if (access) {
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      }
      const base = (import.meta.env.BASE_URL as string).replace(/\/$/, '');
      window.location.assign(`${base}/login`);
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] };
    if (Array.isArray(data?.message)) return data.message.join(', ');
    if (typeof data?.message === 'string') return data.message;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return i18n.t('common.unknownError');
}

/** Typed API error body (e.g. EXTEND_BLOCKED 409 with transferOffers). */
export function getErrorPayload<T extends Record<string, unknown>>(
  error: unknown,
): (T & { statusCode?: number; message?: string | string[]; code?: string }) | null {
  if (!axios.isAxiosError(error) || !error.response?.data) return null;
  return error.response.data as T & {
    statusCode?: number;
    message?: string | string[];
    code?: string;
  };
}

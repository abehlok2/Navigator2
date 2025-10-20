import type { AuthResponse, LoginPayload, RegisterPayload, User } from '../../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
const TOKEN_STORAGE_KEY = 'navigator.auth.token';
const USER_STORAGE_KEY = 'navigator.auth.user';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

type FetchWithAuthOptions = RequestInit & { includeAuth?: boolean };

type JsonRecord = Record<string, unknown>;

const buildUrl = (path: string): string => {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const ensureJsonHeaders = (headers: Headers): Headers => {
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
};

const readJson = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
};

export const getStoredToken = (): string | null => {
  if (!isBrowser) {
    return null;
  }

  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
};

export const getStoredUser = (): User | null => {
  if (!isBrowser) {
    return null;
  }

  const raw = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as User;
    return parsed;
  } catch (error) {
    console.warn('Failed to parse stored user information', error);
    return null;
  }
};

const setStoredAuth = (token: string, user: User): void => {
  if (!isBrowser) {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
};

export const clearStoredAuth = (): void => {
  if (!isBrowser) {
    return;
  }

  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
};

export const fetchWithAuth = async <T = JsonRecord>(
  path: string,
  options: FetchWithAuthOptions = {}
): Promise<T> => {
  const { includeAuth = true, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);

  if (rest.body && !(rest.body instanceof FormData)) {
    ensureJsonHeaders(requestHeaders);
  } else if (!requestHeaders.has('Accept')) {
    requestHeaders.set('Accept', 'application/json');
  }

  if (includeAuth) {
    const token = getStoredToken();
    if (token) {
      requestHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(buildUrl(path), {
    ...rest,
    headers: requestHeaders,
  });

  if (!response.ok) {
    let errorMessage = response.statusText || 'Request failed';

    try {
      const body = await readJson<{ message?: string }>(response);
      if (body?.message) {
        errorMessage = body.message;
      }
    } catch (error) {
      console.warn('Failed to parse error response', error);
    }

    throw new Error(errorMessage);
  }

  return readJson<T>(response);
};

export const login = async (username: string, password: string): Promise<AuthResponse> => {
  const payload: LoginPayload = { username, password };

  const result = await fetchWithAuth<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    includeAuth: false,
  });

  setStoredAuth(result.token, result.user);
  return result;
};

export const register = async (
  username: string,
  password: string,
  role: RegisterPayload['role']
): Promise<AuthResponse> => {
  const payload: RegisterPayload = { username, password, role };

  const result = await fetchWithAuth<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
    includeAuth: false,
  });

  setStoredAuth(result.token, result.user);
  return result;
};

export const authStorageKeys = {
  token: TOKEN_STORAGE_KEY,
  user: USER_STORAGE_KEY,
} as const;

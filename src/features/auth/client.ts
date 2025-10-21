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

export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

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
    let errorCode: string | undefined;

    try {
      const body = await readJson<{ error?: { message?: string; code?: string } }>(response);
      if (body?.error?.message) {
        errorMessage = body.error.message;
      }
      if (body?.error?.code) {
        errorCode = body.error.code;
      }
    } catch (error) {
      console.warn('Failed to parse error response', error);
    }

    throw new HttpError(errorMessage, response.status, errorCode);
  }

  return readJson<T>(response);
};

export const login = async (email: string, password: string): Promise<AuthResponse> => {
  const payload: LoginPayload = { email, password };

  const result = await fetchWithAuth<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    includeAuth: false,
  });

  setStoredAuth(result.token, result.user);
  return result;
};

export const register = async (
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse> => {
  const payload: RegisterPayload = { email, password, displayName };

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

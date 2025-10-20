import { create } from 'zustand';

import type { User } from '../types/auth';
import {
  clearStoredAuth,
  getStoredToken,
  getStoredUser,
  login as loginRequest,
} from '../features/auth/client';

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const initializeAuthState = () => {
  const token = getStoredToken();
  const user = getStoredUser();

  return {
    user,
    token,
    isAuthenticated: Boolean(token),
  } satisfies Pick<AuthState, 'user' | 'token' | 'isAuthenticated'>;
};

export const useAuthStore = create<AuthState>()((set) => ({
  ...initializeAuthState(),
  async login(username, password) {
    const { token, user } = await loginRequest(username, password);

    set(() => ({
      user,
      token,
      isAuthenticated: true,
    }));
  },
  logout() {
    clearStoredAuth();

    set(() => ({
      user: null,
      token: null,
      isAuthenticated: false,
    }));
  },
}));

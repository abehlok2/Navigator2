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
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const initializeAuthState = () => {
  const token = getStoredToken();
  const storedUser = getStoredUser();
  const user = storedUser
    ? ({
        ...storedUser,
        role: 'facilitator',
      } satisfies User)
    : null;

  return {
    user,
    token,
    isAuthenticated: Boolean(token),
  } satisfies Pick<AuthState, 'user' | 'token' | 'isAuthenticated'>;
};

export const useAuthStore = create<AuthState>()((set) => ({
  ...initializeAuthState(),
  async login(email, password) {
    const { token, user } = await loginRequest(email, password);

    set(() => ({
      user: {
        ...user,
        role: 'facilitator',
      },
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

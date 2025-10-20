export type UserRole = 'facilitator' | 'explorer' | 'listener';

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: User;
}

import type { ParticipantRole } from './session';

export type UserRole = ParticipantRole;

export interface User {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  role?: UserRole;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  email?: string;
  displayName?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

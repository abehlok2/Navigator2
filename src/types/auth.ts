import type { ParticipantRole } from './session';

export type UserRole = ParticipantRole;

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role?: UserRole;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  displayName?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

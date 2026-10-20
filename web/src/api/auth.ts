import { apiGet, apiPost } from './http';

export type Me = {
  id: string;
  email: string;
  role: 'member' | 'organizer' | 'moderator';
  accountStatus: 'active' | 'suspended';
  profileStatus: 'pending' | 'approved' | 'blocked';
  displayName: string;
};

export type RegisterInput = { email: string; password: string; displayName: string };
export type LoginInput = { email: string; password: string };

export const register = (input: RegisterInput) => apiPost<Me>('/auth/register', input);
export const login = (input: LoginInput) => apiPost<Me>('/auth/login', input);
export const logout = () => apiPost<void>('/auth/logout');
export const fetchMe = () => apiGet<Me>('/me');
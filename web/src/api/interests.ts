import { apiGet } from './http';

export type Interest = { id: number; slug: string; label: string };

export function fetchInterests(): Promise<Interest[]> {
  return apiGet<Interest[]>('/interests');
}

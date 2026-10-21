import { apiGet } from './http';

export type CityResult = {
  cityName: string;
  postalCodes: string[];
  departmentCode: string;
  cityCode: string;
};

export const searchCities = (query: string) =>
  apiGet<CityResult[]>(`/cities?q=${encodeURIComponent(query)}`);

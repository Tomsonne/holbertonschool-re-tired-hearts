import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/app.exception';

export type CityResult = {
  cityName: string;
  postalCodes: string[];
  departmentCode: string;
  cityCode: string;
};

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 100;
const TIMEOUT_MS = 3000;

function parseCities(value: unknown): CityResult[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error('Invalid city list');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('Invalid city');
    const city = item as Record<string, unknown>;
    if (
      typeof city.nom !== 'string' || city.nom.trim().length === 0 || city.nom.length > 100 ||
      typeof city.code !== 'string' || !/^[0-9][0-9AB][0-9]{3}$/.test(city.code) ||
      typeof city.codeDepartement !== 'string' || !/^(?:[0-9]{2}|2[AB]|97[1-6])$/.test(city.codeDepartement) ||
      !Array.isArray(city.codesPostaux) || city.codesPostaux.length === 0 ||
      !city.codesPostaux.every((code: unknown) => typeof code === 'string' && /^[0-9]{5}$/.test(code))
    ) throw new Error('Invalid city fields');
    return {
      cityName: city.nom,
      postalCodes: city.codesPostaux,
      departmentCode: city.codeDepartement,
      cityCode: city.code,
    };
  });
}

@Injectable()
export class CitiesService {
  private readonly cache = new Map<string, { expiresAt: number; cities: CityResult[] }>();

  async search(query: string): Promise<CityResult[]> {
    const key = query.trim().toLocaleLowerCase('fr');
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.cities;
    }
    this.cache.delete(key);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('City lookup timeout'));
      }, TIMEOUT_MS);
    });
    try {
      const url = new URL('https://geo.api.gouv.fr/communes');
      url.searchParams.set('nom', query.trim());
      url.searchParams.set('fields', 'nom,code,codeDepartement,codesPostaux');
      url.searchParams.set('limit', '8');
      const cities = await Promise.race([
        (async () => {
          const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('City provider error');
          return parseCities(await response.json());
        })(),
        timeout,
      ]);
      this.cache.set(key, { expiresAt: Date.now() + TTL_MS, cities });
      if (this.cache.size > MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
      return cities;
    } catch {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'CITY_LOOKUP_UNAVAILABLE',
        'La recherche de communes est indisponible. Saisissez votre ville manuellement.');
    } finally {
      clearTimeout(timer);
    }
  }
}

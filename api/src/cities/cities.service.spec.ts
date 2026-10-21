import { CitiesService } from './cities.service';

const providerCity = {
  nom: 'Lyon', code: '69123', codeDepartement: '69', codesPostaux: ['69001', '69002'],
};

describe('CitiesService', () => {
  const originalFetch = global.fetch;
  let service: CitiesService;

  beforeEach(() => {
    service = new CitiesService();
    jest.useFakeTimers();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('renvoie les champs du contrat et met la recherche en cache', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => [providerCity] });
    global.fetch = fetchMock as unknown as typeof fetch;
    const expected = [{ cityName: 'Lyon', cityCode: '69123', departmentCode: '69', postalCodes: ['69001', '69002'] }];
    await expect(service.search('Lyo')).resolves.toEqual(expected);
    await expect(service.search(' lyo ')).resolves.toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('limit=8');
  });

  it.each([
    { query: 'Seilhac', providerResponse: [
      { nom: 'Seilhac', code: '19255', codeDepartement: '19', codesPostaux: ['19700'] },
    ], expected: { cityName: 'Seilhac', cityCode: '19255', departmentCode: '19', postalCodes: ['19700'] } },
    { query: 'Tulle', providerResponse: [
      { nom: 'Tulle', code: '19272', codeDepartement: '19', codesPostaux: ['19000'] },
      { nom: 'Sainte-Tulle', code: '04197', codeDepartement: '04', codesPostaux: ['04220'] },
    ], expected: { cityName: 'Tulle', cityCode: '19272', departmentCode: '19', postalCodes: ['19000'] } },
  ])('transforme la réponse simulée pour $query', async ({ query, providerResponse, expected }) => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => providerResponse });
    global.fetch = fetchMock as unknown as typeof fetch;
    const cities = await service.search(query);
    expect(cities[0]).toEqual(expected);
    if (query === 'Tulle') expect(cities[1]).toMatchObject({ cityName: 'Sainte-Tulle', departmentCode: '04' });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('nom')).toBe(query);
    expect(url.searchParams.get('fields')).toBe('nom,code,codeDepartement,codesPostaux');
    expect(url.searchParams.get('limit')).toBe('8');
  });

  it('rejette une réponse invalide sans la cacher', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ ...providerCity, codesPostaux: ['invalide'] }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [providerCity] });
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(service.search('Lyo')).rejects.toMatchObject({ response: { code: 'CITY_LOOKUP_UNAVAILABLE' } });
    await expect(service.search('Lyo')).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('convertit une panne du fournisseur en 503', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(service.search('Lyo')).rejects.toMatchObject({ status: 503, response: { code: 'CITY_LOOKUP_UNAVAILABLE' } });
  });

  it('interrompt effectivement la requête après trois secondes', async () => {
    let aborted = false;
    global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      (options as RequestInit).signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      });
    })) as unknown as typeof fetch;
    const promise = service.search('Lyo');
    const expectation = expect(promise).rejects.toMatchObject({ status: 503 });
    await jest.advanceTimersByTimeAsync(3000);
    await expectation;
    expect(aborted).toBe(true);
  });
});

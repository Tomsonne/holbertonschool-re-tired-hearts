import { HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('masque les détails internes des erreurs inattendues', () => {
    const body = filter.toBody(new Error('relation "users" does not exist at /app/src/x.ts:12'));

    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Une erreur est survenue de notre côté. Merci de réessayer plus tard.',
    });
    expect(JSON.stringify(body)).not.toMatch(/users|x\.ts/);
  });

  it('conserve le code et le message des erreurs métier', () => {
    const body = filter.toBody(
      new AppException(HttpStatus.CONFLICT, 'EVENT_FULL', 'Cette sortie est complète.'),
    );

    expect(body).toEqual({
      statusCode: 409,
      code: 'EVENT_FULL',
      message: 'Cette sortie est complète.',
    });
  });

  it('remplace les messages techniques du framework par un message lisible', () => {
    const body = filter.toBody(new NotFoundException('Cannot GET /api/secret'));

    expect(body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: "Nous n'avons pas trouvé ce que vous cherchiez.",
    });
  });
});

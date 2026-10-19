import { HttpStatus, ValidationError } from '@nestjs/common';
import { AppException, FieldError } from './app.exception';

function aplatir(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const propre = error.constraints ? [{ field, messages: Object.values(error.constraints) }] : [];
    return [...propre, ...aplatir(error.children ?? [], field)];
  });
}

// Utilisé par le ValidationPipe global : une entrée par champ invalide, y compris les champs
// inconnus tels que « role », rejetés par forbidNonWhitelisted (R-ROLE-1).
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'Certaines informations sont manquantes ou invalides.',
    aplatir(errors),
  );
}

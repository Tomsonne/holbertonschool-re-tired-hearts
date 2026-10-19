import { HttpException, HttpStatus } from '@nestjs/common';

export type FieldError = { field: string; messages: string[] };

export type ErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details?: FieldError[];
};

// Erreur métier avec un code stable et un message rédigé pour l'utilisateur.
// Exemple : throw new AppException(HttpStatus.CONFLICT, 'EVENT_FULL', 'Cette sortie est complète.');
export class AppException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: FieldError[]) {
    super({ statusCode: status, code, message, ...(details ? { details } : {}) }, status);
  }
}

// Code et message par défaut pour chaque statut HTTP (docs/contrats-api.md).
export const DEFAULT_ERRORS: Record<number, { code: string; message: string }> = {
  400: { code: 'VALIDATION_FAILED', message: 'Certaines informations sont manquantes ou invalides.' },
  401: { code: 'UNAUTHENTICATED', message: 'Merci de vous connecter pour continuer.' },
  403: { code: 'FORBIDDEN', message: "Vous n'avez pas l'autorisation d'effectuer cette action." },
  404: { code: 'NOT_FOUND', message: "Nous n'avons pas trouvé ce que vous cherchiez." },
  409: { code: 'CONFLICT', message: "Cette action n'est pas possible pour le moment." },
  429: { code: 'TOO_MANY_REQUESTS', message: 'Trop de tentatives. Merci de patienter quelques minutes.' },
  500: { code: 'INTERNAL_ERROR', message: 'Une erreur est survenue de notre côté. Merci de réessayer plus tard.' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'Le service est momentanément indisponible. Merci de réessayer plus tard.' },
};

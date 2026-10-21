import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AppException, DEFAULT_ERRORS, ErrorBody } from './app.exception';

// Donne à toutes les erreurs le format documenté (docs/contrats-api.md).
// Une erreur inattendue est journalisée côté serveur et renvoyée en 500 générique :
// aucune trace, aucun détail SQL ni interne n'atteint le client.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      return { statusCode: 500, ...DEFAULT_ERRORS[500] };
    }

    const statusCode = exception.getStatus();
    const parDefaut = DEFAULT_ERRORS[statusCode] ?? DEFAULT_ERRORS[statusCode >= 500 ? 500 : 400];
    const payload = exception.getResponse();

    if (
      exception instanceof AppException &&
      statusCode < 500 &&
      typeof payload === 'object' &&
      payload !== null
    ) {
      const { code, message, details } = payload as Partial<ErrorBody>;
      return {
        statusCode,
        code: code ?? parDefaut.code,
        message: typeof message === 'string' ? message : parDefaut.message,
        ...(details ? { details } : {}),
      };
    }

    // Exceptions natives de Nest : leur message est technique (« Cannot GET /api/x »),
    // on renvoie donc le message par défaut, rédigé pour l'utilisateur.
    if (statusCode >= 500) {
      this.logger.error(exception.stack);
    }
    return { statusCode, ...parDefaut };
  }
}

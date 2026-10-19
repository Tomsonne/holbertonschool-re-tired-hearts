import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { validationExceptionFactory } from './common/validation';

// Configuration globale partagée par main.ts et les tests bout en bout,
// pour que les tests passent par la même chaîne que la production.
export function configureApp(
  app: INestApplication,
  options: { swagger: boolean; trustProxyHops?: number },
): void {
  // Derrière un reverse proxy, sans cela toutes les requêtes partagent l'IP du proxy
  // et la limitation de débit les compte ensemble.
  if (options.trustProxyHops) {
    app.getHttpAdapter().getInstance().set('trust proxy', options.trustProxyHops);
  }
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // R-ROLE-1 : un champ inconnu comme « role » fait échouer la requête en 400.
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (options.swagger) {
    const config = new DocumentBuilder()
      .setTitle('API Re-Tired Hearts')
      .setDescription('Routes implémentées. Le contrat complet du MVP est dans docs/contrats-api.md.')
      .setVersion('0.1.0')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
}

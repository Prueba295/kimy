import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import compression from 'compression';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Intentar cargar .env desde varias posibles ubicaciones
if (process.env.REDIS_HOST !== 'redis') {
  const possiblePaths = [
    path.join(process.cwd(), '../../.env'), // Si CWD es apps/api
    path.join(process.cwd(), '.env'),       // Si CWD es la raíz del proyecto
    path.join(__dirname, '../../../.env')   // Relativo al archivo compilado (dist/main.js)
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      console.log(`Cargando variables de entorno desde: ${envPath}`);
      dotenv.config({ path: envPath });
      break;
    }
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Compresión gzip/brotli
  app.use(compression());

  // Prefijo global de API
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:19006', // Expo web
      process.env.FRONTEND_URL || '',
      process.env.FRONTEND_URL2 || '',
    ].filter(Boolean),
    credentials: true,
  });

  // Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('KIMY API')
    .setDescription('Sistema de Revisión Inteligente de Tesis — API REST')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Autenticación y gestión de sesiones')
    .addTag('users', 'Gestión de usuarios')
    .addTag('templates', 'Documentos patrón institucionales')
    .addTag('advances', 'Avances de tesis')
    .addTag('ai-analysis', 'Análisis de IA')
    .addTag('reviews', 'Revisiones humanas')
    .addTag('fine-tuning', 'Fine-tuning con feedback humano')
    .addTag('plagiarism', 'Detección de plagio')
    .addTag('references', 'Validación de citas con CrossRef')
    .addTag('orcid', 'Integración ORCID')
    .addTag('reports', 'Reportes y exportación PDF')
    .addTag('dashboard', 'Dashboard y KPIs')
    .addTag('notifications', 'Notificaciones')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`\n🚀 KIMY API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs\n`);
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});

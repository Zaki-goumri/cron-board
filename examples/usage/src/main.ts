import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(3000);
  console.log('Application running on http://localhost:3000');
  console.log('CronBoard dashboard at http://localhost:3000/cronboard');
}

void bootstrap();

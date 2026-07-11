import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: [
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/schedule',
    '@nestjs/serve-static',
    '@nestjs/websockets',
    '@nestjs/platform-socket.io',
    'cron',
    'socket.io',
    'reflect-metadata',
    'rxjs',
    'cronboard-api',
    'cronboard-ui',
  ],
});

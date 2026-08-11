/**
 * API entry point.
 */

import { loadEnv } from '@ubuntu-ntu/config';
import { buildApp } from './app.js';
import { createDb } from './db.js';
import { loadDotEnv } from './env.js';

loadDotEnv();

const env = loadEnv(process.env);
const { db, close } = createDb(env.UBUNTU_NTU_DATABASE_URL);
const app = await buildApp({ db, env });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await close();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: env.PORT, host: env.HOST });

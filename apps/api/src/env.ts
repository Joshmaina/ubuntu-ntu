/**
 * Minimal .env loader for local development.
 *
 * Existing environment variables always win, so CI and container environments
 * behave as expected. Deliberately reads no bare DATABASE_URL — see
 * @ubuntu-ntu/config for why that name is avoided entirely.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadDotEnv(): void {
  // apps/api/src -> repo root
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const path = join(root, '.env');
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    process.env[key] = value.replace(/^["']|["']$/g, '');
  }
}

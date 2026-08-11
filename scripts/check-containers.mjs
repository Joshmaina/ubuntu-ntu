#!/usr/bin/env node
/**
 * Verifies the local Docker stack is healthy before migrations or API tests.
 * Required by the project brief §3D.
 *
 * Exits non-zero if any container is missing or not yet healthy, so it can be
 * used as a gate in scripts rather than something a human has to eyeball.
 */

import { execFileSync } from 'node:child_process';

const REQUIRED = ['ubuntuntu_postgres', 'ubuntuntu_redis', 'ubuntuntu_storage'];

function inspect(name, format) {
  try {
    return execFileSync('docker', ['inspect', '--format', format, name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

let allHealthy = true;
const rows = [];

for (const name of REQUIRED) {
  const running = inspect(name, '{{.State.Running}}');

  if (running === null) {
    rows.push([name, 'MISSING', 'run: pnpm docker:up']);
    allHealthy = false;
    continue;
  }

  // Containers without a healthcheck report no Health object at all.
  const health = inspect(name, '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}');
  const ok = running === 'true' && (health === 'healthy' || health === 'none');

  rows.push([name, running === 'true' ? `running/${health}` : 'stopped', ok ? 'OK' : 'NOT READY']);
  if (!ok) allHealthy = false;
}

const width = Math.max(...rows.map((r) => r[0].length));
for (const [name, state, note] of rows) {
  console.log(`  ${name.padEnd(width)}  ${state.padEnd(18)}  ${note}`);
}

if (!allHealthy) {
  console.error('\n✗ Docker stack is not ready.');
  process.exit(1);
}

console.log('\n✓ All containers healthy.');

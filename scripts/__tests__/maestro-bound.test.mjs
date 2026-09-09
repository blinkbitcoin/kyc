import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Drives scripts/e2e/maestro-bound.sh the way android-maestro.sh and
// ios-maestro.sh do: source it, call bounded_maestro. A fake `npm` on PATH
// stands in for the Maestro suite, so the bound itself (a bash background job
// polled against a deadline, because coreutils `timeout` is not on the macOS
// runners) is what gets exercised.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAESTRO_BOUND_SH = join(REPO_ROOT, 'scripts/e2e/maestro-bound.sh');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function fakeNpm(body) {
  const dir = mkdtempSync(join(tmpdir(), 'maestro-bound-'));
  tempDirs.push(dir);
  const npm = join(dir, 'npm');
  writeFileSync(npm, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(npm, 0o755);
  return dir;
}

function run(script, { binDir, env = {} } = {}) {
  return spawnSync('bash', ['-c', `. "${MAESTRO_BOUND_SH}"; ${script}`], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // Poll every second so the happy paths return promptly
      MAESTRO_POLL_SECONDS: '1',
      ...env,
      PATH: binDir ? `${binDir}:${process.env.PATH}` : process.env.PATH,
    },
  });
}

describe('scripts/e2e/maestro-bound.sh', () => {
  it('reads "10m", "90s" and bare seconds as seconds', () => {
    const { stdout } = run(
      'timeout_seconds 10m; timeout_seconds 90s; timeout_seconds 600',
    );
    expect(stdout.trim().split('\n')).toEqual(['600', '90', '600']);
  });

  it('runs the suite through npm and passes its exit status through', () => {
    const binDir = fakeNpm('echo "npm $*"; exit 3');
    const { status, stdout } = run('bounded_maestro test:e2e -- --flag', {
      binDir,
    });
    expect(stdout).toContain('npm run test:e2e -- --flag');
    expect(status).toBe(3);
  });

  it('returns 0 when the suite passes', () => {
    const binDir = fakeNpm('exit 0');
    expect(run('bounded_maestro test:e2e', { binDir }).status).toBe(0);
  });

  it('stops a suite that outlives MAESTRO_SUITE_TIMEOUT and returns 124', () => {
    // exec: the TERM must reach the sleeper itself, or its pipe keeps us waiting
    const binDir = fakeNpm('exec sleep 120');
    const { status, stdout } = run('bounded_maestro test:e2e', {
      binDir,
      env: {
        MAESTRO_SUITE_TIMEOUT: '1s',
        MAESTRO_KILL_GRACE_SECONDS: '1',
      },
    });
    expect(status).toBe(124);
    expect(stdout).toContain('::error::Maestro suite exceeded 1s');
  }, 20000);
});

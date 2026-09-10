import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Drives scripts/e2e/sumsub-env.sh (writes the service's .env for a live
// run) and the entry gate of scripts/e2e/live.sh (which refuses to run
// without credentials) against temp files, never the real .env.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SUMSUB_ENV_SH = join(REPO_ROOT, 'scripts/e2e/sumsub-env.sh');
const LIVE_SH = join(REPO_ROOT, 'scripts/e2e/live.sh');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'live-scripts-'));
  tempDirs.push(dir);
  return dir;
}

// A clean environment: the developer's own SUMSUB_* must never leak in
function run(script, env = {}) {
  const base = { PATH: process.env.PATH, HOME: process.env.HOME };
  return spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { ...base, ...env },
  });
}

const CREDENTIALS = {
  APP_TOKEN: 'sbx:app-token',
  SECRET_KEY: 'secret-key',
  WEBHOOK_SECRET: 'webhook-secret',
};

describe('scripts/e2e/sumsub-env.sh', () => {
  it('refuses to write without the three secrets', () => {
    const out = join(tempDir(), '.env');
    const { status, stderr } = run(SUMSUB_ENV_SH, { OUT: out, APP_TOKEN: 'x' });
    expect(status).not.toBe(0);
    expect(stderr).toContain('the app-token secret key');
  });

  it('writes a live .env with the defaults, mode 600', () => {
    const out = join(tempDir(), '.env');
    const { status, stdout } = run(SUMSUB_ENV_SH, { OUT: out, ...CREDENTIALS });
    expect(status).toBe(0);
    expect(stdout).toContain(`wrote ${out} (level basic-kyc-level)`);
    const lines = readFileSync(out, 'utf8').split('\n');
    expect(lines).toEqual(
      expect.arrayContaining([
        'PORT=5000',
        'ALLOW_INSECURE_DEV=true',
        'KYC_PROVIDER=sumsub',
        'SUMSUB_APP_TOKEN=sbx:app-token',
        'SUMSUB_SECRET_KEY=secret-key',
        'SUMSUB_WEBHOOK_SECRET=webhook-secret',
        'SUMSUB_WEBHOOK_DIGEST_ALG=HMAC_SHA256_HEX',
        'SUMSUB_LEVEL_NAME=basic-kyc-level',
        'SUMSUB_BASE_URL=https://api.sumsub.com',
        'PUBLIC_BASE_URL=http://localhost:5000',
      ]),
    );
    expect(lines.some(line => line.startsWith('JWT_SECRET='))).toBe(false);
    expect(statSync(out).mode & 0o777).toBe(0o600);
  });

  it('takes the level, the public base URL, the digest algorithm and a JWT secret', () => {
    const out = join(tempDir(), '.env');
    run(SUMSUB_ENV_SH, {
      OUT: out,
      ...CREDENTIALS,
      LEVEL_NAME: 'blink-level',
      PUBLIC_BASE_URL: 'https://kyc.example.com',
      WEBHOOK_DIGEST_ALG: 'HMAC_SHA512_HEX',
      JWT_SECRET: 'hs256',
    });
    const text = readFileSync(out, 'utf8');
    expect(text).toContain('SUMSUB_LEVEL_NAME=blink-level\n');
    expect(text).toContain('PUBLIC_BASE_URL=https://kyc.example.com\n');
    expect(text).toContain('SUMSUB_WEBHOOK_DIGEST_ALG=HMAC_SHA512_HEX\n');
    expect(text).toContain('JWT_SECRET=hs256\n');
  });

  it('refuses to overwrite an existing .env unless FORCE=1', () => {
    const out = join(tempDir(), '.env');
    writeFileSync(out, 'KEEP=me\n');
    const refused = run(SUMSUB_ENV_SH, { OUT: out, ...CREDENTIALS });
    expect(refused.status).not.toBe(0);
    expect(refused.stdout).toContain('set FORCE=1 to overwrite');
    expect(readFileSync(out, 'utf8')).toBe('KEEP=me\n');

    const forced = run(SUMSUB_ENV_SH, { OUT: out, ...CREDENTIALS, FORCE: '1' });
    expect(forced.status).toBe(0);
    expect(readFileSync(out, 'utf8')).not.toContain('KEEP=me');
  });
});

describe('scripts/e2e/live.sh', () => {
  it('refuses to run with neither a live .env nor SUMSUB_* in the environment', () => {
    const { status, stdout } = run(LIVE_SH, {
      LIVE_ENV_FILE: join(tempDir(), 'absent.env'),
    });
    expect(status).not.toBe(0);
    expect(stdout).toContain('no ');
    expect(stdout).toContain(
      '(make sumsub-env) and no SUMSUB_* in the environment',
    );
  });

  it('needs the secret key and the webhook secret next to the app token', () => {
    const { status, stderr } = run(LIVE_SH, {
      LIVE_ENV_FILE: join(tempDir(), 'absent.env'),
      SUMSUB_APP_TOKEN: 'x',
    });
    expect(status).not.toBe(0);
    expect(stderr).toContain('SUMSUB_SECRET_KEY');
  });
});

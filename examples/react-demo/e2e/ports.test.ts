// The env-driven port scheme the Playwright configs rely on.

import { describe, expect, it } from 'vitest';

import {
  API_ORIGIN,
  backendServer,
  baseURL,
  ciPolicy,
  DEFAULT_PORTS,
  MODES,
  PORTS,
  portFrom,
  portsFrom,
  vitePreviewServer,
} from './ports';

describe('portFrom', () => {
  it('uses the default when the variable is unset or empty', () => {
    expect(portFrom('X', undefined, 5000)).toBe(5000);
    expect(portFrom('X', '', 5000)).toBe(5000);
  });

  it('reads a real port number', () => {
    expect(portFrom('X', '5010', 5000)).toBe(5010);
    expect(portFrom('X', '65535', 5000)).toBe(65535);
  });

  it.each(['0', '65536', '-1', '1.5', 'abc', ' '])('rejects %j', value => {
    expect(() => portFrom('KYC_API_PORT', value, 5000)).toThrow(
      /KYC_API_PORT must be a port number/,
    );
  });
});

describe('portsFrom', () => {
  it('defaults to the kyc range 5000-5002', () => {
    expect(portsFrom({})).toEqual(DEFAULT_PORTS);
    expect(DEFAULT_PORTS).toEqual({
      api: 5000,
      web: { hosted: 5001, proxy: 5002 },
    });
  });

  it('moves each service with its own variable', () => {
    expect(
      portsFrom({
        KYC_API_PORT: '5010',
        KYC_WEB_PORT: '5011',
        KYC_WEB_PROXY_PORT: '5012',
      }),
    ).toEqual({ api: 5010, web: { hosted: 5011, proxy: 5012 } });
    expect(portsFrom({ KYC_WEB_PORT: '5011' }).api).toBe(5000);
  });
});

describe('this process', () => {
  it('derives the origins from the resolved ports', () => {
    expect(PORTS).toEqual(portsFrom(process.env));
    expect(API_ORIGIN).toBe(`http://localhost:${PORTS.api}`);
    for (const mode of MODES) {
      expect(baseURL(mode)).toBe(`http://localhost:${PORTS.web[mode]}`);
    }
  });
});

describe('ciPolicy', () => {
  it('adopts a running server and never retries locally', () => {
    expect(ciPolicy({})).toEqual({ reuseExistingServer: true, retries: 0 });
  });

  it('always starts its own server and retries once in CI', () => {
    expect(ciPolicy({ CI: 'true' })).toEqual({
      reuseExistingServer: false,
      retries: 1,
    });
  });
});

describe('webServer entries', () => {
  it('starts the backend on its port, minting URLs on it, with both demo origins allowed', () => {
    const backend = backendServer();
    expect(backend.command).toContain(`PORT=${PORTS.api}`);
    expect(backend.command).toContain(`PUBLIC_BASE_URL=${API_ORIGIN}`);
    expect(backend.command).toContain(
      `CORS_ALLOWED_ORIGINS=http://localhost:${PORTS.web.hosted},http://localhost:${PORTS.web.proxy}`,
    );
    expect(backend.command).toContain('KYC_PROVIDER=mock');
    expect(backend.cwd).toBe('../..');
    expect(backend.url).toBe(`${API_ORIGIN}/health`);
  });

  it('builds and previews each mode on its own port against that backend', () => {
    for (const mode of MODES) {
      const server = vitePreviewServer(mode);
      expect(server.command).toContain(`VITE_API_ORIGIN=${API_ORIGIN}`);
      expect(server.command).toContain(`VITE_KYC_MODE=${mode}`);
      expect(server.command).toContain(`--outDir dist/${mode}`);
      expect(server.command).toContain(
        `--port ${PORTS.web[mode]} --strictPort`,
      );
      expect(server.url).toBe(baseURL(mode));
    }
  });
});

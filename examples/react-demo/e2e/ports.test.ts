// The per-worktree port scheme the Playwright configs rely on.

import { describe, expect, it } from 'vitest';

import {
  API_ORIGIN,
  backendServer,
  baseURL,
  BLOCKS,
  blockFor,
  ciPolicy,
  fnv1a,
  MODES,
  PORTS,
  portsForBlock,
  vitePreviewServer,
  WORKTREE_ROOT,
} from './ports';

describe('fnv1a', () => {
  it('is deterministic and spreads sibling worktree paths apart', () => {
    expect(fnv1a('/Users/x/Dev/kyc')).toBe(fnv1a('/Users/x/Dev/kyc'));
    expect(fnv1a('/Users/x/Dev/kyc')).not.toBe(fnv1a('/Users/x/Dev/kyc-2'));
    expect(fnv1a('')).toBe(0x811c9dc5);
  });
});

describe('blockFor', () => {
  it('derives a block inside the range from the worktree path', () => {
    for (const root of [
      '/a',
      '/Users/x/Dev/kyc',
      '/home/runner/work/kyc/kyc',
    ]) {
      const block = blockFor(root);
      expect(block).toBeGreaterThanOrEqual(0);
      expect(block).toBeLessThan(BLOCKS);
      expect(block).toBe(blockFor(root));
    }
  });

  it('is pinned by E2E_PORT_OFFSET when set, and derived when it is empty', () => {
    expect(blockFor('/anything', '0')).toBe(0);
    expect(blockFor('/anything', String(BLOCKS - 1))).toBe(BLOCKS - 1);
    expect(blockFor('/anything', '')).toBe(blockFor('/anything'));
  });

  it.each(['-1', String(BLOCKS), '1.5', 'abc', ' '])(
    'rejects the out-of-range or malformed pin %j',
    pin => {
      expect(() => blockFor('/anything', pin)).toThrow(
        /E2E_PORT_OFFSET must be an integer/,
      );
    },
  );
});

describe('portsForBlock', () => {
  it('block 0 is the canonical port set the docs quote', () => {
    expect(portsForBlock(0)).toEqual({
      api: 4000,
      vite: { hosted: 5173, proxy: 5174 },
    });
  });

  it('the backend and Vite ranges never overlap across every block', () => {
    for (let block = 0; block < BLOCKS; block += 1) {
      const ports = portsForBlock(block);
      const vite = Object.values(ports.vite);
      expect(vite).toHaveLength(MODES.length);
      expect(new Set(vite).size).toBe(MODES.length);
      expect(ports.api).toBeLessThan(5173);
      for (const port of vite) {
        expect(port).toBeGreaterThanOrEqual(5173);
        expect(port).toBeLessThan(65536);
      }
    }
  });
});

describe('this worktree', () => {
  it('resolves to the repo root and a block-shaped port set', () => {
    expect(WORKTREE_ROOT.endsWith('/')).toBe(false);
    expect(WORKTREE_ROOT.endsWith('/examples/react-demo')).toBe(false);
    expect(PORTS).toEqual(
      portsForBlock(blockFor(WORKTREE_ROOT, process.env.E2E_PORT_OFFSET)),
    );
    expect(API_ORIGIN).toBe(`http://localhost:${PORTS.api}`);
    expect(baseURL('hosted')).toBe(`http://localhost:${PORTS.vite.hosted}`);
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
  it('starts the backend on the block port with both demo origins allowed', () => {
    const backend = backendServer();
    expect(backend.command).toContain(`PORT=${PORTS.api}`);
    expect(backend.command).toContain(
      `CORS_ALLOWED_ORIGINS=http://localhost:${PORTS.vite.hosted},http://localhost:${PORTS.vite.proxy}`,
    );
    expect(backend.command).toContain('KYC_PROVIDER=mock');
    expect(backend.cwd).toBe('../..');
    expect(backend.url).toBe(`${API_ORIGIN}/health`);
  });

  it('builds and previews each mode on its own port against the block backend', () => {
    for (const mode of MODES) {
      const server = vitePreviewServer(mode);
      expect(server.command).toContain(`VITE_API_ORIGIN=${API_ORIGIN}`);
      expect(server.command).toContain(`VITE_KYC_MODE=${mode}`);
      expect(server.command).toContain(`--outDir dist/${mode}`);
      expect(server.command).toContain(
        `--port ${PORTS.vite[mode]} --strictPort`,
      );
      expect(server.url).toBe(baseURL(mode));
    }
  });
});

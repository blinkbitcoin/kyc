// The service's port: PORT wins, else the repo's base port + offset 0.

import { PORT_BASE_DEFAULT, PORT_OFFSET, resolvePort } from '../src/port';

describe('resolvePort', () => {
  it('defaults to the repo base port (offset 0)', () => {
    expect(PORT_OFFSET).toBe(0);
    expect(resolvePort({})).toBe(PORT_BASE_DEFAULT);
    expect(resolvePort({})).toBe(5100);
  });

  it('moves with KYC_PORT_BASE', () => {
    expect(resolvePort({ KYC_PORT_BASE: '5300' })).toBe(5300);
  });

  it('takes PORT over the base', () => {
    expect(resolvePort({ PORT: '5010', KYC_PORT_BASE: '5300' })).toBe(5010);
  });

  it('ignores empty or malformed values', () => {
    expect(resolvePort({ PORT: '', KYC_PORT_BASE: 'abc' })).toBe(5100);
    expect(resolvePort({ PORT: '5x' })).toBe(5100);
  });

  it('reads process.env by default', () => {
    const before = process.env.PORT;
    process.env.PORT = '5567';
    try {
      expect(resolvePort()).toBe(5567);
    } finally {
      if (before === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = before;
      }
    }
  });
});

import { API_OFFSET, PORT_BASE_DEFAULT, serviceOrigin } from '../port';

describe('serviceOrigin', () => {
  it('defaults to the repo base port plus the service offset', () => {
    expect(serviceOrigin({})).toBe(
      `http://localhost:${PORT_BASE_DEFAULT + API_OFFSET}`,
    );
  });

  it('moves with KYC_PORT_BASE - one variable moves a whole worktree', () => {
    expect(serviceOrigin({ KYC_PORT_BASE: '5300' })).toBe(
      'http://localhost:5300',
    );
  });

  it.each([
    ['empty', ''],
    ['not a number', 'abc'],
    ['partly numeric', '53a0'],
    ['undefined', undefined],
  ])('falls back to the default when the base is %s', (_label, base) => {
    expect(serviceOrigin({ KYC_PORT_BASE: base })).toBe(
      `http://localhost:${PORT_BASE_DEFAULT + API_OFFSET}`,
    );
  });

  // PORT is the HOST's own port - a host embedding this package binds its
  // own (the access-token example is base + 3) while the hosted page and the
  // mock's callbacks are served by the service at base + 0. Reading PORT
  // here would point every minted URL at whichever host happened to mint it.
  it('ignores the host process PORT', () => {
    expect(serviceOrigin({ KYC_PORT_BASE: '5300', PORT: '5303' })).toBe(
      'http://localhost:5300',
    );
  });
});

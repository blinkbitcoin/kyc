import { bearerToken } from '../auth';

describe('bearerToken', () => {
  it('reads the token of a Bearer header', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('Bearer  padded ')).toBe('padded');
  });

  it.each([
    undefined,
    null,
    '',
    'Basic dXNlcjpwYXNz',
    'bearer x',
    'Bearer',
    'Bearer  ',
  ])('is null for %j', header => {
    expect(bearerToken(header)).toBeNull();
  });
});

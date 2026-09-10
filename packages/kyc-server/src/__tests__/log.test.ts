import { consoleLogger, sanitizeForLog } from '../log';

describe('sanitizeForLog', () => {
  it('passes through ordinary strings unchanged', () => {
    expect(sanitizeForLog('basic-kyc-level')).toBe('basic-kyc-level');
  });

  it('strips CR and LF (log-forging characters)', () => {
    expect(sanitizeForLog('ok\ninjected')).not.toContain('\n');
    expect(sanitizeForLog('ok\r\ninjected')).not.toContain('\r');
  });

  it('strips other C0 control characters and DEL', () => {
    // 'a' + NUL + 'b' + US(0x1f) + DEL(0x7f) + 'c'
    const input =
      'a' +
      String.fromCharCode(0x00) +
      'b' +
      String.fromCharCode(0x1f) +
      String.fromCharCode(0x7f) +
      'c';
    expect(sanitizeForLog(input)).toBe('a�b��c');
  });

  it('coerces non-string values to string', () => {
    expect(sanitizeForLog(42)).toBe('42');
    expect(sanitizeForLog(undefined)).toBe('undefined');
    expect(sanitizeForLog(null)).toBe('null');
  });
});

describe('consoleLogger', () => {
  it('is late-bound to console, so spies installed later are honoured', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogger.log('l', 1);
    consoleLogger.warn('w');
    consoleLogger.error('e', { x: 1 });
    expect(log).toHaveBeenCalledWith('l', 1);
    expect(warn).toHaveBeenCalledWith('w');
    expect(error).toHaveBeenCalledWith('e', { x: 1 });
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});

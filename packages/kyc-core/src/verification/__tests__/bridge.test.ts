import {
  BRIDGE_ERROR_CODE,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SOURCE,
  createBridgeMessage,
  createSetTokenMessage,
  createSetTokenScript,
  interpretBridgeMessage,
} from '../bridge';

const envelope = (type: string, payload?: Record<string, unknown>) => ({
  source: BRIDGE_SOURCE,
  v: BRIDGE_PROTOCOL_VERSION,
  type,
  ...(payload ? { payload } : {}),
});

describe('protocol constants', () => {
  it('pins the source discriminator and the version', () => {
    expect(BRIDGE_SOURCE).toBe('kyc-bridge');
    expect(BRIDGE_PROTOCOL_VERSION).toBe(1);
    expect(BRIDGE_ERROR_CODE).toBe('BRIDGE_PROTOCOL');
  });
});

describe('interpretBridgeMessage - envelope filtering', () => {
  it('ignores messages from another source (e.g. the provider SDK)', () => {
    expect(
      interpretBridgeMessage({ source: 'sumsub', v: 1, type: 'submitted' }),
    ).toBeNull();
  });

  it('ignores an unsupported protocol version', () => {
    expect(
      interpretBridgeMessage({
        source: BRIDGE_SOURCE,
        v: 2,
        type: 'submitted',
      }),
    ).toBeNull();
  });

  it('ignores non-objects and unparseable strings', () => {
    expect(interpretBridgeMessage(null)).toBeNull();
    expect(interpretBridgeMessage(42)).toBeNull();
    expect(interpretBridgeMessage('not json')).toBeNull();
    expect(interpretBridgeMessage('"a string"')).toBeNull();
  });

  it('parses a JSON string payload (react-native-webview onMessage)', () => {
    expect(
      interpretBridgeMessage(JSON.stringify(envelope('submitted'))),
    ).toEqual({
      type: 'submitted',
    });
  });

  it('ignores an unknown event type', () => {
    expect(interpretBridgeMessage(envelope('somethingElse'))).toBeNull();
  });
});

describe('interpretBridgeMessage - events', () => {
  it('maps applicantLoaded with its applicant id', () => {
    expect(
      interpretBridgeMessage(
        envelope('applicantLoaded', { applicantId: 'a-1' }),
      ),
    ).toEqual({ type: 'applicantLoaded', applicantId: 'a-1' });
  });

  it('drops applicantLoaded without an applicant id', () => {
    expect(interpretBridgeMessage(envelope('applicantLoaded'))).toBeNull();
    expect(
      interpretBridgeMessage(envelope('applicantLoaded', { applicantId: 7 })),
    ).toBeNull();
  });

  it('maps statusChanged for a known status only', () => {
    expect(
      interpretBridgeMessage(envelope('statusChanged', { status: 'pending' })),
    ).toEqual({ type: 'statusChanged', status: 'pending' });
    expect(
      interpretBridgeMessage(envelope('statusChanged', { status: 'nonsense' })),
    ).toBeNull();
  });

  it('maps complete with and without an applicant id', () => {
    expect(
      interpretBridgeMessage(
        envelope('complete', { status: 'approved', applicantId: 'a-1' }),
      ),
    ).toEqual({ type: 'complete', status: 'approved', applicantId: 'a-1' });
    expect(
      interpretBridgeMessage(envelope('complete', { status: 'declined' })),
    ).toEqual({
      type: 'complete',
      status: 'declined',
    });
  });

  it('drops complete without a valid status', () => {
    expect(interpretBridgeMessage(envelope('complete'))).toBeNull();
  });

  it.each(['submitted', 'cancel', 'tokenExpired', 'sessionExpired'] as const)(
    'maps the payload-free event %s',
    type => {
      expect(interpretBridgeMessage(envelope(type))).toEqual({ type });
    },
  );

  it('maps error with the page code and message', () => {
    expect(
      interpretBridgeMessage(
        envelope('error', { code: 'PERMISSION_DENIED', message: 'no camera' }),
      ),
    ).toEqual({
      type: 'error',
      code: 'PERMISSION_DENIED',
      message: 'no camera',
    });
  });

  it('falls back to the protocol code when the page sends no code', () => {
    expect(interpretBridgeMessage(envelope('error'))).toEqual({
      type: 'error',
      code: BRIDGE_ERROR_CODE,
      message: undefined,
    });
  });

  it('ignores a non-object payload', () => {
    expect(
      interpretBridgeMessage({
        source: BRIDGE_SOURCE,
        v: BRIDGE_PROTOCOL_VERSION,
        type: 'complete',
        payload: 'oops',
      }),
    ).toBeNull();
  });
});

describe('page -> app builders', () => {
  it('builds an event envelope with and without a payload', () => {
    expect(createBridgeMessage('submitted')).toEqual({
      source: BRIDGE_SOURCE,
      v: BRIDGE_PROTOCOL_VERSION,
      type: 'submitted',
    });
    expect(createBridgeMessage('statusChanged', { status: 'pending' })).toEqual(
      {
        source: BRIDGE_SOURCE,
        v: BRIDGE_PROTOCOL_VERSION,
        type: 'statusChanged',
        payload: { status: 'pending' },
      },
    );
  });

  it('round-trips through interpretBridgeMessage', () => {
    expect(
      interpretBridgeMessage(
        JSON.stringify(createBridgeMessage('complete', { status: 'approved' })),
      ),
    ).toEqual({ type: 'complete', status: 'approved' });
  });
});

describe('app -> page token refresh', () => {
  it('builds the setToken message', () => {
    expect(createSetTokenMessage('t-1')).toEqual({
      source: BRIDGE_SOURCE,
      v: BRIDGE_PROTOCOL_VERSION,
      type: 'setToken',
      token: 't-1',
    });
  });

  it('setToken is not an event - interpret ignores it', () => {
    expect(interpretBridgeMessage(createSetTokenMessage('t-1'))).toBeNull();
  });

  it('builds an injectable script that calls setToken with the bare token, not the envelope', () => {
    const script = createSetTokenScript('t-1');
    expect(script).toContain('window.__kycBridge');
    expect(script).toContain('window.__kycBridge.setToken("t-1")');
    expect(script).not.toContain('kyc-bridge');
    expect(script.trim().endsWith('true;')).toBe(true);
  });

  it('guards against a page that has not defined __kycBridge yet', () => {
    expect(createSetTokenScript('t-1')).toMatch(
      /^window\.__kycBridge && window\.__kycBridge\.setToken/,
    );
  });

  it('quotes a token that would otherwise break out of the script', () => {
    expect(createSetTokenScript('a"b\\c')).toContain(JSON.stringify('a"b\\c'));
  });

  it('escapes characters unsafe inside an HTML <script> tag or a JS string literal', () => {
    const script = createSetTokenScript('</script><b>&  ');
    expect(script).not.toContain('</script>');
    expect(script).not.toContain(' ');
    expect(script).not.toContain(' ');
    expect(script).toContain('\\u003c');
    expect(script).toContain('\\u2028');
    expect(script).toContain('\\u2029');
  });
});

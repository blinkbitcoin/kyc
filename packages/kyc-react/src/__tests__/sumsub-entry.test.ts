// The ./sumsub subpath is the provider-scoped surface: core's Sumsub mapping
// plus the component, the hook and the mountable seam - the same objects the
// root exports, reached through one import. Its entry file only names the
// provider directory.

import * as fs from 'fs';
import * as path from 'path';

import * as core from '@blinkbitcoin/kyc-core/sumsub';
import * as root from '../index';
import * as sumsub from '../sumsub';

describe('@blinkbitcoin/kyc-react/sumsub', () => {
  it('exports the Sumsub mapping, the neutral layer and the component', () => {
    expect(sumsub.mapSumsubStatus).toBe(core.mapSumsubStatus);
    expect(sumsub.interpretSumsubWebMessage).toBe(
      core.interpretSumsubWebMessage,
    );
    expect(sumsub.sumsubSession).toBe(core.sumsubSession);
    expect(sumsub.createHostedSource).toBe(root.createHostedSource);
    expect(sumsub.Verification).toBe(root.Verification);
    expect(sumsub.useVerification).toBe(root.useVerification);
    expect(sumsub.isMountable).toBe(root.isMountable);
    expect(sumsub).not.toHaveProperty('createProxySource');
  });

  it('src/sumsub.ts is a one-line re-export of providers/sumsub/entry', () => {
    const statements = fs
      .readFileSync(path.resolve(__dirname, '../sumsub.ts'), 'utf8')
      .replace(/\/\/.*$/gm, '')
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    expect(statements).toEqual(["export * from './providers/sumsub/entry'"]);
  });
});

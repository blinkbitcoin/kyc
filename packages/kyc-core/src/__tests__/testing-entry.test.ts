/**
 * Guard: the ./testing entry must stay Apollo-free (Maestro/Playwright hosts
 * install it without the Apollo peers) - and must actually export the fake.
 */

import * as path from 'path';

import { collectImportGraph } from './hosted-entry.test';
import { createFakeLaunchableSource } from '../testing';

const SRC = path.resolve(__dirname, '..');

describe('testing entry', () => {
  it('exports the fake launchable source factory', () => {
    expect(typeof createFakeLaunchableSource).toBe('function');
  });

  it('never reaches a file that imports @apollo/* or graphql', () => {
    const { files, externals } = collectImportGraph(
      path.join(SRC, 'testing.ts'),
      '@blinkbitcoin/kyc-core',
      SRC,
    );

    expect(files.length).toBeGreaterThan(2);
    const offenders = externals.filter(
      spec =>
        spec.startsWith('@apollo/') ||
        spec === 'graphql' ||
        spec.startsWith('graphql/'),
    );
    expect(offenders).toEqual([]);
  });
});

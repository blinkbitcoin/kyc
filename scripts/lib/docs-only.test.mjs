import { describe, expect, it } from 'vitest';
import { diffRange, isDocFile, isDocsOnly } from './docs-only.mjs';

// The table IS the rule. A path that should stop the pipeline after Checks
// belongs on the left; anything that feeds the build belongs on the right.
const DOCS = [
  'docs/index.md',
  'docs/operations/live-e2e-ci.md',
  'docs/diagrams/README.md',
  // Deliberate: the diagram-freshness check lives in Code, which always runs
  'docs/diagrams/src/verification.mmd',
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE',
  'packages/kyc-core/LICENSE',
  'packages/kyc-node/LICENSE',
  'packages/kyc-react-native/LICENSE',
  'packages/kyc-react/LICENSE',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
];

const NOT_DOCS = [
  '.github/workflows/ci.yml',
  '.github/workflows/checks.yml',
  '.github/workflows/codeql.yml',
  '.github/codeql/codeql-config.yml',
  'scripts/ci/changed-class.mjs',
  'scripts/lib/docs-only.mjs',
  'package.json',
  'package-lock.json',
  'Makefile',
  'packages/kyc-core/src/index.ts',
  'packages/kyc-service/src/app.ts',
  'examples/react-demo/src/main.tsx',
  'LICENSE.ts',
  'packages/licenses/check.ts',
];

describe('isDocFile', () => {
  it.each(DOCS)('treats %s as documentation', path => {
    expect(isDocFile(path)).toBe(true);
  });

  it.each(NOT_DOCS)('treats %s as code', path => {
    expect(isDocFile(path)).toBe(false);
  });
});

describe('isDocsOnly', () => {
  it('is true when every changed file is documentation', () => {
    expect(isDocsOnly(DOCS)).toBe(true);
  });

  // The change this was written for: a copyright line in every LICENSE.
  // Four of the five are per-package, which `^LICENSE$` could not see.
  it('is true for a copyright change across the per-package LICENSEs', () => {
    expect(
      isDocsOnly([
        'LICENSE',
        'packages/kyc-core/LICENSE',
        'packages/kyc-node/LICENSE',
        'packages/kyc-react-native/LICENSE',
        'packages/kyc-react/LICENSE',
      ]),
    ).toBe(true);
  });

  it('is false when one changed file is not documentation', () => {
    expect(isDocsOnly(['README.md', 'packages/kyc-core/src/index.ts'])).toBe(
      false,
    );
  });

  it('is false for an empty change - nothing learned means run everything', () => {
    expect(isDocsOnly([])).toBe(false);
  });
});

describe('diffRange', () => {
  it('diffs a PR against its base with a three-dot range', () => {
    expect(diffRange('pull_request', { baseSha: 'abc123' })).toBe(
      'abc123...HEAD',
    );
  });

  it('diffs a push against the commit it replaced', () => {
    expect(diffRange('push', { before: 'def456' })).toBe('def456..HEAD');
  });

  it.each([
    ['release', {}],
    ['workflow_dispatch', {}],
    [undefined, {}],
  ])('cannot classify %s - everything runs', (event, shas) => {
    expect(diffRange(event, shas)).toBeNull();
  });

  it('cannot classify a PR without a base sha', () => {
    expect(diffRange('pull_request', {})).toBeNull();
    expect(diffRange('pull_request', { baseSha: '' })).toBeNull();
  });

  it('cannot classify the first push of a branch (all-zero base)', () => {
    expect(diffRange('push', { before: '0'.repeat(40) })).toBeNull();
    expect(diffRange('push', {})).toBeNull();
  });

  it('defaults the shas so a bare event name never throws', () => {
    expect(diffRange('push')).toBeNull();
  });
});

// Assembles docs/diagrams/README.md from the per-diagram sources in
// docs/diagrams/src/*.mmd. The .mmd files are canonical (editable /
// individually renderable); the combined page embeds the pre-rendered
// docs/diagrams/dist/*.svg (rendered by `make diagrams` via mermaid-cli) so
// it loads instantly on GitHub instead of booting a mermaid iframe.
// Run `make diagrams` after editing a source. CI fails on drift (see
// test.yml); a missing SVG fails the assembly here.
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'diagrams',
);

const SECTIONS = [
  {
    file: 'system-architecture.mmd',
    title: 'System Architecture',
    outro:
      'Mode 1 runs the provider SDK in-process (the host supplies the access\n' +
      'token); mode 2 embeds a page speaking the `kyc-bridge` protocol; mode 3\n' +
      'adds the proxy GraphQL session on `apps/api`. Only `createProxySource`\n' +
      'loads Apollo - the `/hosted` entries never reach it.',
  },
  {
    file: 'data-flow-proxy.mmd',
    title: 'Data Flow Diagram (proxy mode)',
    outro:
      'Modes 1 and 2 stop after the token: only the proxy mode persists a\n' +
      '`VerificationSession` row and lets webhooks move its status.',
  },
  {
    file: 'verification-flow.mmd',
    title: 'Verification Flow Process',
    outro:
      'One machine, both platforms (`packages/kyc-core/src/verification/machine.ts`).\n' +
      '`offline` and `permissionDenied` deliberately do not fire `onError` - they\n' +
      'are recoverable states with their own screen.',
  },
  {
    file: 'database-erd.mmd',
    title: 'Database ERD',
    outro:
      '`approved` and `finallyRejected` are terminal and can never be downgraded\n' +
      'by a late or replayed webhook. `declined` is not terminal - a RETRY\n' +
      'rejection lets the applicant resubmit.',
  },
  {
    file: 'component-hierarchy.mmd',
    title: 'Component Hierarchy',
    outro:
      'The host app writes `config.ts` -> `apollo.ts` -> `source.ts` and renders\n' +
      'one component. Which embedding primitive appears is decided by the source:\n' +
      '`isLaunchable` wins over `isMountable`, which wins over embedding a url.',
  },
  {
    file: 'webhook-flow.mmd',
    title: 'Webhook Flow',
    outro:
      'The route 404s unless the path segment is both a known provider and the\n' +
      'configured one, so a mock payload can never drive a Sumsub deployment.',
  },
  {
    file: 'graphql-request-flow.mmd',
    title: 'GraphQL Request Flow',
    outro:
      'The row is written before the provider is called, so a provider outage\n' +
      'still leaves an auditable `creation_failed` trail.',
  },
  {
    file: 'hosted-bridge-flow.mmd',
    title: 'Hosted Bridge Flow',
    outro:
      'Page -> app always carries the full `kyc-bridge` envelope. App -> page has\n' +
      'two transports: `createSetTokenScript` (bare token, injected by\n' +
      'react-native-webview) and `createSetTokenMessage` (full envelope, posted\n' +
      'to the pinned origin by the web package).',
  },
  {
    file: 'ci-pipeline.mmd',
    title: 'CI / Release Pipeline',
    outro:
      'Every workflow file owns one event source. GitHub draws one graph per run,\n' +
      'so this is the only place the cross-workflow edges (release-please\n' +
      'dispatching `ci.yml` at the tag, the retry on a green main run, the\n' +
      'gh-pages badge branch) are visible together. Details:\n' +
      '[development-guide.md](../development-guide.md#cicd),\n' +
      '[releasing.md](../releasing.md).',
  },
];

const blocks = SECTIONS.map(({ file, title, outro }) => {
  const svg = `dist/${file.replace(/\.mmd$/, '')}.svg`;
  if (!existsSync(join(here, svg))) {
    console.error(`missing ${svg} - run \`make diagrams\` to render it`);
    process.exit(1);
  }
  return `## ${title}\n\n[![${title}](${svg})](src/${file})\n${outro ? `\n${outro}\n` : ''}`;
});

const out = `<!-- GENERATED FILE - do not edit. Sources: src/*.mmd; run \`make diagrams\`. -->

# Diagrams

Pre-rendered SVGs for instant loading; click a diagram to open its editable
Mermaid source in [src/](src/) (which renders natively on GitHub, in VS Code,
and in Obsidian). Regenerate with \`make diagrams\`.

---

${blocks.join('\n---\n\n')}`;

writeFileSync(join(here, 'README.md'), `${out.trim()}\n`);
console.log(
  `assembled docs/diagrams/README.md from ${SECTIONS.length} sources`,
);

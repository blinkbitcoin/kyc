import type { CodegenConfig } from '@graphql-codegen/cli';

// Generates the runtime ErrorCode enum (the wire contract) from the backend's
// emitted schema artifact (apps/api/schema.graphql). Run via `npm run codegen`
// (root) after schema changes; the parity test fails if this output drifts.
// Operation types join here once the session operations exist.
const config: CodegenConfig = {
  schema: '../../apps/api/schema.graphql',
  generates: {
    'src/generated/error-code.ts': {
      plugins: ['typescript'],
      config: { onlyEnums: true },
    },
  },
};

export default config;

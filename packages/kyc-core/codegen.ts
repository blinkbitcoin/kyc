import type { CodegenConfig } from '@graphql-codegen/cli';

// Generates the client types from the backend's emitted schema artifact
// (apps/api/schema.graphql). Run via `npm run codegen` (root) after schema
// changes; the parity test fails if the ErrorCode output drifts.
//
// - src/generated/graphql.ts: the operation result and variable types for
//   src/operations.ts, plus the schema Enum/Input types those operations
//   reference (VerificationPlatform, VerificationSessionStartInput,
//   VerificationStatus). Enums are emitted as string unions (`enumsAsTypes`)
//   so the generated VerificationStatus is literally the same union as the
//   hand-written one in src/verification/types.ts.
//   Plugin note: `typescript-operations` alone (no `typescript` plugin) is
//   deliberate here, not the two-plugin combo from the plugin's own docs -
//   `typescript-operations`'s visitor unconditionally re-declares every
//   Enum/Input type an operation touches (see its EnumTypeDefinition /
//   InputObjectTypeDefinition), so adding `typescript` to this same output
//   produces a second, conflicting declaration of the same name (TS2300)
//   for every one of them. The installed graphql-codegen only avoids that
//   via `importSchemaTypesFrom` + a second file, which we don't need: this
//   package only re-exports the three Enum/Input types operations.ts
//   consumes, and typescript-operations emits exactly those on its own.
// - src/generated/error-code.ts: the runtime ErrorCode enum (wire contract).
//   `onlyEnums` also makes this plugin emit the schema's other two enums,
//   VerificationPlatform and VerificationStatus, into this same file - they
//   are NOT part of this package's public API (only ErrorCode is exported
//   from here); the string-union versions consumers actually see live in
//   generated/graphql.ts (via `enumsAsTypes` above).
const config: CodegenConfig = {
  schema: '../../apps/api/schema.graphql',
  documents: ['src/operations.ts'],
  generates: {
    'src/generated/graphql.ts': {
      plugins: ['typescript-operations'],
      config: {
        enumsAsTypes: true,
        skipTypename: true,
      },
    },
    'src/generated/error-code.ts': {
      plugins: ['typescript'],
      config: { onlyEnums: true },
    },
  },
};

export default config;

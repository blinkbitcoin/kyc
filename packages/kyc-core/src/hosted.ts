// Apollo-free entry (hosted mode): the contract types and guards, the
// kyc-bridge protocol, the hosted source, the error codes and their
// messages - everything a host embedding a hosted verification page needs,
// without @apollo/client or graphql.
//
// src/__tests__/hosted-entry.test.ts walks this module's import graph and
// fails if anything here ever reaches Apollo.

export * from './verification';

export {
  ErrorCodes,
  ClientErrorCodes,
  isKnownErrorCode,
  isClientErrorCode,
} from './errors';
export type {
  AnyErrorCodeValue,
  ClientErrorCodeValue,
  ErrorCodeValue,
} from './errors';
export { ErrorCode } from './generated/error-code';

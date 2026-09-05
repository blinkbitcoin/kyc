// Apollo-free entry (hosted mode): everything a host embedding a hosted
// verification page needs, without @apollo/client or graphql.
export * from './verification';
export { ErrorCodes, isKnownErrorCode } from './errors';
export type { ErrorCodeValue } from './errors';
export { ErrorCode } from './generated/error-code';

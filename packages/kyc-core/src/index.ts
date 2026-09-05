// @blinkbitcoin/kyc-core - platform-agnostic core shared by the RN and web
// verification packages. Bootstrap surface: the VerificationSource contract
// + capability guards and the ErrorCode wire contract. The proxy source and
// the Apollo client factory join here in the core phase; ./hosted stays
// Apollo-free by construction.

export * from './verification';
export { ErrorCodes, isKnownErrorCode } from './errors';
export type { ErrorCodeValue } from './errors';
export { ErrorCode } from './generated/error-code';

// Coded errors come from the package; they carry `extensions.code`, which
// graphql-js copies onto the GraphQL error the client sees.

export type { ErrorCode } from '@blinkbitcoin/kyc-node';
export { createError, ErrorCodes, Errors, getErrorCode, KycError } from '@blinkbitcoin/kyc-node';

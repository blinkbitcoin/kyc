export enum ErrorCode {
  PersistenceFailed = 'PERSISTENCE_FAILED',
  ProviderUnavailable = 'PROVIDER_UNAVAILABLE',
  SessionCreationFailed = 'SESSION_CREATION_FAILED',
  SessionNotFound = 'SESSION_NOT_FOUND',
  Unauthorized = 'UNAUTHORIZED',
  ValidationError = 'VALIDATION_ERROR'
}

export enum VerificationPlatform {
  Android = 'ANDROID',
  Ios = 'IOS',
  Web = 'WEB'
}

export enum VerificationStatus {
  Approved = 'approved',
  Declined = 'declined',
  FinallyRejected = 'finallyRejected',
  Incomplete = 'incomplete',
  Initial = 'initial',
  Pending = 'pending'
}

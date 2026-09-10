/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type VerificationPlatform =
  | 'ANDROID'
  | 'IOS'
  | 'WEB';

export type VerificationSessionStartInput = {
  levelName?: string | null | undefined;
  locale?: string | null | undefined;
  platform: VerificationPlatform;
};

export type VerificationStatus =
  | 'approved'
  | 'declined'
  | 'finallyRejected'
  | 'incomplete'
  | 'initial'
  | 'pending';

export type VerificationSessionStartMutationVariables = Exact<{
  input: VerificationSessionStartInput;
}>;


export type VerificationSessionStartMutation = { verificationSessionStart: { sessionId: string, provider: string, status: VerificationStatus, accessToken: string | null, url: string | null, allowedOrigin: string | null, applicantId: string | null } };

export type VerificationSessionRefreshMutationVariables = Exact<{
  sessionId: string | number;
}>;


export type VerificationSessionRefreshMutation = { verificationSessionRefresh: { accessToken: string } };

export type GetVerificationSessionQueryVariables = Exact<{
  id: string | number;
}>;


export type GetVerificationSessionQuery = { verificationSession: { sessionId: string, provider: string, status: VerificationStatus, applicantId: string | null } };

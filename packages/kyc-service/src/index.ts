// @blinkbitcoin/kyc-service - the deployable, as a library.
//
// The root entry is the Fetch core and the pieces a host may want to reuse
// or inspect. It is runtime-neutral: importing it pulls in no Node server, no
// Postgres driver and no GraphQL executor. The targets are the subpath
// entries - ./node (a container or any Node process), ./vercel, ./cloudflare.

export type { KycApp, KycAppDeps } from './app';
export { createKycApp } from './app';
export type { Capability } from './capabilities';
export { capabilitiesFromEnv, describeCapabilities, hasSessions } from './capabilities';
export type { Runtime, ValidateConfigOptions } from './config';
export { configErrors, getAllowedOrigins, validateConfig } from './config';
export type { Env } from './env';
export { isInsecureDevAllowed } from './env';
export { getPublicBaseUrl, getPublicOrigin } from './publicUrl';
export type { SessionSource, SessionVerifier } from './session';
export { sessionSourceFromEnv, sessionVerifierFromEnv } from './session';

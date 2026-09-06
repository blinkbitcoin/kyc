// @blinkbitcoin/kyc-sumsub/web - RESERVED SUBPATH, v1 placeholder.
//
// v1 deliberately ships no @sumsub/websdk adapter (spec YAGNI cut): the
// Sumsub web SDK is itself an iframe, so the hosted page served by apps/api
// already covers the web, and `MountableSource` has no second implementer to
// justify the peer dependency.
//
// The follow-up lands here without a breaking change: createSumsubWebSource
// implementing kyc-react's MountableSource over
// snsWebSdk.init(token, expirationHandler)...launch(container), with the
// message handler wired to interpretSumsubWebMessage below.
//
// Until then this entry exports the message vocabulary, so a host that
// mounts the web SDK itself can normalize its events today.

export * from './mapping';
export * from './types';
export { SUMSUB_PROVIDER, sumsubSession } from './provider';

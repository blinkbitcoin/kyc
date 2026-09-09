// The ./sumsub entry's surface (src/sumsub.ts re-exports this file), Apollo-free.
//
// The Sumsub provider (providers/sumsub: the mapping, the vocabulary, the
// session tagger) plus the neutral hosted layer it is built on (the contract
// types and guards, the kyc-bridge protocol, the state machine, the error
// codes) - so a Sumsub host needs one import. Nothing reachable from this
// file imports '@apollo/client' or 'graphql'; enforced by the sumsub-entry
// guard test and by scripts/pack-smoke.sh.

export * from './index';
export * from '../../hosted';

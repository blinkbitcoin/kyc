# Upgrading

What changes for you between kyc releases, by audience. Entries are listed
newest first; each names the pull request that made the change.

## Package rename: `kyc-server` → `kyc-node`

`@blinkbitcoin/kyc-server` (`packages/kyc-server/`) is renamed
`@blinkbitcoin/kyc-node` (`packages/kyc-node/`), matching the platform naming
of `kyc-react` / `kyc-react-native` and the sibling `esign-node`. No aliases -
update every import from `@blinkbitcoin/kyc-server` (and its `/express`,
`/knex`, `/sumsub` subpaths) to `@blinkbitcoin/kyc-node`. The registry scope
in `.npmrc` (`@blinkbitcoin:registry=...`) is unchanged. The commitlint scope
`server` is renamed `node` in the same change.

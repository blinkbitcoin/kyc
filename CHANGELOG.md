# Changelog

## [0.1.0](https://github.com/blinkbitcoin/kyc/compare/v0.0.1...v0.1.0) (2026-09-15)


### ⚠ BREAKING CHANGES

* **node:** a custom VerificationProvider that implements getStatusByUserId now returns UserStatusLookup, not VerificationStatus.
* **service:** createApp() is replaced by createKycApp(env, deps) and startServer(env); the container command is `node dist/node.js` and migrations are `node dist/node.js migrate`; KYC_ENV=production replaces NODE_ENV=production as the production switch; validateSecurityConfig() is validateConfig(env, { runtime }).
* **node:** @blinkbitcoin/kyc-server is now @blinkbitcoin/kyc-node (packages/kyc-node). Update every import, including the /express, /knex and /sumsub subpaths.

### Features

* **core:** createSessionTokenProvider - the native SDK over one session ([#24](https://github.com/blinkbitcoin/kyc/issues/24)) ([5204511](https://github.com/blinkbitcoin/kyc/commit/52045115d31667f079eb39692653355c0e7c57e3))
* **demo:** serverless-handler-demo, the Fetch handlers behind one route ([#13](https://github.com/blinkbitcoin/kyc/issues/13)) ([afd6a43](https://github.com/blinkbitcoin/kyc/commit/afd6a438388c6e05235c63384e1627708479e8d3))
* identity verification v1 - the packages, the reference service, the demos and the docs ([#1](https://github.com/blinkbitcoin/kyc/issues/1)) ([fcab11f](https://github.com/blinkbitcoin/kyc/commit/fcab11f887c9dc159af931034368563686ab5d16))
* **node:** effects.onStatusTransition, the host's policy on the single write path ([#18](https://github.com/blinkbitcoin/kyc/issues/18)) ([d18286f](https://github.com/blinkbitcoin/kyc/commit/d18286f7b2328a6944b985270a2da8900c95419d))
* **node:** one applicant, many sessions ([#20](https://github.com/blinkbitcoin/kyc/issues/20)) ([7d3bae5](https://github.com/blinkbitcoin/kyc/commit/7d3bae5f31549244adfb0756423853c120fa893d))
* **node:** production guard, boot checks and the access-token presets ([#10](https://github.com/blinkbitcoin/kyc/issues/10)) ([12cbbe6](https://github.com/blinkbitcoin/kyc/commit/12cbbe6b3199b4a32393244632e1aaa980f70cf4))
* **node:** rename kyc-server to kyc-node and promote the service package ([#9](https://github.com/blinkbitcoin/kyc/issues/9)) ([58524b7](https://github.com/blinkbitcoin/kyc/commit/58524b73207d4682b16046c4fa7542b600f5ee80))
* **node:** the level and the decline reasons ride along the webhook event ([#19](https://github.com/blinkbitcoin/kyc/issues/19)) ([c622712](https://github.com/blinkbitcoin/kyc/commit/c6227121f80dafe1d031fd378e8f9c18696c61a9))
* **node:** the Sumsub share token, and the mint through the SDK endpoint ([#23](https://github.com/blinkbitcoin/kyc/issues/23)) ([4caf80d](https://github.com/blinkbitcoin/kyc/commit/4caf80d177afdce78d3a276d3faf81a42f8a64b3))
* **node:** the user lookup names the applicant, and the hosted page lives where the host says ([#22](https://github.com/blinkbitcoin/kyc/issues/22)) ([6d7c3a5](https://github.com/blinkbitcoin/kyc/commit/6d7c3a5250400f0d0dec3e1b8f2095bdbc6f2ec4))
* **node:** where the user stands - latestForUser and Query.myVerification ([#21](https://github.com/blinkbitcoin/kyc/issues/21)) ([87d784a](https://github.com/blinkbitcoin/kyc/commit/87d784a4140a381cd2c0b102b1939f9eb5638fbd))
* **service:** one deployable for tokens and sessions, capability by env, any target ([#11](https://github.com/blinkbitcoin/kyc/issues/11)) ([187e0cd](https://github.com/blinkbitcoin/kyc/commit/187e0cd132e7eb2e4d2e9c0dc5f0bcfccc881335))


### Bug Fixes

* **e2e:** derive the enhanced tier's level for the live smoke ([#30](https://github.com/blinkbitcoin/kyc/issues/30)) ([5eb1ef3](https://github.com/blinkbitcoin/kyc/commit/5eb1ef32106784af6a70f7c6ac74bd9de7a38322))
* **node:** derive the mock's public origin from KYC_PORT_BASE ([#29](https://github.com/blinkbitcoin/kyc/issues/29)) ([478b474](https://github.com/blinkbitcoin/kyc/commit/478b474deef7e24fcb46863c2c2cd84602d168da))

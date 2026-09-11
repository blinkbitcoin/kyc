// One in-memory session store per test file. The mocked `createStore`
// returns this exact instance for every env it is handed, so a suite can
// seed it directly and read back what a request wrote - while the module
// under test still goes through the injected factory rather than a
// module-level singleton.

import { createMemorySessionStore } from '@blinkbitcoin/kyc-node';

export const memoryStore = createMemorySessionStore();

// How a Node target reaches the sessions module.
//
// It lives on its own so that only an entry which can actually serve
// sessions imports it: this is the one place in the package that names
// ./sessions, and a bundler following an import of this module would pull
// in Apollo and `pg`. The Cloudflare entry must never reach it - the
// import-graph guard in the tests fails if it ever does.

import type { LoadSessions } from './sessions';

export const loadSessions: LoadSessions = () => import('./sessions.js');

// A getAccessToken for the native SDK when the backend runs sessions.
//
// The native source's `getAccessToken` is called once to launch and again,
// by the SDK itself, whenever the token expires. Wired straight to a
// session-starting mutation, every expiry would open a NEW session row on
// the backend - and the webhook, binding to the user's newest unbound
// session, would bind the wrong one. This provider starts once and refreshes
// after: the host supplies the two calls its API already has.
//
// Apollo-free: part of the ./hosted entry. The host brings its own client.

/** What a session start hands back: the id to refresh by, and the first token. */
export interface SessionTokenStart {
  sessionId: string;
  accessToken: string;
}

export interface SessionTokenProviderOptions {
  /** Start a session (verificationSessionStart, or your own mutation). */
  start: () => Promise<SessionTokenStart>;
  /** A fresh token for an existing session (verificationSessionRefresh). */
  refresh: (sessionId: string) => Promise<string>;
}

export interface SessionTokenProvider {
  /**
   * The native source's `getAccessToken`: the first call starts the session,
   * every later call refreshes it. Concurrent first calls share one start.
   */
  getAccessToken: () => Promise<string>;
  /** The session the next call will refresh, or null before the first start. */
  readonly sessionId: string | null;
  /** Forget the session, so the next call starts a new one (a restart). */
  reset: () => void;
}

export const createSessionTokenProvider = (
  options: SessionTokenProviderOptions,
): SessionTokenProvider => {
  let sessionId: string | null = null;
  let starting: Promise<string> | null = null;

  const startOnce = (): Promise<string> => {
    if (!starting) {
      starting = options
        .start()
        .then(started => {
          sessionId = started.sessionId;
          return started.accessToken;
        })
        .finally(() => {
          starting = null;
        });
    }
    return starting;
  };

  return {
    getAccessToken: () =>
      sessionId ? options.refresh(sessionId) : startOnce(),
    get sessionId() {
      return sessionId;
    },
    reset() {
      sessionId = null;
    },
  };
};

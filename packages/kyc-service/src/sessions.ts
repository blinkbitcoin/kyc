// Sessions as Fetch handlers: the GraphQL API, the hosted page and the
// provider webhook.
//
// This module is the Node-only half of the service - it reaches the Knex
// store (and through it `pg`) and runs Apollo Server. Nothing imports it
// statically: `createKycApp` receives a `loadSessions` loader from the
// entry that can supply one (./node, ./vercel), and the Cloudflare entry
// supplies none, so no bundler can reach `pg` or `@apollo/server` from a
// Worker's entry point at all.

import { ApolloServer, HeaderMap, type HTTPGraphQLResponse } from '@apollo/server';
import {
  createHostedPageHandler,
  createWebhookHandler,
  type SessionStore,
} from '@blinkbitcoin/kyc-node';

import type { Env } from './env';
import type { VerificationProvider } from './providers/port';
import { forwardedClientIp } from './proxy';
import { createGraphQL } from './schema';
import { createServices } from './services';
import { createStore } from './store';
import { setActiveSpanAttributes } from './tracing';
import type { GraphQLContext } from './types';

// Apollo does not export the body union on its own
type HTTPGraphQLResponseBody = HTTPGraphQLResponse['body'];

// The three Fetch handlers the sessions capability adds, plus the shutdown
// the Node server drains through
export interface SessionCapability {
  webhook: (request: Request) => Promise<Response>;
  graphql: (request: Request) => Promise<Response>;
  hosted: (request: Request) => Promise<Response>;
  stop: () => Promise<void>;
}

export interface SessionCapabilityOptions {
  // The environment the app was constructed with - the store connects to
  // THIS env's DATABASE_URL, not to whatever process.env happens to hold
  env: Env;
  // The adapter the app resolved, and its registry name: the resolvers, the
  // page and the webhook run on the same one the token mint does
  provider: VerificationProvider;
  providerName: string;
  // The session verification the mint uses, applied to the GraphQL context
  authenticate: (request: Request) => Promise<string | null>;
  // Where the hosted page is reachable (the URL handed to clients)
  publicBaseUrl: () => string;
  // Apollo's schema discovery: on outside production, exactly as before
  introspection: boolean;
  // Believe x-forwarded-for when logging the webhook's caller (the same
  // TRUST_PROXY the rate limits key on)
  trustProxy: boolean;
  // The store to run on (default: a Knex store over `env`'s DATABASE_URL).
  // Tests hand in an in-memory one; nothing else overrides it.
  store?: SessionStore;
}

// What `createKycApp` is handed to reach this module without naming it
export interface SessionModule {
  createSessionCapability: (options: SessionCapabilityOptions) => Promise<SessionCapability>;
}

export type LoadSessions = () => Promise<SessionModule>;

// A Fetch Request as Apollo's transport-neutral HTTP request. Apollo parses
// the body itself for GET (persisted queries, the landing page) and expects
// the parsed JSON for POST.
const httpGraphQLRequestFrom = async (request: Request) => {
  const headers = new HeaderMap();
  request.headers.forEach((value, key) => headers.set(key, value));
  const url = new URL(request.url);
  const text = request.method === 'POST' ? await request.text() : '';
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Apollo answers 400 for a body it cannot use; handing it the raw text
      // keeps that decision (and its error shape) in one place
      body = text;
    }
  }
  return { method: request.method, headers, search: url.search, body };
};

// Apollo's answer as one string. This schema has no incremental delivery
// (@defer/@stream), so the complete body is what production ever sees; the
// chunked shape is part of Apollo's type and is concatenated rather than
// dropped.
export const graphQLResponseBody = async (body: HTTPGraphQLResponseBody): Promise<string> => {
  if (body.kind === 'complete') {
    return body.string;
  }
  let chunks = '';
  for await (const chunk of body.asyncIterator) {
    chunks += chunk;
  }
  return chunks;
};

// The provider a webhook path names: /webhook/kyc/<provider> (the app
// routes here on the prefix, so the last segment is the name)
const webhookProviderOf = (request: Request): string => {
  const { pathname } = new URL(request.url);
  return pathname.slice(pathname.lastIndexOf('/') + 1);
};

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const createSessionCapability = async (
  options: SessionCapabilityOptions
): Promise<SessionCapability> => {
  const sessions = createServices({
    provider: options.provider,
    providerName: options.providerName,
    store: options.store ?? createStore(options.env),
    publicBaseUrl: options.publicBaseUrl,
  });
  const { typeDefs, resolvers } = createGraphQL(sessions);

  const apollo = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    // Schema discovery is disabled in production; stack traces are never
    // returned to clients (typed Errors.* with codes instead).
    introspection: options.introspection,
    includeStacktraceInErrorResponses: false,
  });
  await apollo.start();

  const deliver = createWebhookHandler({
    provider: options.provider,
    sessions,
    clientIp: (request) => forwardedClientIp(request, options.trustProxy),
  });

  const hosted = createHostedPageHandler({ sessions, provider: options.provider });

  return {
    // Only the configured provider may deliver webhooks, so a mock payload
    // can never drive a Sumsub deployment
    webhook: async (request) =>
      webhookProviderOf(request) === options.providerName
        ? deliver(request)
        : json({ error: 'Unknown provider' }, 404),
    graphql: async (request) => {
      const response = await apollo.executeHTTPGraphQLRequest({
        httpGraphQLRequest: await httpGraphQLRequestFrom(request),
        context: async () => {
          const userId = await options.authenticate(request);
          if (userId) {
            // Attach the caller to the request's trace (auto-instrumented span)
            setActiveSpanAttributes({ 'enduser.id': userId });
          }
          return { userId };
        },
      });

      const headers = new Headers();
      for (const [key, value] of response.headers) {
        headers.set(key, value);
      }
      return new Response(await graphQLResponseBody(response.body), {
        status: response.status ?? 200,
        headers,
      });
    },
    hosted,
    stop: () => apollo.stop(),
  };
};

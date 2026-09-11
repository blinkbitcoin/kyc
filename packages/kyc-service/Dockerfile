# The kyc service as a container. Build from the REPO ROOT (the workspace
# lockfile and the Node package are inputs):
#
#   docker build -f packages/kyc-service/Dockerfile -t kyc-service .        (make docker-build)
#   docker run --rm -p 5100:5100 --env-file packages/kyc-service/.env kyc-service
#   docker run --rm --env-file packages/kyc-service/.env kyc-service node dist/node.js migrate
#
# One image, both capabilities: access tokens are always on, and DATABASE_URL
# adds session orchestration - the hosted page, the webhook, the GraphQL
# session API (the migrate command above applies its schema).
#
# Three stages: install everything → build the two workspaces the service
# needs → a production image with only their runtime dependencies.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
# npm ci needs every workspace manifest the lockfile knows about
COPY package.json package-lock.json ./
COPY packages/kyc-service/package.json packages/kyc-service/
COPY packages/kyc-core/package.json packages/kyc-core/
COPY packages/kyc-node/package.json packages/kyc-node/
COPY packages/kyc-react/package.json packages/kyc-react/
COPY packages/kyc-react-native/package.json packages/kyc-react-native/
COPY examples/react-demo/package.json examples/react-demo/
COPY examples/react-native-demo/package.json examples/react-native-demo/
COPY examples/access-token-demo/package.json examples/access-token-demo/
COPY examples/serverless-handler-demo/package.json examples/serverless-handler-demo/
COPY scripts/package.json scripts/
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM deps AS build
COPY packages/kyc-core packages/kyc-core
COPY packages/kyc-node packages/kyc-node
COPY packages/kyc-service packages/kyc-service
RUN npm run build -w packages/kyc-core && npm run build -w packages/kyc-node && npm run build -w packages/kyc-service

FROM node:${NODE_VERSION}-alpine AS runtime
# NODE_ENV is Node's own switch (dependency resolution, framework defaults).
# KYC_ENV is this service's: the image defaults to the production posture,
# so a container refuses the sandbox Sumsub token and the mock provider and
# keeps GraphQL introspection off. KYC_ALLOW_DEMO=true opts back out.
ENV NODE_ENV=production
ENV KYC_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/kyc-service/package.json packages/kyc-service/
COPY packages/kyc-core/package.json packages/kyc-core/
COPY packages/kyc-node/package.json packages/kyc-node/
COPY packages/kyc-react/package.json packages/kyc-react/
COPY packages/kyc-react-native/package.json packages/kyc-react-native/
COPY examples/react-demo/package.json examples/react-demo/
COPY examples/react-native-demo/package.json examples/react-native-demo/
COPY examples/access-token-demo/package.json examples/access-token-demo/
COPY examples/serverless-handler-demo/package.json examples/serverless-handler-demo/
COPY scripts/package.json scripts/
# Runtime dependencies of the service, the Node package and the core it
# pins only
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund -w packages/kyc-service -w packages/kyc-node -w packages/kyc-core \
  && npm cache clean --force
COPY --from=build /app/packages/kyc-core/dist packages/kyc-core/dist
COPY --from=build /app/packages/kyc-node/dist packages/kyc-node/dist
COPY --from=build /app/packages/kyc-service/dist packages/kyc-service/dist

USER node
WORKDIR /app/packages/kyc-service
EXPOSE 5100
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT:-5100}/health || exit 1
CMD ["node", "dist/node.js"]

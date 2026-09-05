<!-- GENERATED FILE - do not edit. Sources: src/*.mmd; run `make diagrams`. -->

# Diagrams

Pre-rendered SVGs for instant loading; click a diagram to open its editable
Mermaid source in [src/](src/) (which renders natively on GitHub, in VS Code,
and in Obsidian). Regenerate with `make diagrams`.

---

## System Architecture

[![System Architecture](dist/system-architecture.svg)](src/system-architecture.mmd)

Mode 1 runs the provider SDK in-process (host supplies the access token);
mode 2 embeds a hosted page speaking the `kyc-bridge` protocol; mode 3 adds
the proxy GraphQL session on `apps/api`. Only the proxy source loads Apollo.

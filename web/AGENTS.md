# AGENTS.md

## Regression Testing & E2E Guidelines

### Command
Run the multi-model regression suite with:

```bash
npm run e2e:all-models
```

### What `e2e:all-models` verifies
The script `scripts/e2e-all-models.mjs` performs a gateway-level end-to-end regression across all currently active model routes in the database.

It automatically:

1. Loads environment config from `.env`.
2. Reads all active routed model IDs from DB (`upstream_model_routes` joined with enabled `upstream_channels`).
3. Generates an internal valid `sk-ark-*` API key and seeds an active test user/key pair.
4. For each model, executes both request types against `/v1/chat/completions`:
   - `stream: false`
   - `stream: true`
5. Verifies full-chain behavior for every model:
   - API key auth path works.
   - DB key lookup/hash/decrypt path works.
   - Upstream forwarding returns expected status.
   - Stream mode has valid SSE completion (`[DONE]`).
   - `api_logs` entries are written.
   - User balance is deducted with non-zero charged usage.
6. Prints a terminal summary table:
   - `Model Name`
   - `HTTP Status`
   - `Stream Status`
   - `Balance Deducted`
   - `Result Pass/Fail`

### Development policy (mandatory)
You must run `npm run e2e:all-models` before sign-off whenever any of the following changes happen:

- Add/remove/modify channel mappings (Azure Foundry, Azure OpenAI, OpenAI, Anthropic, etc.).
- Modify gateway routing/adapters/protocol handling.
- Modify request/stream transformation behavior.
- Change DB schema or seed logic affecting routes, keys, billing, or usage logs.

Do not claim rollout readiness unless this regression suite passes for all active routed models.

## Architecture Note: Multi-Interface Adapter Support

The gateway must support protocol conversion for models that are not natively compatible with standard Chat Completions.

- Public contract remains `POST /v1/chat/completions`.
- Adapter layer may route specific upstream models (for example codex-class deployments) to provider-specific inference endpoints (for example Responses API).
- Adapter must normalize both non-stream and stream outputs back into chat-compatible response shapes for clients.
- Billing invariants remain unchanged: successful adapted calls must still generate `api_logs` and deduct user balance based on measured or fallback token usage.

This requirement applies to Azure Foundry/Azure OpenAI and any future provider where model capabilities differ by endpoint family.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

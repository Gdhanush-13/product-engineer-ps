# Submission — Offline Mobile Queue

## Selected problem
Problem 1: Offline Mobile Queue.

## Demo video
**Action required before submission:** add an accessible 3–5 minute demo video link here.

The demo should show:
1. Switch to Offline and create an incident.
2. Refresh/reopen the page and show the incident remains visible.
3. Switch to Online, synchronize, and show the synchronized state.
4. Switch to Server failing, create or retry an item, and show the failed state.
5. Restore Online and retry; show that the retry synchronizes without creating a duplicate server record.
6. Briefly explain the storage, queue, and idempotency decisions.

## Setup and run
No build tool or external service is required.

1. Download or clone this repository.
2. Open index.html in a modern browser.
3. Use the Network simulation control to switch among Online, Offline, and Online/server failing.
4. Open tests.html in the same browser to run the focused automated tests.

The prototype uses browser local storage for both the durable client queue and a deterministic mock server. This keeps the acceptance scenarios reproducible without credentials or paid services.

## Architecture and data flow
- QueueEngine owns queue state, persistence, synchronization transitions, and retry behavior.
- Each incident receives a stable client-generated clientId at creation time.
- Incidents are persisted before any synchronization attempt, so an offline creation is durable immediately.
- The UI renders the explicit states pending, syncing, synchronized, and failed.
- The mock server stores accepted records by clientId. A repeated delivery with the same ID returns the existing record instead of creating another one.
- The UI is intentionally thin: it sends commands to QueueEngine and renders the persisted state.

## Technology choices and trade-offs
This is a dependency-free HTML/CSS/JavaScript prototype. Local storage makes the durability behavior visible and easy to run in under ten minutes. A real mobile product would replace the adapter with SQLite/IndexedDB and replace the mock server with an authenticated API, but the queue contract and idempotency key would remain the same.

The prototype uses a small state machine instead of a general-purpose state library because the required states are few and explicit. The trade-off is that a production implementation would need stronger schema validation, migrations, and cross-tab coordination.

## Assumptions and limitations
- A browser refresh is the restart scenario; background synchronization after termination is intentionally out of scope.
- The network selector deterministically simulates offline and temporary server failure.
- The mock server is local to the browser and is not a production backend.
- The app assumes one browser profile; multi-device conflict resolution is not implemented.
- The server record is written before the local item is marked synchronized, and the stable client ID makes an uncertain retry safe.

## Production and scale considerations
- Use an IndexedDB-backed repository for larger queues and atomic transactions.
- Enforce a unique server-side constraint on tenant_id and client_id and make the sync endpoint idempotent.
- Add exponential backoff with jitter, a maximum retry policy, and a dead-letter/review state.
- Instrument queue depth, age of oldest pending item, sync latency, failure rate, and duplicate/idempotency hits.
- Encrypt sensitive incident data at rest, authenticate the API, and define retention/deletion behavior.
- For thousands of pending incidents, batch records with bounded concurrency and cursor-based draining rather than loading the entire queue at once.

## AI usage disclosure
OpenAI Codex was used to help plan the state model, draft the dependency-free prototype, and review the acceptance scenarios. The submitted design, code, tests, assumptions, and trade-offs remain the candidate's responsibility.

## Credibility note
**Action required before submission:** replace this section with a truthful example from your own experience.

- Product/system:
- Problem it solved:
- My contribution:
- Scale or operational complexity:
- Difficult engineering/product decision:
- Public evidence, if available:

## Important failure/recovery decisions
If the application closes during synchronization, the local record is already durable and remains in syncing or failed until the next explicit synchronization attempt. In production, startup reconciliation would convert stale syncing items to retryable pending items.

Duplicate prevention belongs in both places: the client uses a stable ID so retries refer to the same logical incident, while the server must enforce uniqueness because clients cannot be trusted to prevent duplicates alone.

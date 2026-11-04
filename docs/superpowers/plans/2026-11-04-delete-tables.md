# Admin table deletion implementation plan

**Goal:** Admins can remove a table after evicting its players, and remove the current tables using that same operation.

**Architecture:** Serialize REST mutations per table. Freeze the live table, wait for any completed hand settlement, cancel any unfinished hand, and refund human seat stacks atomically with table deletion. Notify watchers and release live state only after commit. Keep finished hand history and the chip ledger.

**Tech stack:** Shared Zod contracts, Fastify, MongoDB transactions, Expo SDK 57 and NativeWind.

## Tasks

- [x] Add failing table lifecycle tests: freezing prevents actions/deals and cancels a live hand without losing committed chips.
- [x] Add the shared deletion result and socket event, then implement freeze, transactional refunds/deletion, registry cleanup, and admin-only DELETE route. Serialize REST writes to avoid join/refund races.
- [x] Add the admin delete action with confirmation to the lobby, including private tables; handle deletion events and deleted-table reconnects on the client.
- [x] Run tests and typecheck. Exercise authorization, live-hand cancellation, refunds, failure rollback, concurrent deletion, socket eviction, and history preservation with isolated integration fixtures.
- [x] Back up current table documents, delete current tables through the admin API, and verify zero tables and healthy services.

## Constraints and review focus

Only admins may delete. Bots never receive wallet refunds. Refunds and ledger entries commit together with deletion; a retry must never duplicate credits. A completed hand must finish settlement before deletion; an unfinished hand returns pre-deal stacks. Existing history remains readable to its participants. No new dependencies or environment variables.

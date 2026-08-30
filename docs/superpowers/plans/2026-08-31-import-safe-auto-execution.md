# Safe Gmail Import Auto-execution Implementation Plan

1. Add policy and candidate tests, then implement strict environment gating and candidate derivation.
2. Add migration contract tests, then extend import operations for resumable account creation.
3. Add Whooing account client and account creation service tests, then implement explicit approved account creation, mirror refresh, and mapping.
4. Add Gmail runtime tests, then integrate safe transaction and exact benefit execution into the poll response.
5. Add UI/status tests, then expose operating mode, execution summaries, and approved account candidates in `/imports`.
6. Add a small interval worker and account-refresh endpoint, preserving existing Docker services.
7. Back up the database, apply the migration, enable ignored local operating flags, rebuild, and perform one real poll plus duplicate re-poll.
8. Run full tests, lint, build, HTTP checks, secret scan, and operation/data reconciliation.
9. Update the runbook, create focused commits, push `main`, and verify a clean synchronized worktree.

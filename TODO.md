# Zeno Marketplace - Implementation TODO

## Phase 1: Database Migrations
- [x] Add job funding fields (funded_amount, funding_tx_hash, funding_status)
- [x] Add contributor wallet verification fields
- [x] Add company funding wallet fields
- [x] Add job funding status enum
- [x] Add is_demo flag to jobs and tasks to filter seed data

## Phase 2: Backend API Changes
- [x] Update tasks/available to filter by funded jobs and exclude demo tasks
- [x] Add job funding endpoint (POST /api/jobs/{id}/fund)
- [x] Add funding confirmation endpoint (POST /api/jobs/{id}/fund/confirm)
- [x] Update settlement to trigger on reviewer acceptance (not just admin)
- [x] Add company wallet onboarding endpoint (already in RPC)
- [x] Add contributor wallet verification endpoint (already in RPC)

## Phase 3: Frontend Changes
- [x] Add wallet connection step in onboarding for contributors
- [x] Add company wallet connection in onboarding
- [ ] Add job funding UI in buyer dashboard
- [ ] Add funding step in NewJobWizard
- [ ] Update settlement to trigger on reviewer acceptance (done in backend)
- [ ] Update contributor tasks to show funding status (already filtered in backend)

## Phase 4: Settlement Integration
- [x] Trigger settlement on reviewer acceptance (not just admin)
- [ ] Verify settlement uses contributor's verified wallet
- [ ] Ensure settlement only for funded jobs

## Phase 5: Clean up seed data
- [x] Mark seed tasks as demo/test so they don't appear in production
- [x] Add is_demo flag to jobs/tasks

## Phase 6: Testing
- [x] Run existing tests
- [ ] Test end-to-end flow
- [ ] Run E2E tests

## Phase 7: Build Verification
- [x] Build succeeds
- [x] All tests pass
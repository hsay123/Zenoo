-- Onboarding transaction tests — run against the application database.
--
-- These assertions exercise the `complete_onboarding(...)` function added in
-- migration 008 and prove the guarantees the API relies on:
--
--   * rollback        — a failure after onboarding undoes the org/membership/user writes
--   * duplicate/retry — replaying a request is idempotent (no duplicate organization)
--   * invalid names   — a blank buyer name is rejected, and creates nothing
--   * role escalation — reviewer/admin are rejected, and a completed user cannot re-role
--
-- The block creates throwaway rows with a `.invalid` email and random UUIDs,
-- then deletes them, so it leaves the database unchanged. It raises on failure,
-- so a clean run is the only way to get the final NOTICE.
--
-- Concurrency is covered separately by firing two sessions at the same user at
-- once; `pg_advisory_xact_lock` serializes them, and the replay is idempotent,
-- so exactly one organization is created (a single SQL block runs in one
-- transaction and cannot exercise a real race).

DO $$
DECLARE
  v_user   uuid := gen_random_uuid();
  v_other  uuid := gen_random_uuid();
  v_blank  uuid := gen_random_uuid();
  v_roll   uuid := gen_random_uuid();
  v_res    jsonb;
  v_org    uuid;
  v_int    int;
  v_text   text;
  v_bool   boolean;
BEGIN
  -- ---------------------------------------------------------------- duplicate
  INSERT INTO users (id, email) VALUES (v_user, 'onboarding-tx-1@example.invalid');

  v_res := complete_onboarding(v_user, 'buyer', 'Transaction Test Co');
  IF v_res->>'account_type' <> 'buyer' THEN
    RAISE EXCEPTION 'expected buyer account_type, got %', v_res->>'account_type';
  END IF;
  v_org := (v_res->>'organization_id')::uuid;

  SELECT count(*) INTO v_int FROM organizations WHERE created_by = v_user;
  IF v_int <> 1 THEN RAISE EXCEPTION 'expected 1 organization, got %', v_int; END IF;

  SELECT count(*) INTO v_int
    FROM organization_members
   WHERE organization_id = v_org AND user_id = v_user AND role = 'owner';
  IF v_int <> 1 THEN RAISE EXCEPTION 'expected one owner membership, got %', v_int; END IF;

  SELECT role::text, onboarding_completed, organization_id
    INTO v_text, v_bool, v_org
    FROM users WHERE id = v_user;
  IF v_text <> 'buyer' OR NOT v_bool THEN
    RAISE EXCEPTION 'user not marked as buyer/complete (role=%, completed=%)', v_text, v_bool;
  END IF;

  -- Replay the same request: idempotent, no second organization.
  v_res := complete_onboarding(v_user, 'buyer', 'Transaction Test Co');
  IF (v_res->>'already_completed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'replay was not reported as already_completed';
  END IF;
  SELECT count(*) INTO v_int FROM organizations WHERE created_by = v_user;
  IF v_int <> 1 THEN RAISE EXCEPTION 'replay created a duplicate organization (%)', v_int; END IF;

  -- ------------------------------------------------------- role escalation
  -- A completed user cannot change role by replaying onboarding.
  PERFORM complete_onboarding(v_user, 'contributor');
  SELECT role::text INTO v_text FROM users WHERE id = v_user;
  IF v_text <> 'buyer' THEN
    RAISE EXCEPTION 'completed user changed role to %', v_text;
  END IF;

  -- reviewer/admin are never self-selectable.
  BEGIN
    PERFORM complete_onboarding(v_user, 'admin');
    RAISE EXCEPTION 'admin account type was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM complete_onboarding(v_user, 'reviewer');
    RAISE EXCEPTION 'reviewer account type was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  -- ------------------------------------------------------------ invalid name
  INSERT INTO users (id, email) VALUES (v_blank, 'onboarding-tx-2@example.invalid');
  BEGIN
    PERFORM complete_onboarding(v_blank, 'buyer', '   ');
    RAISE EXCEPTION 'blank organization name was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM organizations WHERE created_by = v_blank) THEN
    RAISE EXCEPTION 'blank name created an organization';
  END IF;
  SELECT onboarding_completed INTO v_bool FROM users WHERE id = v_blank;
  IF v_bool THEN RAISE EXCEPTION 'blank-name user was marked complete'; END IF;

  -- ------------------------------------------------------------------ rollback
  INSERT INTO users (id, email) VALUES (v_roll, 'onboarding-tx-2b@example.invalid');
  BEGIN
    -- Onboard successfully, then fail: the EXCEPTION block rolls the
    -- subtransaction back to its savepoint, undoing the function's writes.
    PERFORM complete_onboarding(v_roll, 'buyer', 'Rollback Co');
    RAISE EXCEPTION 'simulated failure after onboarding';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  IF EXISTS (SELECT 1 FROM organizations WHERE created_by = v_roll) THEN
    RAISE EXCEPTION 'rollback failed: organization persisted';
  END IF;
  SELECT onboarding_completed INTO v_bool FROM users WHERE id = v_roll;
  IF v_bool THEN
    RAISE EXCEPTION 'rollback failed: user onboarding persisted';
  END IF;

  -- ---------------------------------------------------------------- invalid user
  BEGIN
    PERFORM complete_onboarding(gen_random_uuid(), 'contributor');
    RAISE EXCEPTION 'missing user was accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;

  -- ------------------------------------------------------------------ cleanup
  DELETE FROM organization_members WHERE user_id IN (v_user, v_other, v_blank, v_roll);
  UPDATE users SET organization_id = NULL WHERE id IN (v_user, v_other, v_blank, v_roll);
  DELETE FROM organizations WHERE created_by IN (v_user, v_other, v_blank, v_roll);
  DELETE FROM users WHERE id IN (v_user, v_other, v_blank, v_roll);

  IF EXISTS (SELECT 1 FROM users WHERE id IN (v_user, v_other, v_blank, v_roll)) THEN
    RAISE EXCEPTION 'cleanup failed';
  END IF;

  RAISE NOTICE 'onboarding transaction tests passed';
END $$;

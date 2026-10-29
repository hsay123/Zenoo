-- Migration: 008_onboarding_rpc
-- Makes first-time onboarding atomic, idempotent and concurrency-safe.
--
-- The previous API path created an organization, a membership and the user
-- update as three separate PostgREST calls with a check-then-insert slug loop,
-- so a retry or two concurrent requests could create duplicate organizations or
-- leave a half-applied state. This migration moves the whole operation into a
-- single SECURITY DEFINER function executed in one transaction.
--
-- Additive and idempotent: safe to run on fresh or existing databases.

CREATE OR REPLACE FUNCTION complete_onboarding(
  p_user_id      uuid,
  p_account_type text,
  p_org_name     text DEFAULT NULL,
  p_wallet_address text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user    users%ROWTYPE;
  v_org_id  uuid;
  v_base    text;
  v_slug    text;
  v_attempt int := 0;
BEGIN
  -- Only self-selectable account types are permitted. reviewer/admin are
  -- admin-controlled and can never be set through onboarding.
  IF p_account_type IS NULL OR p_account_type NOT IN ('buyer', 'contributor') THEN
    RAISE EXCEPTION 'invalid account type %', p_account_type
      USING ERRCODE = '22023';
  END IF;

  -- Validate wallet address format if provided
  IF p_wallet_address IS NOT NULL AND p_wallet_address !~ '^0x[a-fA-F0-9]{40}$' THEN
    RAISE EXCEPTION 'wallet_address must be a 0x-prefixed Ethereum address'
      USING ERRCODE = '22023';
  END IF;

  -- Contributors must provide a wallet address for payouts
  IF p_account_type = 'contributor' AND (p_wallet_address IS NULL OR length(btrim(p_wallet_address)) = 0) THEN
    RAISE EXCEPTION 'wallet_address is required for contributor payouts'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize concurrent onboarding attempts for the same user.
  PERFORM pg_advisory_xact_lock(hashtext('onboarding:' || p_user_id::text));

  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent + non-escalating: an account that already completed onboarding
  -- keeps its role, org and account type no matter what is sent again.
  IF v_user.onboarding_completed THEN
    RETURN jsonb_build_object(
      'onboarding_completed', true,
      'account_type', v_user.onboarding_account_type,
      'organization_id', v_user.organization_id,
      'already_completed', true
    );
  END IF;

  IF p_account_type = 'contributor' THEN
    UPDATE users
      SET onboarding_completed = true,
          onboarding_account_type = 'contributor',
          role = 'contributor',
          wallet_address = p_wallet_address
      WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'onboarding_completed', true,
      'account_type', 'contributor',
      'organization_id', NULL,
      'already_completed', false
    );
  END IF;

  -- Buyer / company path.
  IF p_org_name IS NULL OR length(btrim(p_org_name)) = 0 THEN
    RAISE EXCEPTION 'organization name is required for a company account'
      USING ERRCODE = '22023';
  END IF;

  v_base := btrim(p_org_name);
  v_slug := lower(regexp_replace(v_base, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  v_slug := left(v_slug, 50);
  IF v_slug = '' THEN
    v_slug := 'org';
  END IF;

  -- Insert the organization, retrying with a random suffix on slug collision.
  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      INSERT INTO organizations (name, slug, created_by)
      VALUES (
        v_base,
        CASE
          WHEN v_attempt = 1 THEN v_slug
          ELSE left(v_slug, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
        END,
        p_user_id
      )
      RETURNING id INTO v_org_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  UPDATE users
    SET onboarding_completed = true,
        onboarding_account_type = 'buyer',
        role = 'buyer',
        organization_id = v_org_id,
        wallet_address = p_wallet_address
    WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'onboarding_completed', true,
    'account_type', 'buyer',
    'organization_id', v_org_id,
    'already_completed', false
  );
END;
$$;

-- Only the server-side service role may call it; never anon/authenticated.
REVOKE ALL ON FUNCTION complete_onboarding(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_onboarding(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_onboarding(uuid, text, text, text) TO service_role;

-- 039: Phase 2 permission realignment
--
-- Part 1 – Revoke ALL request-approval and custody-write permissions from the
--          system administrator. After Phase 2 the admin is a read-only
--          oversight role: it retains exactly one custody permission
--          (custodies:view) and zero requests:* grants.
--
--          NOTE: the request is intentionally broader than the six literal
--          permissions listed in the Phase 2 spec:
--            - requests:cancel is ALSO revoked, because the spec's
--              verification step asserts the admin holds ZERO requests:*
--              grants (the grant granule is `requests:*`, so requests:cancel
--              would violate that invariant).
--            - custodies:view_own is ALSO revoked, because the verification
--              asserts the admin keeps ONLY custodies:view.
--          Every revocation is a DELETE, hence replay-safe (deleting a row
--          that no longer exists is a no-op).
--
-- Part 2 – Grant requests:reject to the sub-warehouse manager so they can
--          reject a pending request BEFORE it is approved (D13). The existing
--          forwarded → admin_rejected path remains but is now unreachable,
--          since no role that can approve a forwarded request holds the
--          permission anymore.

BEGIN;

-- ── Part 1: Strip the admin to read-only ────────────────────────────────

DELETE FROM role_permissions rp
 USING roles r, permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.code = 'admin'
   AND p.code IN (
     'custodies:return',
     'custodies:view_own',
     'requests:approve',
     'requests:cancel',
     'requests:create',
     'requests:forward',
     'requests:issue',
     'requests:reject',
     'requests:view'
   );

-- ── Part 2: Sub-warehouse manager gains reject ──────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.code = 'sub_warehouse_manager'
   AND r.is_active = true
   AND p.code = 'requests:reject'
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

-- ── Verification: enforce the Phase 2 permission invariant ──────────────

DO $$
DECLARE
  v_requests int;
  v_custodies int;
  v_has_view int;
BEGIN
  SELECT count(*) INTO v_requests
    FROM role_permissions rp
    JOIN roles r      ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.code = 'admin' AND p.code LIKE 'requests:%';

  IF v_requests <> 0 THEN
    RAISE EXCEPTION 'Phase 2 invariant violated: admin still holds % requests:* grants', v_requests;
  END IF;

  SELECT count(*) INTO v_custodies
    FROM role_permissions rp
    JOIN roles r      ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.code = 'admin' AND p.code LIKE 'custodies:%';

  SELECT 1 INTO v_has_view
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.code = 'admin' AND p.code = 'custodies:view';

  IF v_custodies <> 1 OR v_has_view IS NULL THEN
    RAISE EXCEPTION 'Phase 2 invariant violated: admin custody grants = % (expected exactly custodies:view)', v_custodies;
  END IF;
END $$;

-- ── Audit trail ─────────────────────────────────────────────────────────

INSERT INTO _migration_notes (note_key, payload)
SELECT 'phase2_permissions',
       jsonb_build_object(
         'change_set', 'revoked from admin: custodies:return, custodies:view_own, requests:approve/cancel/create/forward/issue/reject/view; granted sub_warehouse_manager: requests:reject'
       )
 WHERE NOT EXISTS (
   SELECT 1 FROM _migration_notes WHERE note_key = 'phase2_permissions'
 );

COMMIT;
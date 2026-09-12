-- ============================================================================
-- 044_purchase_requests_permissions.down.sql  (DOWN)
-- Reverts 044_purchase_requests_permissions.sql:
--   role grants -> permission catalog -> migration note.
-- ============================================================================
BEGIN;

DELETE FROM role_permissions rp
USING permissions p
WHERE rp.permission_id = p.id
  AND p.code LIKE 'purchase-requests:%';

DELETE FROM permissions WHERE code LIKE 'purchase-requests:%';

DELETE FROM _migration_notes WHERE note_key = 'phase4_purchase_requests_permissions';

COMMIT;
-- ============================================================================
-- 026_supervisors_management.down.sql
-- Revokes the supervisors:* permissions and removes them from the catalog.
-- ============================================================================
BEGIN;

DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE code LIKE 'supervisors:%'
);

DELETE FROM permissions
WHERE code LIKE 'supervisors:%';

COMMIT;

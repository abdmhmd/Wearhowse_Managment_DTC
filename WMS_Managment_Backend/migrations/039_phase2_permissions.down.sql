-- Down for 039: restore the pre-Phase-2 permission sets (replay-safe).

BEGIN;

-- Restore admin's request-approval + custody-write grants.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.code = 'admin'
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
   )
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

-- Remove the reject grant from sub-warehouse manager (Phase 2 addition).
DELETE FROM role_permissions rp
 USING roles r, permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.code = 'sub_warehouse_manager'
   AND p.code = 'requests:reject';

DELETE FROM _migration_notes WHERE note_key = 'phase2_permissions';

COMMIT;
-- 032: Supervisor request routing + custody management
--
-- Part 1 – Route supervisor material requests to the warehouse manager
--          instead of the system administrator.
-- Part 2 – Enable supervisors to view their custodies and request returns;
--          add a two-step return workflow (supervisor requests, WM confirms).

BEGIN;

-- ── Part 1: Supervisor request routing ──────────────────────────────────

-- New status: the warehouse manager has approved a supervisor-originated
-- request and is ready to process / issue it.
ALTER TYPE request_status ADD VALUE IF NOT EXISTS 'wm_approved';

-- Warehouse manager now needs approve + issue permissions so they can
-- process supervisor requests end-to-end (approve → issue).
-- These are INSERTed via a sub-select to satisfy the FK on role_id / perm_id.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.code = 'warehouse_manager'
   AND r.is_active = true
   AND p.code IN ('requests:approve', 'requests:issue')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

-- ── Part 2: Supervisor custody ──────────────────────────────────────────

-- New status for the two-step return workflow.
ALTER TYPE custody_status ADD VALUE IF NOT EXISTS 'return_pending';

-- Track how many units the supervisor has requested to return (may differ
-- from the full custody quantity during partial returns).
ALTER TABLE custodies
  ADD COLUMN IF NOT EXISTS pending_return_quantity DECIMAL(12,4);

ALTER TABLE custodies
  ADD COLUMN IF NOT EXISTS return_notes TEXT;

-- Supervisor needs custody view + return permissions.
-- Also grant requests:cancel so supervisors can cancel their own requests
-- (ownership check is enforced in the service layer).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.code = 'supervisor'
   AND r.is_active = true
   AND p.code IN ('custodies:view', 'custodies:return', 'requests:cancel')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
   );

COMMIT;

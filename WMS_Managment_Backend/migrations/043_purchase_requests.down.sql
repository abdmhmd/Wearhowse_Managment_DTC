-- ============================================================================
-- 043_purchase_requests.down.sql  (DOWN)
-- Reverts 043_purchase_requests.sql:
--   tables (child first) -> sequence -> enum type -> migration note.
-- The auto-PO purchase_order_id link is ON DELETE SET NULL, so dropping the
-- request table never cascades into purchase_orders.
-- ============================================================================
BEGIN;

DROP TABLE IF EXISTS purchase_request_items;
DROP TABLE IF EXISTS purchase_requests;

DROP SEQUENCE IF EXISTS pr_no_seq;

DROP TYPE IF EXISTS purchase_request_status;

DELETE FROM _migration_notes WHERE note_key = 'phase4_purchase_requests_created';

COMMIT;
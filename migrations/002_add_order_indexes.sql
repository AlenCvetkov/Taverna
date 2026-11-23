CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id, line_no);
CREATE INDEX IF NOT EXISTS order_item_addons_item_idx ON order_item_addons(order_item_id);
CREATE INDEX IF NOT EXISTS payments_paid_at_idx ON payments(paid_at);

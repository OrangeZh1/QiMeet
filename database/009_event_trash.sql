ALTER TABLE events
  ADD COLUMN deleted_at DATETIME(3) NULL,
  ADD INDEX idx_events_deleted_at (deleted_at);

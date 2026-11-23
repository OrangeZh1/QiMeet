ALTER TABLE attendee_accounts
  ADD COLUMN display_name VARCHAR(60) NOT NULL DEFAULT '',
  ADD COLUMN contact_phone VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN avatar_material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD INDEX attendee_registration_time (created_at, id),
  ADD CONSTRAINT attendee_avatar_material FOREIGN KEY (avatar_material_id) REFERENCES materials(id) ON DELETE SET NULL;

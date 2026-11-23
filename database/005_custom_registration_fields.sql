ALTER TABLE form_versions
  ADD COLUMN legacy_contact BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE registrations
  MODIFY name VARCHAR(80) COLLATE utf8mb4_0900_bin NULL,
  MODIFY phone VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL;

ALTER TABLE attachments
  ADD INDEX idx_attachments_registration_field (registration_id, field_id);

ALTER TABLE attachments DROP INDEX registration_id;

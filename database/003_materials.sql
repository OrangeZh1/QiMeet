CREATE TABLE IF NOT EXISTS materials (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  byte_count INT UNSIGNED NOT NULL,
  payload MEDIUMBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (created_at, id)
) ENGINE=InnoDB;

ALTER TABLE events ADD COLUMN cover_material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT events_cover_material FOREIGN KEY (cover_material_id) REFERENCES materials(id);

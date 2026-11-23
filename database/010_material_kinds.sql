ALTER TABLE materials
  ADD COLUMN kind ENUM('image', 'file', 'video') NOT NULL DEFAULT 'image' AFTER name,
  MODIFY COLUMN payload LONGBLOB NOT NULL,
  ADD INDEX idx_material_kind_created (kind, created_at, id);

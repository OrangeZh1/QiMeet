CREATE TABLE IF NOT EXISTS material_image_previews (
  material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  variant ENUM('thumb','display') NOT NULL,
  payload MEDIUMBLOB NOT NULL,
  PRIMARY KEY (material_id, variant),
  CONSTRAINT material_image_preview_source FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
) ENGINE=InnoDB;

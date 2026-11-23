ALTER TABLE site_settings
  ADD COLUMN home_banner_material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT site_home_banner_material FOREIGN KEY (home_banner_material_id) REFERENCES materials(id);

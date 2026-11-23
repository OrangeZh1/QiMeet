ALTER TABLE admin_account
  ADD COLUMN display_name VARCHAR(60) NOT NULL DEFAULT '管理员',
  ADD COLUMN avatar_material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD CONSTRAINT admin_avatar_material FOREIGN KEY (avatar_material_id) REFERENCES materials(id);

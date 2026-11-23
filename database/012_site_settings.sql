CREATE TABLE IF NOT EXISTS site_settings (
  id TINYINT UNSIGNED PRIMARY KEY CHECK (id = 1),
  title VARCHAR(120) NOT NULL DEFAULT 'QiMeet',
  favicon_material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  logo_material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  login_image_material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  login_copyright VARCHAR(240) NOT NULL DEFAULT '',
  filing_number VARCHAR(120) NOT NULL DEFAULT '',
  filing_url VARCHAR(600) NOT NULL DEFAULT '',
  privacy_policy MEDIUMTEXT NOT NULL,
  user_agreement MEDIUMTEXT NOT NULL,
  FOREIGN KEY (favicon_material_id) REFERENCES materials(id),
  FOREIGN KEY (logo_material_id) REFERENCES materials(id),
  FOREIGN KEY (login_image_material_id) REFERENCES materials(id)
) ENGINE=InnoDB;

INSERT INTO site_settings (id, privacy_policy, user_agreement)
VALUES (1, '', '')
ON DUPLICATE KEY UPDATE id=id;

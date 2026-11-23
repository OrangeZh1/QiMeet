CREATE TABLE IF NOT EXISTS site_home_banners (
  position TINYINT UNSIGNED PRIMARY KEY,
  material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  FOREIGN KEY (material_id) REFERENCES materials(id)
) ENGINE=InnoDB;

INSERT INTO site_home_banners (position, material_id)
SELECT 0, home_banner_material_id FROM site_settings WHERE id=1 AND home_banner_material_id IS NOT NULL
ON DUPLICATE KEY UPDATE position=site_home_banners.position;

ALTER TABLE site_settings
  ADD COLUMN home_banner_tagline VARCHAR(80) NOT NULL DEFAULT '让活动报名和签到更简单',
  DROP FOREIGN KEY site_home_banner_material,
  DROP COLUMN home_banner_material_id;

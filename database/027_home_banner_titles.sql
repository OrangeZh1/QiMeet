ALTER TABLE site_settings
  ADD COLUMN home_banner_team VARCHAR(80) NOT NULL DEFAULT '启承服务团队';

ALTER TABLE site_home_banners
  MODIFY material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN preset VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  ADD COLUMN title VARCHAR(80) NOT NULL DEFAULT '',
  ADD CONSTRAINT site_banner_asset CHECK ((material_id IS NULL) <> (preset IS NULL));

UPDATE site_home_banners AS b JOIN site_settings AS s ON s.id=1
SET b.title=s.home_banner_tagline;

SET @qimeet_use_banner_presets = NOT EXISTS (SELECT 1 FROM site_home_banners);
INSERT INTO site_home_banners (position, preset, title)
SELECT 0, 'stage', IF(TRIM(home_banner_tagline) = '', '让活动报名和签到更简单', home_banner_tagline)
FROM site_settings WHERE id=1 AND @qimeet_use_banner_presets
UNION ALL SELECT 1, 'arrival', '扫码签到，快速入场' WHERE @qimeet_use_banner_presets
UNION ALL SELECT 2, 'ribbons', '精彩活动，随时发现' WHERE @qimeet_use_banner_presets;

ALTER TABLE site_settings DROP COLUMN home_banner_tagline;

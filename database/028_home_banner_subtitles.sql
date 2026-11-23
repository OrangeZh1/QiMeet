ALTER TABLE site_home_banners
  ADD COLUMN subtitle VARCHAR(80) NOT NULL DEFAULT '';

UPDATE site_home_banners AS b JOIN site_settings AS s ON s.id=1
SET b.subtitle=s.home_banner_team;

ALTER TABLE site_settings DROP COLUMN home_banner_team;

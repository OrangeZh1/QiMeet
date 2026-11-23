ALTER TABLE site_settings
  ADD COLUMN phone_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN email_login_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN wechat_login_enabled BOOLEAN NULL,
  ADD COLUMN wechat_app_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN wechat_app_secret VARBINARY(256) NULL;

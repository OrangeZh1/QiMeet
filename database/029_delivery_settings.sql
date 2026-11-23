ALTER TABLE site_settings
  ADD COLUMN sms_provider VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN aliyun_sms_config BLOB NULL,
  ADD COLUMN tencent_sms_config BLOB NULL,
  ADD COLUMN smtp_config BLOB NULL;

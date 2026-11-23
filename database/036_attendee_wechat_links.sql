CREATE TABLE IF NOT EXISTS attendee_wechat_links (
  open_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  app_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  account_id INT UNSIGNED NOT NULL UNIQUE,
  CONSTRAINT attendee_wechat_links_account FOREIGN KEY (account_id) REFERENCES attendee_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO attendee_wechat_links (open_id, account_id)
SELECT identifier, id FROM attendee_accounts WHERE kind='wechat'
ON DUPLICATE KEY UPDATE account_id=attendee_wechat_links.account_id;

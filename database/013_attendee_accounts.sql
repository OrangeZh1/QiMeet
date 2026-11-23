CREATE TABLE IF NOT EXISTS attendee_accounts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('email','phone','wechat') NOT NULL,
  identifier VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY account_identifier (kind, identifier)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendee_codes (
  kind ENUM('email','phone') NOT NULL,
  identifier VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  digest VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sent_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  remaining TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (kind, identifier),
  INDEX (expires_at)
) ENGINE=InnoDB;

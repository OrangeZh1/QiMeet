CREATE TABLE IF NOT EXISTS attendee_code_challenges (
  kind ENUM('email','phone') NOT NULL,
  identifier VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  purpose_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  digest VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  remaining TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (kind, identifier, purpose_hash),
  INDEX (expires_at)
) ENGINE=InnoDB;

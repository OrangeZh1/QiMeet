CREATE TABLE IF NOT EXISTS admin_account (
  id TINYINT UNSIGNED PRIMARY KEY CHECK (id = 1),
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(160) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  organizer VARCHAR(160) NOT NULL DEFAULT '',
  venue VARCHAR(200) NOT NULL DEFAULT '',
  cover_url VARCHAR(900) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  registration_starts_at DATETIME(3) NOT NULL,
  registration_ends_at DATETIME(3) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  edit_policy ENUM('off','once','unlimited') NOT NULL DEFAULT 'off',
  edit_deadline ENUM('registration','manual') NOT NULL DEFAULT 'registration',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS form_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  fields JSON NOT NULL,
  identity_purpose VARCHAR(800) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE (event_id, version),
  FOREIGN KEY (event_id) REFERENCES events(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS checkpoints (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  title VARCHAR(100) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  qr_mode ENUM('fixed','dynamic','both') NOT NULL DEFAULT 'both',
  qr_version INT UNSIGNED NOT NULL DEFAULT 1,
  FOREIGN KEY (event_id) REFERENCES events(id),
  INDEX (event_id, starts_at, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  form_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) COLLATE utf8mb4_0900_bin NOT NULL,
  phone VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  credential_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  answers JSON NOT NULL,
  identity_consented_at DATETIME(3) NULL,
  edits INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NULL,
  UNIQUE (event_id, name, phone),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (form_id) REFERENCES form_versions(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attachments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  registration_id INT UNSIGNED NOT NULL,
  field_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  filename VARCHAR(180) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  byte_count INT UNSIGNED NOT NULL,
  payload MEDIUMBLOB NOT NULL,
  UNIQUE (registration_id, field_id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS checkins (
  checkpoint_id INT UNSIGNED NOT NULL,
  registration_id INT UNSIGNED NOT NULL,
  source ENUM('fixed','dynamic','manual') NOT NULL,
  checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (checkpoint_id, registration_id),
  INDEX (registration_id),
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  kind ENUM('admin','attendee','checkin') NOT NULL,
  registration_id INT UNSIGNED NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX (expires_at),
  FOREIGN KEY (registration_id) REFERENCES registrations(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS export_audit (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  form_id INT UNSIGNED NOT NULL,
  row_count INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (event_id) REFERENCES events(id),
  FOREIGN KEY (form_id) REFERENCES form_versions(id)
) ENGINE=InnoDB;

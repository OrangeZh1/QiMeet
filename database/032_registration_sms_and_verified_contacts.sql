ALTER TABLE events ADD COLUMN registration_sms BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE attendee_accounts
  ADD COLUMN verified_phone VARCHAR(11) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN verified_email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NULL;

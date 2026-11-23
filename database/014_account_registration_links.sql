ALTER TABLE registrations
  ADD COLUMN account_id INT UNSIGNED NULL,
  ADD UNIQUE KEY registration_account (account_id, event_id),
  ADD FOREIGN KEY (account_id) REFERENCES attendee_accounts(id);

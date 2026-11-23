ALTER TABLE sessions
  MODIFY COLUMN kind ENUM('admin','attendee','checkin','account') NOT NULL,
  ADD COLUMN account_id INT UNSIGNED NULL,
  ADD FOREIGN KEY (account_id) REFERENCES attendee_accounts(id);

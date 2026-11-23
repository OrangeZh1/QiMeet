ALTER TABLE checkins MODIFY COLUMN source ENUM('fixed','dynamic','manual','direct') NOT NULL;

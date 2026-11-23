CREATE TABLE IF NOT EXISTS event_videos (
  event_id INT UNSIGNED NOT NULL,
  material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (event_id, material_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id)
) ENGINE=InnoDB;

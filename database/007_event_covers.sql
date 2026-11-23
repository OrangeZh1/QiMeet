CREATE TABLE IF NOT EXISTS event_covers (
  event_id INT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  material_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (event_id, position),
  UNIQUE (event_id, material_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id)
) ENGINE=InnoDB;

INSERT INTO event_covers (event_id,position,material_id)
SELECT id,0,cover_material_id FROM events WHERE cover_material_id IS NOT NULL
ON DUPLICATE KEY UPDATE position=event_covers.position;

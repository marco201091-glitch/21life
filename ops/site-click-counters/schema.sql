CREATE TABLE IF NOT EXISTS clicks (
  day TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('apk', 'web')),
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (day, event)
);

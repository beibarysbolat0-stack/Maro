ALTER TABLE items ADD COLUMN project TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
CREATE TABLE IF NOT EXISTS subtasks (id TEXT PRIMARY KEY, user TEXT NOT NULL, item TEXT NOT NULL, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS subtasks_owner_item ON subtasks (user, item, created);
ALTER TABLE items ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN repeat TEXT NOT NULL DEFAULT 'none';
ALTER TABLE items ADD COLUMN recurrence_source TEXT NOT NULL DEFAULT '';
ALTER TABLE items ADD COLUMN reminder_minutes INTEGER NOT NULL DEFAULT -1;
CREATE UNIQUE INDEX IF NOT EXISTS items_repeat_day ON items (user, recurrence_source, date) WHERE recurrence_source <> '';

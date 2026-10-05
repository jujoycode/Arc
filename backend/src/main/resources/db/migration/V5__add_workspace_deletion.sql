ALTER TABLE workspaces ADD COLUMN deleted_at DATETIME(6) NULL;
CREATE INDEX ix_workspaces_deleted_at ON workspaces(deleted_at);

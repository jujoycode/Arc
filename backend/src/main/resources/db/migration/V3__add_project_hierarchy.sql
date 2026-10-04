ALTER TABLE projects
    ADD COLUMN parent_project_id BIGINT NULL AFTER workspace_id,
    ADD CONSTRAINT uk_projects_workspace_id UNIQUE (workspace_id, id);

ALTER TABLE projects
    ADD CONSTRAINT fk_projects_workspace_parent FOREIGN KEY (workspace_id, parent_project_id) REFERENCES projects (workspace_id, id);

CREATE INDEX ix_projects_workspace_parent ON projects (workspace_id, parent_project_id);

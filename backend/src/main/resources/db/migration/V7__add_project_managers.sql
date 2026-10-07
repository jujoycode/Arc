CREATE TABLE project_managers (
    project_id BIGINT NOT NULL,
    workspace_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    PRIMARY KEY (project_id, user_id),
    KEY ix_project_managers_member (workspace_id, user_id),
    CONSTRAINT fk_project_managers_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_project_managers_member FOREIGN KEY (workspace_id, user_id) REFERENCES workspace_members (workspace_id, user_id) ON DELETE CASCADE
);

CREATE TABLE versions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT NULL,
    start_date DATE NULL,
    due_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_versions_project_id UNIQUE (project_id, id),
    CONSTRAINT uk_versions_project_name UNIQUE (project_id, name),
    CONSTRAINT ck_versions_dates CHECK (start_date IS NULL OR start_date <= due_date),
    CONSTRAINT fk_versions_project FOREIGN KEY (project_id) REFERENCES projects (id)
);

ALTER TABLE issues
    ADD COLUMN start_date DATE NULL AFTER due_date,
    ADD COLUMN done_ratio SMALLINT NOT NULL DEFAULT 0 AFTER story_points,
    ADD COLUMN parent_issue_id BIGINT NULL AFTER sprint_id,
    ADD COLUMN version_id BIGINT NULL AFTER parent_issue_id,
    ADD CONSTRAINT uk_issues_project_id UNIQUE (project_id, id),
    ADD CONSTRAINT ck_issues_dates CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date),
    ADD CONSTRAINT ck_issues_done_ratio CHECK (done_ratio BETWEEN 0 AND 100);

ALTER TABLE issues
    ADD CONSTRAINT fk_issues_project_parent FOREIGN KEY (project_id, parent_issue_id) REFERENCES issues (project_id, id),
    ADD CONSTRAINT fk_issues_project_version FOREIGN KEY (project_id, version_id) REFERENCES versions (project_id, id);

CREATE INDEX ix_issues_project_parent ON issues (project_id, parent_issue_id);
CREATE INDEX ix_issues_project_version ON issues (project_id, version_id);
CREATE INDEX ix_issues_project_dates ON issues (project_id, start_date, due_date);

CREATE TABLE issue_relations (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    source_issue_id BIGINT NOT NULL,
    target_issue_id BIGINT NOT NULL,
    relation_type VARCHAR(16) NOT NULL,
    lag_days INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_issue_relations_pair_type UNIQUE (project_id, source_issue_id, target_issue_id, relation_type),
    CONSTRAINT ck_issue_relations_distinct CHECK (source_issue_id <> target_issue_id),
    KEY ix_issue_relations_target (project_id, target_issue_id),
    CONSTRAINT fk_issue_relations_source FOREIGN KEY (project_id, source_issue_id) REFERENCES issues (project_id, id),
    CONSTRAINT fk_issue_relations_target FOREIGN KEY (project_id, target_issue_id) REFERENCES issues (project_id, id)
);

CREATE TABLE saved_views (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    workspace_id BIGINT NOT NULL,
    project_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    view_type VARCHAR(16) NOT NULL,
    filters JSON NOT NULL,
    options JSON NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_saved_views_user_project_name UNIQUE (user_id, project_id, name),
    KEY ix_saved_views_project_type (project_id, view_type),
    CONSTRAINT fk_saved_views_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_saved_views_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_saved_views_project FOREIGN KEY (project_id) REFERENCES projects (id)
);

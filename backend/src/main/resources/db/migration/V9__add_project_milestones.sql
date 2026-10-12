CREATE TABLE milestones (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    title VARCHAR(120) NOT NULL,
    target_date DATE NOT NULL,
    criteria TEXT NOT NULL,
    description TEXT NULL,
    owner_id BIGINT NULL,
    version_id BIGINT NULL,
    status VARCHAR(16) NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    CONSTRAINT ck_milestones_revision CHECK (revision >= 0),
    CONSTRAINT ck_milestones_status CHECK (status IN ('PLANNED', 'ACHIEVED', 'CANCELLED')),
    KEY ix_milestones_project_target_id (project_id, target_date, id),
    CONSTRAINT fk_milestones_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_milestones_project_version FOREIGN KEY (project_id, version_id) REFERENCES versions (project_id, id),
    CONSTRAINT fk_milestones_owner FOREIGN KEY (owner_id) REFERENCES users (id)
);

CREATE TABLE milestone_activities (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    milestone_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    event_type VARCHAR(16) NOT NULL,
    payload JSON NOT NULL,
    created_at DATETIME(6) NOT NULL,
    KEY ix_milestone_activities_milestone_id (milestone_id, id),
    CONSTRAINT fk_milestone_activities_milestone FOREIGN KEY (milestone_id) REFERENCES milestones (id),
    CONSTRAINT fk_milestone_activities_actor FOREIGN KEY (actor_id) REFERENCES users (id),
    CONSTRAINT ck_milestone_activities_event CHECK (event_type IN ('CREATED', 'UPDATED', 'CANCELLED', 'REOPENED'))
);

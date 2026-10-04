CREATE TABLE users (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NULL,
    email_verified_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_users_email UNIQUE (email)
);

CREATE TABLE workspaces (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE workspace_members (
    workspace_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(16) NOT NULL,
    joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (workspace_id, user_id),
    KEY ix_workspace_members_user (user_id),
    CONSTRAINT fk_workspace_members_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_workspace_members_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE invitations (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    workspace_id BIGINT NOT NULL,
    email VARCHAR(320) NOT NULL,
    role VARCHAR(16) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    invited_by BIGINT NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    accepted_at DATETIME(6) NULL,
    revoked_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_invitations_token_hash UNIQUE (token_hash),
    KEY ix_invitations_workspace_email (workspace_id, email),
    CONSTRAINT fk_invitations_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_invitations_inviter FOREIGN KEY (invited_by) REFERENCES users (id)
);

CREATE TABLE projects (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    workspace_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    project_key VARCHAR(10) NOT NULL,
    description TEXT NULL,
    next_issue_number INT NOT NULL DEFAULT 1,
    archived_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_projects_workspace_key UNIQUE (workspace_id, project_key),
    CONSTRAINT fk_projects_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
);

CREATE TABLE sprints (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    goal TEXT NULL,
    start_on DATE NOT NULL,
    end_on DATE NOT NULL,
    status VARCHAR(16) NOT NULL,
    started_at DATETIME(6) NULL,
    completed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_sprints_project_id UNIQUE (project_id, id),
    KEY ix_sprints_project_status (project_id, status),
    CONSTRAINT fk_sprints_project FOREIGN KEY (project_id) REFERENCES projects (id)
);

CREATE TABLE issues (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    issue_number INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    issue_type VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL,
    priority VARCHAR(16) NOT NULL,
    reporter_id BIGINT NOT NULL,
    assignee_id BIGINT NULL,
    due_date DATE NULL,
    story_points INT NULL,
    sprint_id BIGINT NULL,
    sort_order BIGINT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_issues_project_number UNIQUE (project_id, issue_number),
    KEY ix_issues_project_status (project_id, status, deleted_at),
    KEY ix_issues_assignee (assignee_id),
    KEY ix_issues_project_sprint (project_id, sprint_id),
    CONSTRAINT fk_issues_project FOREIGN KEY (project_id) REFERENCES projects (id),
    CONSTRAINT fk_issues_reporter FOREIGN KEY (reporter_id) REFERENCES users (id),
    CONSTRAINT fk_issues_assignee FOREIGN KEY (assignee_id) REFERENCES users (id),
    CONSTRAINT fk_issues_project_sprint FOREIGN KEY (project_id, sprint_id) REFERENCES sprints (project_id, id)
);

CREATE TABLE comments (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    issue_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    KEY ix_comments_issue_created (issue_id, created_at),
    CONSTRAINT fk_comments_issue FOREIGN KEY (issue_id) REFERENCES issues (id),
    CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users (id)
);

CREATE TABLE issue_activities (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    issue_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    details JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY ix_issue_activities_issue_created (issue_id, created_at),
    CONSTRAINT fk_issue_activities_issue FOREIGN KEY (issue_id) REFERENCES issues (id),
    CONSTRAINT fk_issue_activities_actor FOREIGN KEY (actor_id) REFERENCES users (id)
);

CREATE TABLE sprint_issue_history (
    sprint_id BIGINT NOT NULL,
    issue_id BIGINT NOT NULL,
    final_status VARCHAR(16) NOT NULL,
    final_story_points INT NULL,
    recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (sprint_id, issue_id),
    KEY ix_sprint_issue_history_issue (issue_id),
    CONSTRAINT fk_sprint_issue_history_sprint FOREIGN KEY (sprint_id) REFERENCES sprints (id),
    CONSTRAINT fk_sprint_issue_history_issue FOREIGN KEY (issue_id) REFERENCES issues (id)
);

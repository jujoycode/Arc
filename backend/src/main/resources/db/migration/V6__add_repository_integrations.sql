CREATE TABLE repository_connections (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    project_id BIGINT NOT NULL,
    provider VARCHAR(16) NOT NULL,
    repository_id BIGINT NOT NULL,
    repository_slug VARCHAR(240) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    encrypted_token TEXT NULL,
    encrypted_secret TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_project_repository (project_id, provider, repository_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE TABLE development_links (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    issue_id BIGINT NOT NULL,
    connection_id BIGINT NOT NULL,
    external_id VARCHAR(100) NOT NULL,
    kind VARCHAR(24) NOT NULL,
    title VARCHAR(200) NOT NULL,
    state VARCHAR(24) NOT NULL,
    url VARCHAR(512) NOT NULL,
    source_updated_at DATETIME(6) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_development_link (issue_id, connection_id, external_id),
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (connection_id) REFERENCES repository_connections(id)
);
CREATE TABLE webhook_deliveries (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    connection_id BIGINT NOT NULL,
    delivery_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload MEDIUMTEXT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0,
    last_error VARCHAR(64) NULL,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    UNIQUE KEY uq_webhook_delivery (connection_id, delivery_id),
    KEY ix_delivery_queue (status, next_attempt_at, id),
    FOREIGN KEY (connection_id) REFERENCES repository_connections(id)
);

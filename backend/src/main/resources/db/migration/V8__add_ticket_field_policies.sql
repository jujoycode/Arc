CREATE TABLE ticket_field_policies (
    workspace_id BIGINT NOT NULL PRIMARY KEY,
    revision BIGINT NOT NULL,
    standard_fields JSON NOT NULL,
    custom_fields JSON NOT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_ticket_field_policies_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id)
);

ALTER TABLE issues ADD COLUMN custom_fields JSON NOT NULL DEFAULT (JSON_OBJECT());

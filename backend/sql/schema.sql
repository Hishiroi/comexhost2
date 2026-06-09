-- =====================================================================
-- COMEX Approval / Document Workflow - PostgreSQL schema
-- =====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_level    SMALLINT NOT NULL,
  teacher_rank  SMALLINT NULL,
  mobile_phone  VARCHAR(40) NULL,
  telephone     VARCHAR(40) NULL,
  address       TEXT NULL,
  department_subject VARCHAR(255) NULL,
  position_title VARCHAR(255) NULL,
  employee_id   VARCHAR(100) NULL,
  emergency_contact_name VARCHAR(150) NULL,
  emergency_contact_phone VARCHAR(40) NULL,
  office_room   VARCHAR(120) NULL,
  work_schedule VARCHAR(500) NULL,
  civil_status  VARCHAR(50) NULL,
  nationality   VARCHAR(100) NULL,
  notes_other   TEXT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_users_email UNIQUE (email),
  CONSTRAINT chk_users_role_level CHECK (role_level BETWEEN 1 AND 4),
  CONSTRAINT chk_users_teacher_rank CHECK (teacher_rank IS NULL OR (teacher_rank BETWEEN 1 AND 7))
);

CREATE INDEX IF NOT EXISTS ix_users_role_level ON users(role_level);

DROP TRIGGER IF EXISTS update_users_modtime ON users;
CREATE TRIGGER update_users_modtime
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ---------------------------------------------------------------------
-- files
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
  id             SERIAL PRIMARY KEY,
  uploaded_by    INTEGER NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT NULL,
  more_details   TEXT NULL,
  custom_type_label VARCHAR(255) NULL,
  custom_route   VARCHAR(50) NULL CHECK (custom_route IN ('master_only','principal_only','both')),
  custom_stops   JSONB NULL,
  original_name  VARCHAR(255) NOT NULL,
  stored_name    VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(120) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  current_level  SMALLINT NOT NULL DEFAULT 2,
  status         VARCHAR(50) NOT NULL DEFAULT 'uploaded' CHECK (status IN (
                     'uploaded',
                     'reviewed_by_coordinator',
                     'reviewed_by_master',
                     'finalized',
                     'returned',
                     'exam_principal',
                     'exam_master'
                 )),
  document_type  VARCHAR(50) NOT NULL DEFAULT 'dlp' CHECK (document_type IN ('dlp', 'examination', 'custom')),
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_files_uploaded_by
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_files_current_level
    CHECK (current_level BETWEEN 1 AND 4)
);

CREATE INDEX IF NOT EXISTS ix_files_uploaded_by ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS ix_files_current_level ON files(current_level);
CREATE INDEX IF NOT EXISTS ix_files_status ON files(status);

DROP TRIGGER IF EXISTS update_files_modtime ON files;
CREATE TRIGGER update_files_modtime
BEFORE UPDATE ON files
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- ---------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id           SERIAL PRIMARY KEY,
  file_id      INTEGER NOT NULL,
  user_id      INTEGER NOT NULL,
  role_level   SMALLINT NOT NULL,
  action       VARCHAR(50) NOT NULL DEFAULT 'comment' CHECK (action IN ('comment','revision','forward','finalize')),
  body         TEXT NOT NULL,
  resolved_at  TIMESTAMP NULL,
  resolved_by  INTEGER NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_file_id
    FOREIGN KEY (file_id) REFERENCES files(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_comments_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_comments_resolved_by
    FOREIGN KEY (resolved_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_comments_role_level
    CHECK (role_level BETWEEN 1 AND 4)
);

CREATE INDEX IF NOT EXISTS ix_comments_file_id ON comments(file_id);
CREATE INDEX IF NOT EXISTS ix_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS ix_comments_resolved_by ON comments(resolved_by);




-- ---------------------------------------------------------------------
-- admin seed
-- ---------------------------------------------------------------------
INSERT INTO users (name, email, password_hash, role_level, is_active) VALUES
('Principal Admin', 'admin@comex.local', 'Admin@12345', 4, true);

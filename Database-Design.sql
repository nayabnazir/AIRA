-- CREATE DATABASE IF NOT EXISTS aira_db;
-- USE aira_db;
USE defaultdb;

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('student', 'developer', 'premium', 'admin') DEFAULT 'student',
    account_status ENUM('active', 'inactive', 'blocked') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    project_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_title VARCHAR(180) NOT NULL,
    project_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE uploaded_files (
    file_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NULL,
    feature_type ENUM('srs_generation', 'srs_analysis', 'uml_generation', 'uml_image_description') NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255),
    file_type VARCHAR(80),
    file_size_kb DECIMAL(10,2),
    file_path VARCHAR(500),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL
);

CREATE TABLE srs_documents (
    srs_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NULL,
    source_file_id INT NULL,
    prompt TEXT,
    generated_srs LONGTEXT,
    edited_srs LONGTEXT,
    status ENUM('draft', 'generated', 'edited', 'exported') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL,
    FOREIGN KEY (source_file_id) REFERENCES uploaded_files(file_id) ON DELETE SET NULL
);

CREATE TABLE srs_analysis_reports (
    analysis_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NULL,
    srs_id INT NULL,
    source_file_id INT NULL,
    input_text LONGTEXT,
    ambiguity_score DECIMAL(5,2),
    correctness_score DECIMAL(5,2),
    completeness_score DECIMAL(5,2),
    overall_summary TEXT,
    status ENUM('analyzed', 'edited', 'exported') DEFAULT 'analyzed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL,
    FOREIGN KEY (srs_id) REFERENCES srs_documents(srs_id) ON DELETE SET NULL,
    FOREIGN KEY (source_file_id) REFERENCES uploaded_files(file_id) ON DELETE SET NULL
);

CREATE TABLE srs_analysis_issues (
    issue_id INT AUTO_INCREMENT PRIMARY KEY,
    analysis_id INT NOT NULL,
    issue_type ENUM('ambiguity', 'correctness', 'completeness', 'grammar', 'missing_requirement') NOT NULL,
    severity ENUM('low', 'medium', 'high') DEFAULT 'medium',
    requirement_text TEXT,
    issue_description TEXT NOT NULL,
    suggested_fix TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (analysis_id) REFERENCES srs_analysis_reports(analysis_id) ON DELETE CASCADE
);

CREATE TABLE uml_requests (
    uml_request_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NULL,
    source_srs_id INT NULL,
    source_file_id INT NULL,
    uml_type ENUM('use_case', 'class', 'sequence', 'erd', 'activity') NOT NULL,
    prompt TEXT,
    status ENUM('requested', 'generated', 'edited', 'exported') DEFAULT 'requested',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL,
    FOREIGN KEY (source_srs_id) REFERENCES srs_documents(srs_id) ON DELETE SET NULL,
    FOREIGN KEY (source_file_id) REFERENCES uploaded_files(file_id) ON DELETE SET NULL
);

CREATE TABLE uml_outputs (
    uml_output_id INT AUTO_INCREMENT PRIMARY KEY,
    uml_request_id INT NOT NULL,
    output_title VARCHAR(180),
    diagram_text LONGTEXT,
    diagram_json JSON,
    diagram_image_path VARCHAR(500),
    edited_diagram_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (uml_request_id) REFERENCES uml_requests(uml_request_id) ON DELETE CASCADE
);

CREATE TABLE uml_image_descriptions (
    description_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NULL,
    image_file_id INT NULL,
    user_context TEXT,
    extracted_text LONGTEXT,
    generated_description LONGTEXT,
    edited_description LONGTEXT,
    status ENUM('generated', 'edited', 'exported') DEFAULT 'generated',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL,
    FOREIGN KEY (image_file_id) REFERENCES uploaded_files(file_id) ON DELETE SET NULL
);

CREATE TABLE export_history (
    export_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NULL,
    export_source ENUM('srs_document', 'srs_analysis', 'uml_output', 'uml_image_description') NOT NULL,
    source_record_id INT NOT NULL,
    export_format ENUM('txt', 'pdf', 'png', 'docx') NOT NULL,
    exported_file_name VARCHAR(255),
    exported_file_path VARCHAR(500),
    exported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL
);

CREATE TABLE activity_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NULL,
    activity_type ENUM('login', 'signup', 'srs_generation', 'srs_analysis', 'uml_generation', 'uml_image_description', 'edit', 'download') NOT NULL,
    title VARCHAR(180),
    description TEXT,
    related_table VARCHAR(80),
    related_record_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE SET NULL
);

CREATE TABLE billing_subscriptions (
    billing_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    provider VARCHAR(32) NOT NULL DEFAULT 'stripe',
    provider_customer_id VARCHAR(255),
    provider_subscription_id VARCHAR(255) UNIQUE,
    plan_code ENUM('monthly', 'yearly') NOT NULL,
    status VARCHAR(64) NOT NULL,
    current_period_end DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_uploaded_files_user ON uploaded_files(user_id);
CREATE INDEX idx_srs_documents_user ON srs_documents(user_id);
CREATE INDEX idx_srs_analysis_user ON srs_analysis_reports(user_id);
CREATE INDEX idx_uml_requests_user ON uml_requests(user_id);
CREATE INDEX idx_uml_outputs_request ON uml_outputs(uml_request_id);
CREATE INDEX idx_activity_history_user ON activity_history(user_id);

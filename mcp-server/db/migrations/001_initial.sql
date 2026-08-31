-- Migração 001: schema inicial.
-- Equivalente a schema.sql, mas em formato de migração versionada.

CREATE DATABASE IF NOT EXISTS mestre_pc
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mestre_pc;

CREATE TABLE IF NOT EXISTS mcp_local_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tool VARCHAR(128) NOT NULL,
  action VARCHAR(128) NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tool (tool),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mcp_local_memories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  memory_type VARCHAR(64) NOT NULL,
  content TEXT NOT NULL,
  tags JSON,
  source VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type (memory_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mcp_local_tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM("pending", "running", "done", "failed") DEFAULT "pending",
  payload JSON,
  result TEXT,
  scheduled_at TIMESTAMP NULL,
  executed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_scheduled_at (scheduled_at)
) ENGINE=InnoDB;

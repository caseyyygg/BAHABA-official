CREATE DATABASE IF NOT EXISTS bahaba CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bahaba;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  location VARCHAR(255) NULL,
  region VARCHAR(150) NULL,
  city VARCHAR(100) NULL,
  barangays JSON NULL,
  verification_token_hash CHAR(64) NULL,
  verification_expires_at DATETIME NULL,
  email_verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  barangay VARCHAR(100) NOT NULL,
  severity ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  reporter VARCHAR(150) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'citizen',
  platform VARCHAR(50) NULL,
  description TEXT NOT NULL,
  status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  photo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  barangay VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


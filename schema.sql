-- ════════════════════════════════════════════════════════════════════════════
-- Incident Hive - Complete Database Schema
-- ════════════════════════════════════════════════════════════════════════════
-- Run this file against the incident_hive database.
-- Safe to re-run because it uses IF NOT EXISTS where possible.
-- ════════════════════════════════════════════════════════════════════════════

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ════════════════════════════════════════════════════════════════════════════
-- 1. USERS TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    user_id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255)  UNIQUE NOT NULL,
    password_hash   VARCHAR(255)  NOT NULL,
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    phone_number    VARCHAR(20),

    -- Profile picture for reporter/expert
    profile_picture_url TEXT,

    -- Role: reporter | expert | admin
    role            VARCHAR(20)   NOT NULL DEFAULT 'reporter'
                    CHECK (role IN ('reporter', 'expert', 'admin')),

    -- MFA via 6-digit email OTP
    mfa_enabled     BOOLEAN       NOT NULL DEFAULT false,
    mfa_secret      VARCHAR(255),

    -- Email verification required before login
    email_verified  BOOLEAN       NOT NULL DEFAULT false,

    -- Account state
    account_status  VARCHAR(20)   NOT NULL DEFAULT 'active'
                    CHECK (account_status IN ('active', 'suspended', 'deleted')),

    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email  ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role   ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (account_status);


-- Add profile_picture_url safely if users table already existed before
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Add currency column to incidents if it doesn't exist
ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'LKR';


-- ════════════════════════════════════════════════════════════════════════════
-- 2. EXPERT_PROFILES TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expert_profiles (
    user_id                 UUID          PRIMARY KEY
                            REFERENCES users(user_id) ON DELETE CASCADE,

    credentials             TEXT,
    bio                     TEXT,
    expertise_areas         TEXT[]        NOT NULL DEFAULT '{}',

    availability_status     VARCHAR(20)   NOT NULL DEFAULT 'Available'
                            CHECK (availability_status IN ('Available', 'Unavailable')),

    completed_engagements   INTEGER       NOT NULL DEFAULT 0
                            CHECK (completed_engagements >= 0),

    total_earned            DECIMAL(10,2) NOT NULL DEFAULT 0
                            CHECK (total_earned >= 0),

    created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expert_profiles_availability
    ON expert_profiles (availability_status);

CREATE INDEX IF NOT EXISTS idx_expert_profiles_areas
    ON expert_profiles USING GIN (expertise_areas);


-- ════════════════════════════════════════════════════════════════════════════
-- 3. USER_DEVICES TABLE
-- ════════════════════════════════════════════════════════════════════════════
-- Used for device_id, biometric enabled status, and device-based sessions.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_devices (
    device_id           VARCHAR(255) PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    biometric_enabled   BOOLEAN NOT NULL DEFAULT false,
    device_name         VARCHAR(255),

    last_used_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id
    ON user_devices(user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. INCIDENTS TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS incidents (
    incident_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

    reporter_id        UUID          NOT NULL
                       REFERENCES users(user_id) ON DELETE RESTRICT,

    incident_type      VARCHAR(50)   NOT NULL
                       CHECK (incident_type IN (
                           'Phishing',
                           'Ransomware',
                           'Data Breach',
                           'Account Compromise',
                           'DDoS',
                           'Social Engineering',
                           'Other'
                       )),

    title              VARCHAR(150)  NOT NULL,
    description        TEXT          NOT NULL,

    -- LKR value
    budget             DECIMAL(10,2),
    currency           VARCHAR(10)   NOT NULL DEFAULT 'LKR',

    is_anonymous       BOOLEAN       NOT NULL DEFAULT false,

    status             VARCHAR(20)   NOT NULL DEFAULT 'Open'
                       CHECK (status IN ('Open', 'In Progress', 'Completed', 'Cancelled')),

    -- Bid window automatically closes 7 days after creation
    bid_window_ends_at TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),

    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_reporter_id ON incidents (reporter_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status      ON incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_type        ON incidents (incident_type);
CREATE INDEX IF NOT EXISTS idx_incidents_deleted_at  ON incidents (deleted_at);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at  ON incidents (created_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. BIDS TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bids (
    bid_id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),

    incident_id        UUID           NOT NULL
                       REFERENCES incidents(incident_id) ON DELETE CASCADE,

    expert_id          UUID           NOT NULL
                       REFERENCES users(user_id) ON DELETE RESTRICT,

    proposed_approach  TEXT           NOT NULL,
    estimated_hours    INTEGER        NOT NULL CHECK (estimated_hours > 0),

    -- LKR value
    proposed_fee       DECIMAL(10,2)  NOT NULL CHECK (proposed_fee >= 0),

    status             VARCHAR(20)    NOT NULL DEFAULT 'Pending'
                       CHECK (status IN ('Pending', 'Accepted', 'Declined')),

    submitted_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    -- One expert can only bid once per incident
    UNIQUE (incident_id, expert_id)
);

CREATE INDEX IF NOT EXISTS idx_bids_incident_id ON bids (incident_id);
CREATE INDEX IF NOT EXISTS idx_bids_expert_id   ON bids (expert_id);
CREATE INDEX IF NOT EXISTS idx_bids_status      ON bids (status);


-- ════════════════════════════════════════════════════════════════════════════
-- 6. ATTACHMENTS TABLE
-- ════════════════════════════════════════════════════════════════════════════
-- File metadata only. Actual files are stored in /uploads or S3.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS attachments (
    attachment_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    incident_id    UUID         NOT NULL
                   REFERENCES incidents(incident_id) ON DELETE CASCADE,

    file_name      VARCHAR(255) NOT NULL,
    file_url       TEXT         NOT NULL,
    file_size      INTEGER      NOT NULL CHECK (file_size > 0),
    mime_type      VARCHAR(100) NOT NULL,

    uploaded_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_incident_id
    ON attachments (incident_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 7. NOTIFICATIONS TABLE
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
    notification_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id          UUID         NOT NULL
                     REFERENCES users(user_id) ON DELETE CASCADE,

    type             VARCHAR(50)  NOT NULL
                     CHECK (type IN (
                         'NEW_BID',
                         'BID_ACCEPTED',
                         'BID_DECLINED',
                         'INCIDENT_UPDATE'
                     )),

    title            VARCHAR(100) NOT NULL,
    body             TEXT         NOT NULL,
    reference_id     UUID,

    is_read          BOOLEAN      NOT NULL DEFAULT false,

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read
    ON notifications (user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_type
    ON notifications (type);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
    ON notifications (created_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- 8. NEWS TABLE
-- ════════════════════════════════════════════════════════════════════════════
-- Supports GET /news.
-- AI summaries can be stored here.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS news (
    news_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title          VARCHAR(200) NOT NULL,
    summary        TEXT NOT NULL,

    source_name    VARCHAR(150),
    source_url     TEXT,

    is_ai_summary  BOOLEAN NOT NULL DEFAULT true,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_created_at
    ON news(created_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- 9. TESTIMONIALS TABLE
-- ════════════════════════════════════════════════════════════════════════════
-- Supports GET /testimonials.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS testimonials (
    testimonial_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    author_name    VARCHAR(150) NOT NULL,
    role_label     VARCHAR(100),
    content        TEXT NOT NULL,

    is_active      BOOLEAN NOT NULL DEFAULT true,

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_active
    ON testimonials(is_active);

CREATE INDEX IF NOT EXISTS idx_testimonials_created_at
    ON testimonials(created_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- 10. AUTO-UPDATE TIMESTAMP TRIGGER
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';


-- USERS trigger
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- EXPERT_PROFILES trigger
DROP TRIGGER IF EXISTS update_expert_profiles_updated_at ON expert_profiles;
CREATE TRIGGER update_expert_profiles_updated_at
    BEFORE UPDATE ON expert_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- USER_DEVICES trigger
DROP TRIGGER IF EXISTS update_user_devices_updated_at ON user_devices;
CREATE TRIGGER update_user_devices_updated_at
    BEFORE UPDATE ON user_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- INCIDENTS trigger
DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents;
CREATE TRIGGER update_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- BIDS trigger
DROP TRIGGER IF EXISTS update_bids_updated_at ON bids;
CREATE TRIGGER update_bids_updated_at
    BEFORE UPDATE ON bids
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════════════════════════
-- 11. OPTIONAL SEED DATA FOR NEWS AND TESTIMONIALS
-- ════════════════════════════════════════════════════════════════════════════
-- These are safe sample records for frontend testing.
-- They will only insert if the same title/content does not already exist.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO news (title, summary, source_name, source_url, is_ai_summary)
SELECT
    'Phishing remains a major cyber threat',
    'Recent cyber security updates show that phishing is still one of the most common ways attackers target users. Users should avoid suspicious links and verify senders before sharing personal details.',
    'Incident Hive AI Summary',
    NULL,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM news WHERE title = 'Phishing remains a major cyber threat'
);

INSERT INTO news (title, summary, source_name, source_url, is_ai_summary)
SELECT
    'Protecting accounts with MFA',
    'Multi-factor authentication adds an extra layer of security by requiring users to verify their identity using a second method, such as an email code or biometric login.',
    'Incident Hive AI Summary',
    NULL,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM news WHERE title = 'Protecting accounts with MFA'
);

INSERT INTO testimonials (author_name, role_label, content, is_active)
SELECT
    'Sample Reporter',
    'Small Business Owner',
    'Incident Hive helped me report a suspicious email quickly and connect with an expert.',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM testimonials
    WHERE content = 'Incident Hive helped me report a suspicious email quickly and connect with an expert.'
);

INSERT INTO testimonials (author_name, role_label, content, is_active)
SELECT
    'Sample Expert',
    'Cyber Security Consultant',
    'The platform makes it easier to find relevant cyber incident tasks and support users safely.',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM testimonials
    WHERE content = 'The platform makes it easier to find relevant cyber incident tasks and support users safely.'
);


-- ════════════════════════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════════════════════════
-- Total main tables:
--   1. users
--   2. expert_profiles
--   3. user_devices
--   4. incidents
--   5. bids
--   6. attachments
--   7. notifications
--   8. news
--   9. testimonials
-- ════════════════════════════════════════════════════════════════════════════
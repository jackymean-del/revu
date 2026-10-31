-- PostgreSQL Schema Definition for revU
-- A Configurable Performance Intelligence Platform

-- Enable Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 1. TENANTS & GENERAL ORGANIZATION
-- =========================================================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    logo_url VARCHAR(512),
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    manager_id UUID, -- Setup as nullable, linked to users table once users are initialized
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, code)
);

-- =========================================================================
-- 2. USERS, ROLES, & RBAC SYSTEM
-- =========================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(512),
    status VARCHAR(50) DEFAULT 'active', -- active, suspended, invited
    metadata JSONB DEFAULT '{}'::jsonb,  -- custom attributes like Employee ID, Subject specialization
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email)
);

-- Add manager foreign key constraint to departments now that users table is created
ALTER TABLE departments ADD CONSTRAINT fk_departments_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE user_departments (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT true,
    PRIMARY KEY (user_id, department_id)
);

CREATE TABLE permissions (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name)
);

CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(100) REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- =========================================================================
-- 3. RATING SCALES & RUBRICS CONFIGURATION
-- =========================================================================

CREATE TABLE rating_scales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rating_scale_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rating_scale_id UUID NOT NULL REFERENCES rating_scales(id) ON DELETE CASCADE,
    value NUMERIC(5,2) NOT NULL, -- e.g. 4.00
    label VARCHAR(100) NOT NULL, -- e.g. "Exceeds Expectations"
    points INT NOT NULL,
    description TEXT,
    sort_order INT NOT NULL,
    UNIQUE (rating_scale_id, sort_order)
);

CREATE TABLE rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rubric_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL, -- e.g. "Instructional Clarity"
    description TEXT,
    weight NUMERIC(5,2) DEFAULT 1.00,
    sort_order INT NOT NULL,
    UNIQUE (rubric_id, sort_order)
);

CREATE TABLE rubric_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL, -- e.g. "Highly Effective"
    points NUMERIC(5,2) NOT NULL,
    sort_order INT NOT NULL,
    UNIQUE (rubric_id, sort_order)
);

CREATE TABLE rubric_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criteria_id UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    level_id UUID NOT NULL REFERENCES rubric_levels(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    UNIQUE (criteria_id, level_id)
);

-- =========================================================================
-- 4. TEMPLATE BUILDER SCHEMA
-- =========================================================================

CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- academic, teaching, administrative, support, custom
    status VARCHAR(50) DEFAULT 'draft', -- draft, published, archived
    version INT DEFAULT 1,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE template_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    weight NUMERIC(5,2) DEFAULT 1.00,
    sort_order INT NOT NULL,
    UNIQUE (template_id, sort_order)
);

CREATE TABLE template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES template_sections(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    item_type VARCHAR(50) NOT NULL, -- rubric, rating_scale, text_input, multiple_choice, checkbox, file_upload
    rubric_id UUID REFERENCES rubrics(id) ON DELETE SET NULL,
    rating_scale_id UUID REFERENCES rating_scales(id) ON DELETE SET NULL,
    is_required BOOLEAN DEFAULT false,
    weight NUMERIC(5,2) DEFAULT 1.00,
    sort_order INT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE (section_id, sort_order)
);

-- =========================================================================
-- 5. ASSESSMENT CYCLES & LIVE EVALUATIONS
-- =========================================================================

CREATE TABLE assessment_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'active', -- active, closed, archived
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cycle_id UUID NOT NULL REFERENCES assessment_cycles(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES templates(id),
    subject_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    evaluator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'draft', -- draft, subject_completed, evaluator_completed, signed_off, archived
    score NUMERIC(5,2),
    subject_signature TEXT,
    subject_signed_at TIMESTAMP WITH TIME ZONE,
    evaluator_signature TEXT,
    evaluator_signed_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    template_item_id UUID NOT NULL REFERENCES template_items(id),
    selected_level_id UUID REFERENCES rubric_levels(id),
    selected_value_id UUID REFERENCES rating_scale_values(id),
    numeric_value NUMERIC(10,2),
    text_value TEXT,
    calculated_score NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (assessment_id, template_item_id)
);

CREATE TABLE assessment_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assessment_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(512) NOT NULL,
    file_size INT,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 6. PROFESSIONAL GROWTH PLANS
-- =========================================================================

CREATE TABLE growth_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    cycle_id UUID REFERENCES assessment_cycles(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, active, met, revised
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE growth_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    growth_plan_id UUID NOT NULL REFERENCES growth_plans(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_date DATE,
    status VARCHAR(50) DEFAULT 'not_started', -- not_started, in_progress, achieved, missed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE growth_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    growth_goal_id UUID NOT NULL REFERENCES growth_goals(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, done
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 7. PERFORMANCE INTELLIGENCE & AI ANALYTICS
-- =========================================================================

CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL, -- user, department, cycle, institutional
    target_id UUID NOT NULL,
    insight_type VARCHAR(50) NOT NULL, -- feedback_summary, growth_recommendations, competency_gaps, sentiment
    content JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 8. INDEXES FOR SPEED, PERFORMANCE AND SCALE
-- =========================================================================

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_departments_tenant ON departments(tenant_id);
CREATE INDEX idx_templates_tenant ON templates(tenant_id);
CREATE INDEX idx_assessments_tenant ON assessments(tenant_id);
CREATE INDEX idx_assessments_subject ON assessments(subject_id);
CREATE INDEX idx_assessments_evaluator ON assessments(evaluator_id);
CREATE INDEX idx_assessments_cycle ON assessments(cycle_id);
CREATE INDEX idx_assessment_responses_assessment ON assessment_responses(assessment_id);
CREATE INDEX idx_growth_plans_user ON growth_plans(user_id);
CREATE INDEX idx_ai_insights_target ON ai_insights(target_type, target_id);

-- =========================================================================
-- 9. ROW LEVEL SECURITY (RLS) FOR MULTI-TENANCY
-- =========================================================================

-- Enable RLS on all tenant data tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy: Restricts queries to matches with session parameter 'app.current_tenant_id'
CREATE POLICY tenant_isolation_policy ON users FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON departments FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON roles FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON rating_scales FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON rubrics FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON templates FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON assessment_cycles FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON assessments FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON growth_plans FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_policy ON ai_insights FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

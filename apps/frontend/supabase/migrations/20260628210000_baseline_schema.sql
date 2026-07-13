-- Baseline schema reset generated from the live dev Supabase schema on 2026-06-28.
-- Pre-prod migration squash: this file replaces the historical 001-034 chain.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4 (Homebrew)

-- Started on 2026-06-28 20:41:14 IST

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 32 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- TOC entry 4569 (class 0 OID 0)
-- Dependencies: 32
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 1231 (class 1247 OID 17782)
-- Name: business_model; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_model AS ENUM (
    'B2B',
    'B2C',
    'B2B2C',
    'Marketplace',
    'SaaS',
    'D2C',
    'Other'
);


--
-- TOC entry 1225 (class 1247 OID 17749)
-- Name: company_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.company_stage AS ENUM (
    'Idea',
    'Pre-seed',
    'Seed',
    'Series A',
    'Series B',
    'Series C',
    'Series D+',
    'Pre-IPO',
    'Public',
    'PSU',
    'Bootstrapped'
);


--
-- TOC entry 1228 (class 1247 OID 17772)
-- Name: company_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.company_status AS ENUM (
    'onboarding',
    'active',
    'inactive',
    'suspended'
);


--
-- TOC entry 1252 (class 1247 OID 19084)
-- Name: member_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_status AS ENUM (
    'pending',
    'active',
    'rejected',
    'removed'
);


--
-- TOC entry 1220 (class 1247 OID 17798)
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'founder',
    'co_founder',
    'admin',
    'analyst',
    'engineer',
    'viewer',
    'investor'
);


--
-- TOC entry 469 (class 1255 OID 24910)
-- Name: auth_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select company_id
  from public.user_profiles
  where id = auth.uid()
$$;


--
-- TOC entry 480 (class 1255 OID 27092)
-- Name: can_read_department(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_department(p_company_id uuid, p_department_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.company_members cm
     WHERE cm.company_id = p_company_id
       AND cm.user_id = auth.uid()
       AND cm.status = 'active'
       AND (
         cm.role IN ('founder', 'super_admin')
         OR cm.department_id = p_department_id
         OR EXISTS (
           SELECT 1 FROM public.department_role_grants drg
            WHERE drg.company_id = p_company_id
              AND drg.department_id = p_department_id
              AND drg.role_id = cm.role
              AND drg.read = true
         )
         OR EXISTS (
           SELECT 1 FROM public.department_member_grants dmg
            WHERE dmg.company_id = p_company_id
              AND dmg.department_id = p_department_id
              AND dmg.member_id = cm.id
              AND dmg.read = true
         )
       )
  )
$$;


--
-- TOC entry 482 (class 1255 OID 30389)
-- Name: check_level1_node_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_level1_node_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.node_level = 'level1' THEN
    IF (
      SELECT COUNT(*)
        FROM public.department_bdt_nodes
       WHERE department_id = NEW.department_id
         AND node_level = 'level1'
         AND id IS DISTINCT FROM NEW.id
    ) >= 6 THEN
      RAISE EXCEPTION 'department_level1_limit: Department cannot have more than 6 Level-1 nodes';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- TOC entry 481 (class 1255 OID 27157)
-- Name: clear_company_departments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_company_departments(p_company_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.departments WHERE company_id = p_company_id;
END;
$$;


--
-- TOC entry 478 (class 1255 OID 27090)
-- Name: current_member_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_member_id(p_company_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT cm.id
    FROM public.company_members cm
   WHERE cm.company_id = p_company_id
     AND cm.user_id = auth.uid()
     AND cm.status = 'active'
   LIMIT 1
$$;


--
-- TOC entry 479 (class 1255 OID 27091)
-- Name: current_member_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_member_role(p_company_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT cm.role
    FROM public.company_members cm
   WHERE cm.company_id = p_company_id
     AND cm.user_id = auth.uid()
     AND cm.status = 'active'
   LIMIT 1
$$;


--
-- TOC entry 471 (class 1255 OID 25029)
-- Name: current_user_company_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_company_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id FROM company_members WHERE user_id = auth.uid();
$$;


--
-- TOC entry 464 (class 1255 OID 17881)
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, first_name, last_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    'founder'
  );
  RETURN NEW;
END;
$$;


--
-- TOC entry 484 (class 1255 OID 30400)
-- Name: import_bdt_departments_from_json(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_bdt_departments_from_json(p_company_id uuid, p_departments jsonb, p_selection jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  dept JSONB;
  v_department_id UUID;
  v_sort INTEGER := 0;
  node JSONB;
  v_node_sort INTEGER;
  v_source_key TEXT;
BEGIN
  PERFORM public.clear_company_departments(p_company_id);

  UPDATE public.companies
  SET bdt_onboarding_selection = coalesce(p_selection, '{}'::jsonb),
      updated_at = NOW()
  WHERE id = p_company_id;

  FOR dept IN SELECT * FROM jsonb_array_elements(coalesce(p_departments, '[]'::jsonb))
  LOOP
    v_source_key := coalesce(dept->>'source_key', dept->>'id');

    INSERT INTO public.departments (
      company_id, source_key, label, slug, domain, cluster, score, metrics, color, sort_order
    )
    VALUES (
      p_company_id,
      v_source_key,
      coalesce(dept->>'label', 'Department'),
      public.slugify_department_label(coalesce(dept->>'label', 'department')),
      coalesce(dept->>'domain', 'build'),
      coalesce(dept->>'cluster', ''),
      coalesce((dept->>'score')::INTEGER, 75),
      coalesce(dept->'metrics', '{"performance":75,"efficiency":75,"capacity":75,"alignment":75,"risk":25}'::jsonb),
      dept->>'color',
      v_sort
    )
    ON CONFLICT (company_id, slug) DO UPDATE
      SET source_key = EXCLUDED.source_key,
          label = EXCLUDED.label,
          domain = EXCLUDED.domain,
          cluster = EXCLUDED.cluster,
          score = EXCLUDED.score,
          metrics = EXCLUDED.metrics,
          color = EXCLUDED.color,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
    RETURNING id INTO v_department_id;

    v_node_sort := 0;
    IF dept ? 'internalNodes' AND jsonb_typeof(dept->'internalNodes') = 'array' THEN
      FOR node IN SELECT * FROM jsonb_array_elements(dept->'internalNodes')
      LOOP
        PERFORM public.insert_bdt_node_from_json(
          p_company_id, v_department_id, NULL, node, v_node_sort
        );
        v_node_sort := v_node_sort + 1;
      END LOOP;
    END IF;

    v_sort := v_sort + 1;
  END LOOP;
END;
$$;


--
-- TOC entry 4570 (class 0 OID 0)
-- Dependencies: 484
-- Name: FUNCTION import_bdt_departments_from_json(p_company_id uuid, p_departments jsonb, p_selection jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.import_bdt_departments_from_json(p_company_id uuid, p_departments jsonb, p_selection jsonb) IS 'Replace company BDT with a department payload. Called by POST /api/companies during seeding.';


--
-- TOC entry 483 (class 1255 OID 30391)
-- Name: insert_bdt_node_from_json(uuid, uuid, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_bdt_node_from_json(p_company_id uuid, p_department_id uuid, p_parent_node_id uuid, p_node jsonb, p_sort_order integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_node_id UUID;
  v_type TEXT;
  v_node_level TEXT;
  v_mapped_category TEXT;
  v_meta JSONB;
  child JSONB;
  v_child_sort INTEGER := 0;
BEGIN
  v_type := coalesce(p_node->>'type', 'team');
  v_node_level := p_node->>'nodeLevel';
  v_mapped_category := p_node->>'mappedUniversalCategory';

  v_meta := coalesce(p_node->'metadata', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'owner', p_node->>'owner',
      'dueDate', p_node->>'dueDate',
      'status', p_node->>'status',
      'output', p_node->>'output',
      'metricImpact', p_node->>'metricImpact',
      'dependencies', p_node->'dependencies',
      'workflowSteps', p_node->'workflowSteps',
      'interrelatedDepartments', p_node->'interrelatedDepartments',
      'members', p_node->'members',
      'memberCount', p_node->'memberCount',
      'projectDetails', p_node->'projectDetails',
      'signalDetails', p_node->'signalDetails',
      'decisionDetails', p_node->'decisionDetails',
      'metricDetails', p_node->'metricDetails',
      'actionDetails', p_node->'actionDetails'
    ));

  INSERT INTO public.department_bdt_nodes (
    company_id, department_id, parent_node_id, source_key, label,
    node_type, node_level, mapped_universal_category,
    score, sort_order, metadata
  )
  VALUES (
    p_company_id,
    p_department_id,
    p_parent_node_id,
    p_node->>'id',
    coalesce(p_node->>'label', 'Node'),
    v_type,
    v_node_level,
    v_mapped_category,
    coalesce((p_node->>'score')::INTEGER, 75),
    p_sort_order,
    v_meta
  )
  RETURNING id INTO v_node_id;

  -- Only metric nodes keep a side table; all other detail lives in v_meta above.
  IF v_type = 'metric' THEN
    INSERT INTO public.department_metric_links (node_id, metric_key, metadata)
    VALUES (v_node_id, p_node->>'metricKey', v_meta)
    ON CONFLICT (node_id) DO UPDATE
      SET metric_key = EXCLUDED.metric_key, metadata = EXCLUDED.metadata;
  END IF;

  FOR child IN SELECT * FROM jsonb_array_elements(coalesce(p_node->'children', '[]'::jsonb))
  LOOP
    PERFORM public.insert_bdt_node_from_json(
      p_company_id, p_department_id, v_node_id, child, v_child_sort
    );
    v_child_sort := v_child_sort + 1;
  END LOOP;

  RETURN v_node_id;
END;
$$;


--
-- TOC entry 470 (class 1255 OID 25021)
-- Name: latest_metrics_for_company(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.latest_metrics_for_company(p_company_id uuid) RETURNS TABLE(metric_key text, value numeric, unit text, period_end date)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select distinct on (nm.metric_key)
    nm.metric_key,
    nm.value,
    nm.unit,
    nm.period_end
  from public.normalized_metrics nm
  where nm.company_id = p_company_id
    and nm.superseded_by is null
    and nm.superseded_by_metric_id is null
  order by nm.metric_key, nm.period_end desc
$$;


--
-- TOC entry 466 (class 1255 OID 17965)
-- Name: my_company_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.my_company_ids() RETURNS SETOF uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id FROM public.company_members WHERE user_id = auth.uid();
$$;


--
-- TOC entry 476 (class 1255 OID 26377)
-- Name: prevent_profile_authority_self_edit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_profile_authority_self_edit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        IF auth.uid() = NEW.id
          AND auth.role() = 'authenticated'
          AND (
            NEW.company_id IS DISTINCT FROM OLD.company_id
            OR NEW.role IS DISTINCT FROM OLD.role
            OR NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed
          )
        THEN
          RAISE EXCEPTION 'company_id, role, and onboarding_completed are server-managed';
        END IF;

        RETURN NEW;
      END;
      $$;


--
-- TOC entry 465 (class 1255 OID 17933)
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


--
-- TOC entry 477 (class 1255 OID 26996)
-- Name: slugify_department_label(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.slugify_department_label(p_label text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(p_label, 'department')), '[^a-z0-9]+', '-', 'g'))
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 338 (class 1259 OID 26455)
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 358 (class 1259 OID 30230)
-- Name: bdt_goal_metric_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bdt_goal_metric_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_id uuid NOT NULL,
    metric_id uuid NOT NULL,
    company_id uuid NOT NULL,
    contribution_weight numeric DEFAULT 1.0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bdt_goal_metric_links_contribution_weight_check CHECK (((contribution_weight > (0)::numeric) AND (contribution_weight <= 1.0)))
);


--
-- TOC entry 357 (class 1259 OID 30203)
-- Name: bdt_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bdt_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    horizon text NOT NULL,
    owner_id uuid,
    created_by uuid,
    local_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bdt_goals_horizon_check CHECK ((horizon = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'quarterly'::text, 'annual'::text, 'round'::text, '3yr'::text, 'long_term'::text])))
);


--
-- TOC entry 356 (class 1259 OID 30183)
-- Name: bdt_metric_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bdt_metric_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric_id uuid NOT NULL,
    company_id uuid NOT NULL,
    old_value numeric NOT NULL,
    new_value numeric NOT NULL,
    reason text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 359 (class 1259 OID 30255)
-- Name: bdt_metric_impacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bdt_metric_impacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    metric_id uuid NOT NULL,
    task_id text,
    decision_id text,
    project_ref text,
    estimated_delta numeric NOT NULL,
    estimated_confidence numeric NOT NULL,
    actual_delta numeric,
    variance numeric,
    created_by uuid,
    local_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT bdt_metric_impacts_estimated_confidence_check CHECK (((estimated_confidence >= (0)::numeric) AND (estimated_confidence <= (100)::numeric))),
    CONSTRAINT resolved_requires_actual CHECK (((resolved_at IS NULL) OR (actual_delta IS NOT NULL)))
);


--
-- TOC entry 355 (class 1259 OID 30153)
-- Name: bdt_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bdt_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid,
    name text NOT NULL,
    metric_key text,
    scope text NOT NULL,
    value numeric DEFAULT 0 NOT NULL,
    target numeric DEFAULT 0 NOT NULL,
    baseline numeric DEFAULT 0 NOT NULL,
    unit text DEFAULT ''::text NOT NULL,
    higher_is_better boolean DEFAULT true NOT NULL,
    trend text DEFAULT 'flat'::text NOT NULL,
    alert_threshold numeric,
    local_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bdt_metrics_scope_check CHECK ((scope = ANY (ARRAY['company'::text, 'department'::text]))),
    CONSTRAINT bdt_metrics_trend_check CHECK ((trend = ANY (ARRAY['up'::text, 'down'::text, 'flat'::text])))
);


--
-- TOC entry 335 (class 1259 OID 25481)
-- Name: classification_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classification_cache (
    cache_key text NOT NULL,
    normalized_label_hash text NOT NULL,
    value_type_sig text NOT NULL,
    siblings_hash text NOT NULL,
    layout_context_hash text NOT NULL,
    proposed_role text NOT NULL,
    proposed_key text,
    confidence numeric(3,2) NOT NULL,
    taxonomy_version text NOT NULL,
    prompt_version text NOT NULL,
    llm_model text NOT NULL,
    hits integer DEFAULT 1 NOT NULL,
    plaintext_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_hit_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT classification_cache_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- TOC entry 310 (class 1259 OID 17826)
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    industry_id text,
    stage public.company_stage DEFAULT 'Seed'::public.company_stage NOT NULL,
    country text DEFAULT 'India'::text NOT NULL,
    founded_year integer,
    description text,
    website text,
    logo_url text,
    mrr_usd numeric DEFAULT 0,
    employees integer DEFAULT 1,
    annual_revenue numeric DEFAULT 0,
    burn_rate_usd numeric DEFAULT 0,
    runway_months integer DEFAULT 0,
    valuation text,
    target_market text,
    business_model public.business_model,
    problem_solved text,
    usp text,
    competitors text[],
    status public.company_status DEFAULT 'onboarding'::public.company_status NOT NULL,
    is_public boolean DEFAULT false,
    stock_symbol text,
    offset_3d jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    subdomain_id text,
    currency text,
    bdt_onboarding_selection jsonb DEFAULT '{}'::jsonb NOT NULL,
    bdt_company_size text DEFAULT 'standard'::text,
    strategic_score numeric,
    CONSTRAINT companies_bdt_company_size_check CHECK ((bdt_company_size = ANY (ARRAY['micro'::text, 'msme'::text, 'standard'::text, 'enterprise'::text])))
);


--
-- TOC entry 4571 (class 0 OID 0)
-- Dependencies: 310
-- Name: COLUMN companies.bdt_onboarding_selection; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.bdt_onboarding_selection IS 'BDT onboarding payload: { source_keys: string[], custom_labels: string[], imported_at: timestamptz }';


--
-- TOC entry 313 (class 1259 OID 17883)
-- Name: company_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.member_status DEFAULT 'active'::public.member_status NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    department_id uuid
);


--
-- TOC entry 329 (class 1259 OID 25309)
-- Name: company_metric_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_metric_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    metric_key text NOT NULL,
    display_name text NOT NULL,
    parent_key text,
    description text,
    metric_kind text,
    aggregation_method text,
    unit_default text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_metric_definitions_aggregation_method_check CHECK ((aggregation_method = ANY (ARRAY['sum'::text, 'avg'::text, 'last'::text, 'min'::text, 'max'::text, 'none'::text]))),
    CONSTRAINT company_metric_definitions_metric_kind_check CHECK ((metric_kind = ANY (ARRAY['flow'::text, 'stock'::text, 'ratio'::text, 'count'::text, 'derived'::text])))
);


--
-- TOC entry 323 (class 1259 OID 24911)
-- Name: data_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_sync_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT data_sources_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'error'::text]))),
    CONSTRAINT data_sources_type_check CHECK ((type = ANY (ARRAY['excel'::text, 'manual'::text])))
);


--
-- TOC entry 341 (class 1259 OID 26849)
-- Name: department_bdt_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_bdt_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid NOT NULL,
    parent_node_id uuid,
    source_key text,
    label text NOT NULL,
    node_type text NOT NULL,
    score integer DEFAULT 75 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_kind text,
    node_level text,
    mapped_universal_category text,
    CONSTRAINT department_bdt_nodes_branch_kind_check CHECK ((branch_kind = ANY (ARRAY['purpose_scope'::text, 'objectives_okrs'::text, 'core_workstreams'::text, 'metrics_health'::text, 'resources_capacity'::text, 'dependencies'::text, 'risks_controls'::text, 'decision_queue'::text]))),
    CONSTRAINT department_bdt_nodes_mapped_universal_category_check CHECK ((mapped_universal_category = ANY (ARRAY['purpose_scope'::text, 'objectives_okrs'::text, 'core_workstreams'::text, 'metrics_health'::text, 'resources_capacity'::text, 'dependencies'::text, 'risks_controls'::text, 'decision_queue'::text]))),
    CONSTRAINT department_bdt_nodes_node_level_check CHECK ((node_level = ANY (ARRAY['level1'::text, 'branch'::text, 'internal'::text, 'action'::text]))),
    CONSTRAINT department_bdt_nodes_node_type_check CHECK ((node_type = ANY (ARRAY['team'::text, 'process'::text, 'project'::text, 'resource'::text, 'decision'::text, 'risk'::text, 'metric'::text, 'branch'::text, 'action'::text, 'signal'::text]))),
    CONSTRAINT department_bdt_nodes_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- TOC entry 4572 (class 0 OID 0)
-- Dependencies: 341
-- Name: COLUMN department_bdt_nodes.mapped_universal_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.department_bdt_nodes.mapped_universal_category IS 'Hidden universal taxonomy for AI/analytics — set only on node_level=''level1'' nodes. Maps dept-specific visible label to a standard BDT branch category.';


--
-- TOC entry 344 (class 1259 OID 27049)
-- Name: department_member_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_member_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid NOT NULL,
    member_id uuid NOT NULL,
    read boolean DEFAULT false NOT NULL,
    write boolean DEFAULT false NOT NULL,
    delete boolean DEFAULT false NOT NULL,
    manage boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 342 (class 1259 OID 26962)
-- Name: department_metric_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_metric_links (
    node_id uuid NOT NULL,
    metric_key text,
    company_metric_definition_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- TOC entry 345 (class 1259 OID 27158)
-- Name: department_node_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_node_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid NOT NULL,
    node_id uuid NOT NULL,
    company_member_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 343 (class 1259 OID 27008)
-- Name: department_role_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_role_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid NOT NULL,
    role_id text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    write boolean DEFAULT false NOT NULL,
    delete boolean DEFAULT false NOT NULL,
    manage boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 340 (class 1259 OID 26819)
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    source_key text,
    label text NOT NULL,
    slug text NOT NULL,
    domain text NOT NULL,
    cluster text DEFAULT ''::text NOT NULL,
    score integer DEFAULT 75 NOT NULL,
    metrics jsonb DEFAULT '{"risk": 25, "capacity": 75, "alignment": 75, "efficiency": 75, "performance": 75}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    color text,
    CONSTRAINT departments_domain_check CHECK ((domain = ANY (ARRAY['direction'::text, 'build'::text, 'delivery'::text, 'market'::text, 'control'::text, 'people'::text]))),
    CONSTRAINT departments_score_check CHECK (((score >= 0) AND (score <= 100)))
);


--
-- TOC entry 333 (class 1259 OID 25430)
-- Name: extraction_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    run_id uuid NOT NULL,
    source_locator jsonb NOT NULL,
    source_label text,
    role text NOT NULL,
    proposed_key text,
    final_key text,
    confidence numeric(3,2),
    stage text NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    llm_model text,
    prompt_version text,
    reasoning text,
    overridden_by uuid,
    overridden_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT extraction_decisions_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT extraction_decisions_role_check CHECK ((role = ANY (ARRAY['metric'::text, 'period'::text, 'unit_label'::text, 'scale_label'::text, 'value_field'::text, 'exclude'::text, 'entity_field'::text]))),
    CONSTRAINT extraction_decisions_stage_check CHECK ((stage = ANY (ARRAY['known_source'::text, 'profile'::text, 'dictionary'::text, 'fuzzy'::text, 'cache'::text, 'llm'::text, 'manual'::text]))),
    CONSTRAINT extraction_decisions_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'pending_review'::text, 'overridden'::text, 'rejected'::text])))
);


--
-- TOC entry 332 (class 1259 OID 25394)
-- Name: extraction_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extraction_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_id uuid NOT NULL,
    region_id uuid,
    job_id uuid,
    parser_version text NOT NULL,
    taxonomy_version text NOT NULL,
    classifier_version text NOT NULL,
    prompt_version text,
    status text NOT NULL,
    is_current boolean DEFAULT false NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT extraction_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'complete'::text, 'failed'::text])))
);


--
-- TOC entry 309 (class 1259 OID 17815)
-- Name: industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.industries (
    id text NOT NULL,
    label text NOT NULL,
    description text,
    color text DEFAULT '#ffffff'::text NOT NULL,
    position_3d jsonb DEFAULT '{"x": 0, "y": 0, "z": 0}'::jsonb NOT NULL,
    bubble_radius numeric DEFAULT 10 NOT NULL,
    tags text[] DEFAULT '{}'::text[]
);


--
-- TOC entry 324 (class 1259 OID 24936)
-- Name: ingestion_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    source_id uuid NOT NULL,
    storage_path text NOT NULL,
    checksum text NOT NULL,
    byte_size bigint NOT NULL,
    original_name text NOT NULL,
    uploaded_by uuid NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 325 (class 1259 OID 24963)
-- Name: ingestion_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_id uuid NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    locked_until timestamp with time zone,
    locked_by text,
    last_error text,
    record_count integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingestion_jobs_kind_check CHECK ((kind = 'normalize'::text)),
    CONSTRAINT ingestion_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text])))
);


--
-- TOC entry 336 (class 1259 OID 25570)
-- Name: integration_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_connections (
    company_id uuid NOT NULL,
    integration_id text NOT NULL,
    account_name text,
    sandbox_mode boolean DEFAULT false NOT NULL,
    access_token_enc text,
    refresh_token_enc text,
    token_expires_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    connected_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 318 (class 1259 OID 19181)
-- Name: investor_pipeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_pipeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    vc_firm_id uuid,
    custom_name text,
    custom_firm text,
    partner_name text,
    status text DEFAULT 'prospect'::text NOT NULL,
    last_contact date,
    next_followup date,
    ask_amount text,
    notes text,
    warm_intro boolean DEFAULT false,
    intro_by text,
    shared_metrics text[],
    tags text[],
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT investor_pipeline_status_check CHECK ((status = ANY (ARRAY['prospect'::text, 'contacted'::text, 'in-discussion'::text, 'term-sheet'::text, 'committed'::text, 'passed'::text])))
);


--
-- TOC entry 319 (class 1259 OID 19210)
-- Name: investor_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investor_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    period text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    highlights text[],
    asks text[],
    metrics jsonb DEFAULT '{}'::jsonb,
    sent_to uuid[],
    sent_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT investor_updates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text])))
);


--
-- TOC entry 316 (class 1259 OID 19126)
-- Name: join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.join_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    requested_role text DEFAULT 'viewer'::text NOT NULL,
    message text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    assigned_role text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 321 (class 1259 OID 19255)
-- Name: mentor_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mentor_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mentor_id uuid NOT NULL,
    company_id uuid NOT NULL,
    session_date date NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    agenda text[],
    actions text[],
    follow_ups text[],
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT mentor_sessions_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- TOC entry 328 (class 1259 OID 25288)
-- Name: metric_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metric_definitions (
    metric_key text NOT NULL,
    tier text NOT NULL,
    parent_key text,
    display_name text NOT NULL,
    description text,
    metric_kind text NOT NULL,
    aggregation_method text NOT NULL,
    default_period_grain text NOT NULL,
    polarity text NOT NULL,
    unit_default text NOT NULL,
    twin_node_hint text,
    is_derived boolean DEFAULT false NOT NULL,
    derivation_expr text,
    taxonomy_version text DEFAULT '2026-05-01'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT metric_definitions_aggregation_method_check CHECK ((aggregation_method = ANY (ARRAY['sum'::text, 'avg'::text, 'last'::text, 'min'::text, 'max'::text, 'none'::text]))),
    CONSTRAINT metric_definitions_default_period_grain_check CHECK ((default_period_grain = ANY (ARRAY['month'::text, 'quarter'::text, 'year'::text, 'point_in_time'::text]))),
    CONSTRAINT metric_definitions_metric_kind_check CHECK ((metric_kind = ANY (ARRAY['flow'::text, 'stock'::text, 'ratio'::text, 'count'::text, 'derived'::text]))),
    CONSTRAINT metric_definitions_polarity_check CHECK ((polarity = ANY (ARRAY['positive_good'::text, 'negative_good'::text, 'neutral'::text]))),
    CONSTRAINT metric_definitions_tier_check CHECK ((tier = ANY (ARRAY['canonical'::text, 'extension'::text])))
);


--
-- TOC entry 337 (class 1259 OID 25717)
-- Name: metric_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metric_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    integration_id text NOT NULL,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- TOC entry 326 (class 1259 OID 24990)
-- Name: normalized_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.normalized_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    metric_key text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    value numeric NOT NULL,
    unit text NOT NULL,
    source_id uuid NOT NULL,
    job_id uuid NOT NULL,
    superseded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    run_id uuid,
    decision_id uuid,
    source_profile_id uuid,
    confidence numeric(3,2),
    scenario text DEFAULT 'actual'::text NOT NULL,
    scale numeric DEFAULT 1 NOT NULL,
    currency text,
    source_sheet_name text,
    source_cell_ref text,
    source_locator jsonb,
    superseded_by_metric_id uuid,
    CONSTRAINT normalized_metrics_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))
);


--
-- TOC entry 314 (class 1259 OID 17908)
-- Name: onboarding_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    current_step integer DEFAULT 1 NOT NULL,
    steps_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 331 (class 1259 OID 25359)
-- Name: raw_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_id uuid NOT NULL,
    job_id uuid NOT NULL,
    raw_sheet_id uuid,
    sheet_idx integer DEFAULT 0 NOT NULL,
    sheet_name text NOT NULL,
    region_idx integer NOT NULL,
    bbox text,
    layout jsonb NOT NULL,
    raw_grid jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 330 (class 1259 OID 25328)
-- Name: raw_workbook_sheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_workbook_sheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_id uuid NOT NULL,
    job_id uuid NOT NULL,
    sheet_idx integer NOT NULL,
    sheet_name text NOT NULL,
    max_row integer DEFAULT 0 NOT NULL,
    max_column integer DEFAULT 0 NOT NULL,
    raw_grid jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 346 (class 1259 OID 27195)
-- Name: reference_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    industry_id text,
    subdomain_id text,
    name text,
    source_url text NOT NULL,
    canonical_url text,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    last_error text,
    generated_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    classification text,
    scores jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT reference_companies_classification_check CHECK ((classification = ANY (ARRAY['competitor'::text, 'customer'::text, 'collaborator'::text]))),
    CONSTRAINT reference_companies_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'ready'::text, 'failed'::text])))
);


--
-- TOC entry 349 (class 1259 OID 27284)
-- Name: reference_company_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_company_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_company_id uuid NOT NULL,
    company_id uuid NOT NULL,
    kind text DEFAULT 'generate'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    locked_until timestamp with time zone,
    locked_by text,
    last_error text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reference_company_jobs_kind_check CHECK ((kind = ANY (ARRAY['generate'::text, 'refresh'::text, 'classify'::text]))),
    CONSTRAINT reference_company_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text])))
);


--
-- TOC entry 347 (class 1259 OID 27235)
-- Name: reference_company_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_company_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_company_id uuid NOT NULL,
    parent_node_id uuid,
    node_kind text NOT NULL,
    label text NOT NULL,
    summary text,
    node_type text,
    relevance integer DEFAULT 75 NOT NULL,
    confidence numeric DEFAULT 0.7 NOT NULL,
    color text,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_dynamic boolean DEFAULT false NOT NULL,
    source text DEFAULT 'ai'::text NOT NULL,
    created_by uuid,
    CONSTRAINT reference_company_nodes_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT reference_company_nodes_node_kind_check CHECK ((node_kind = ANY (ARRAY['root'::text, 'branch'::text, 'action'::text]))),
    CONSTRAINT reference_company_nodes_node_type_check CHECK ((node_type = ANY (ARRAY['information'::text, 'metric'::text, 'signal'::text, 'relationship'::text, 'evidence'::text, 'decision'::text]))),
    CONSTRAINT reference_company_nodes_relevance_check CHECK (((relevance >= 0) AND (relevance <= 100))),
    CONSTRAINT reference_company_nodes_source_check CHECK ((source = ANY (ARRAY['ai'::text, 'manual'::text])))
);


--
-- TOC entry 348 (class 1259 OID 27263)
-- Name: reference_company_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_company_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reference_company_id uuid NOT NULL,
    node_id uuid,
    url text NOT NULL,
    title text,
    snippet text,
    retrieved_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 311 (class 1259 OID 17852)
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    company_id uuid,
    is_system boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    base_role_id text,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 334 (class 1259 OID 25462)
-- Name: source_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    signature text NOT NULL,
    name text NOT NULL,
    recipe jsonb NOT NULL,
    last_used_at timestamp with time zone,
    use_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 327 (class 1259 OID 25215)
-- Name: subdomains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subdomains (
    id text NOT NULL,
    industry_id text NOT NULL,
    label text NOT NULL,
    description text,
    orbit_index integer DEFAULT 0 NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 312 (class 1259 OID 17860)
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    company_id uuid,
    role text DEFAULT 'viewer'::text NOT NULL,
    first_name text,
    last_name text,
    title text,
    avatar_url text,
    onboarding_completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 317 (class 1259 OID 19170)
-- Name: vc_firms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vc_firms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    short_name text,
    region text DEFAULT 'India'::text NOT NULL,
    hq_city text,
    website text,
    focus_stage text[],
    sectors text[],
    avg_ticket text,
    total_fund text,
    linkedin text,
    logo_url text,
    notable_investments text[],
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 320 (class 1259 OID 19234)
-- Name: vc_mentors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vc_mentors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    role text,
    company text,
    linkedin text,
    expertise text[],
    availability text DEFAULT 'monthly'::text,
    notes text,
    added_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- TOC entry 315 (class 1259 OID 19099)
-- Name: workspace_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'base64url'::text) NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    email text,
    created_by uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    max_uses integer DEFAULT 1 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 4154 (class 2606 OID 26462)
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (name);


--
-- TOC entry 4208 (class 2606 OID 30242)
-- Name: bdt_goal_metric_links bdt_goal_metric_links_goal_id_metric_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goal_metric_links
    ADD CONSTRAINT bdt_goal_metric_links_goal_id_metric_id_key UNIQUE (goal_id, metric_id);


--
-- TOC entry 4210 (class 2606 OID 30240)
-- Name: bdt_goal_metric_links bdt_goal_metric_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goal_metric_links
    ADD CONSTRAINT bdt_goal_metric_links_pkey PRIMARY KEY (id);


--
-- TOC entry 4205 (class 2606 OID 30213)
-- Name: bdt_goals bdt_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goals
    ADD CONSTRAINT bdt_goals_pkey PRIMARY KEY (id);


--
-- TOC entry 4202 (class 2606 OID 30191)
-- Name: bdt_metric_history bdt_metric_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metric_history
    ADD CONSTRAINT bdt_metric_history_pkey PRIMARY KEY (id);


--
-- TOC entry 4214 (class 2606 OID 30265)
-- Name: bdt_metric_impacts bdt_metric_impacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metric_impacts
    ADD CONSTRAINT bdt_metric_impacts_pkey PRIMARY KEY (id);


--
-- TOC entry 4198 (class 2606 OID 30170)
-- Name: bdt_metrics bdt_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metrics
    ADD CONSTRAINT bdt_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 4147 (class 2606 OID 25491)
-- Name: classification_cache classification_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classification_cache
    ADD CONSTRAINT classification_cache_pkey PRIMARY KEY (cache_key);


--
-- TOC entry 4046 (class 2606 OID 17844)
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- TOC entry 4048 (class 2606 OID 17846)
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- TOC entry 4058 (class 2606 OID 17892)
-- Name: company_members company_members_company_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_user_id_key UNIQUE (company_id, user_id);


--
-- TOC entry 4060 (class 2606 OID 17890)
-- Name: company_members company_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_pkey PRIMARY KEY (id);


--
-- TOC entry 4118 (class 2606 OID 25321)
-- Name: company_metric_definitions company_metric_definitions_company_id_metric_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_metric_definitions
    ADD CONSTRAINT company_metric_definitions_company_id_metric_key_key UNIQUE (company_id, metric_key);


--
-- TOC entry 4120 (class 2606 OID 25319)
-- Name: company_metric_definitions company_metric_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_metric_definitions
    ADD CONSTRAINT company_metric_definitions_pkey PRIMARY KEY (id);


--
-- TOC entry 4093 (class 2606 OID 24924)
-- Name: data_sources data_sources_company_id_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_company_id_type_key UNIQUE (company_id, type);


--
-- TOC entry 4095 (class 2606 OID 24922)
-- Name: data_sources data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_pkey PRIMARY KEY (id);


--
-- TOC entry 4161 (class 2606 OID 26863)
-- Name: department_bdt_nodes department_bdt_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_bdt_nodes
    ADD CONSTRAINT department_bdt_nodes_pkey PRIMARY KEY (id);


--
-- TOC entry 4172 (class 2606 OID 27062)
-- Name: department_member_grants department_member_grants_company_id_department_id_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member_grants
    ADD CONSTRAINT department_member_grants_company_id_department_id_member_id_key UNIQUE (company_id, department_id, member_id);


--
-- TOC entry 4174 (class 2606 OID 27060)
-- Name: department_member_grants department_member_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member_grants
    ADD CONSTRAINT department_member_grants_pkey PRIMARY KEY (id);


--
-- TOC entry 4165 (class 2606 OID 26969)
-- Name: department_metric_links department_metric_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_metric_links
    ADD CONSTRAINT department_metric_links_pkey PRIMARY KEY (node_id);


--
-- TOC entry 4177 (class 2606 OID 27166)
-- Name: department_node_members department_node_members_node_id_company_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_node_members
    ADD CONSTRAINT department_node_members_node_id_company_member_id_key UNIQUE (node_id, company_member_id);


--
-- TOC entry 4179 (class 2606 OID 27164)
-- Name: department_node_members department_node_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_node_members
    ADD CONSTRAINT department_node_members_pkey PRIMARY KEY (id);


--
-- TOC entry 4167 (class 2606 OID 27023)
-- Name: department_role_grants department_role_grants_company_id_department_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_role_grants
    ADD CONSTRAINT department_role_grants_company_id_department_id_role_id_key UNIQUE (company_id, department_id, role_id);


--
-- TOC entry 4169 (class 2606 OID 27021)
-- Name: department_role_grants department_role_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_role_grants
    ADD CONSTRAINT department_role_grants_pkey PRIMARY KEY (id);


--
-- TOC entry 4156 (class 2606 OID 26836)
-- Name: departments departments_company_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_slug_key UNIQUE (company_id, slug);


--
-- TOC entry 4158 (class 2606 OID 26834)
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- TOC entry 4138 (class 2606 OID 25443)
-- Name: extraction_decisions extraction_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_decisions
    ADD CONSTRAINT extraction_decisions_pkey PRIMARY KEY (id);


--
-- TOC entry 4132 (class 2606 OID 25406)
-- Name: extraction_runs extraction_runs_file_id_region_id_parser_version_taxonomy_v_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_runs
    ADD CONSTRAINT extraction_runs_file_id_region_id_parser_version_taxonomy_v_key UNIQUE (file_id, region_id, parser_version, taxonomy_version, classifier_version, prompt_version);


--
-- TOC entry 4134 (class 2606 OID 25404)
-- Name: extraction_runs extraction_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_runs
    ADD CONSTRAINT extraction_runs_pkey PRIMARY KEY (id);


--
-- TOC entry 4044 (class 2606 OID 17825)
-- Name: industries industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_pkey PRIMARY KEY (id);


--
-- TOC entry 4098 (class 2606 OID 24944)
-- Name: ingestion_files ingestion_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_files
    ADD CONSTRAINT ingestion_files_pkey PRIMARY KEY (id);


--
-- TOC entry 4100 (class 2606 OID 24946)
-- Name: ingestion_files ingestion_files_source_id_checksum_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_files
    ADD CONSTRAINT ingestion_files_source_id_checksum_key UNIQUE (source_id, checksum);


--
-- TOC entry 4103 (class 2606 OID 24977)
-- Name: ingestion_jobs ingestion_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 4149 (class 2606 OID 25579)
-- Name: integration_connections integration_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_pkey PRIMARY KEY (company_id, integration_id);


--
-- TOC entry 4082 (class 2606 OID 19193)
-- Name: investor_pipeline investor_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_pipeline
    ADD CONSTRAINT investor_pipeline_pkey PRIMARY KEY (id);


--
-- TOC entry 4085 (class 2606 OID 19222)
-- Name: investor_updates investor_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_updates
    ADD CONSTRAINT investor_updates_pkey PRIMARY KEY (id);


--
-- TOC entry 4074 (class 2606 OID 19138)
-- Name: join_requests join_requests_company_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_company_id_user_id_key UNIQUE (company_id, user_id);


--
-- TOC entry 4076 (class 2606 OID 19136)
-- Name: join_requests join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 4091 (class 2606 OID 19266)
-- Name: mentor_sessions mentor_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_sessions
    ADD CONSTRAINT mentor_sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 4116 (class 2606 OID 25302)
-- Name: metric_definitions metric_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_definitions
    ADD CONSTRAINT metric_definitions_pkey PRIMARY KEY (metric_key);


--
-- TOC entry 4152 (class 2606 OID 25726)
-- Name: metric_snapshots metric_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_snapshots
    ADD CONSTRAINT metric_snapshots_pkey PRIMARY KEY (id);


--
-- TOC entry 4110 (class 2606 OID 24998)
-- Name: normalized_metrics normalized_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 4066 (class 2606 OID 17922)
-- Name: onboarding_progress onboarding_progress_company_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_company_id_user_id_key UNIQUE (company_id, user_id);


--
-- TOC entry 4068 (class 2606 OID 17920)
-- Name: onboarding_progress onboarding_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_pkey PRIMARY KEY (id);


--
-- TOC entry 4128 (class 2606 OID 25371)
-- Name: raw_extractions raw_extractions_file_id_sheet_idx_region_idx_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_extractions
    ADD CONSTRAINT raw_extractions_file_id_sheet_idx_region_idx_key UNIQUE (file_id, sheet_idx, region_idx);


--
-- TOC entry 4130 (class 2606 OID 25369)
-- Name: raw_extractions raw_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_extractions
    ADD CONSTRAINT raw_extractions_pkey PRIMARY KEY (id);


--
-- TOC entry 4123 (class 2606 OID 25341)
-- Name: raw_workbook_sheets raw_workbook_sheets_file_id_sheet_idx_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_workbook_sheets
    ADD CONSTRAINT raw_workbook_sheets_file_id_sheet_idx_key UNIQUE (file_id, sheet_idx);


--
-- TOC entry 4125 (class 2606 OID 25339)
-- Name: raw_workbook_sheets raw_workbook_sheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_workbook_sheets
    ADD CONSTRAINT raw_workbook_sheets_pkey PRIMARY KEY (id);


--
-- TOC entry 4185 (class 2606 OID 27207)
-- Name: reference_companies reference_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_companies
    ADD CONSTRAINT reference_companies_pkey PRIMARY KEY (id);


--
-- TOC entry 4195 (class 2606 OID 27299)
-- Name: reference_company_jobs reference_company_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_jobs
    ADD CONSTRAINT reference_company_jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 4188 (class 2606 OID 27251)
-- Name: reference_company_nodes reference_company_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_nodes
    ADD CONSTRAINT reference_company_nodes_pkey PRIMARY KEY (id);


--
-- TOC entry 4191 (class 2606 OID 27272)
-- Name: reference_company_sources reference_company_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_sources
    ADD CONSTRAINT reference_company_sources_pkey PRIMARY KEY (id);


--
-- TOC entry 4054 (class 2606 OID 17859)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 4143 (class 2606 OID 25473)
-- Name: source_profiles source_profiles_company_id_signature_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_profiles
    ADD CONSTRAINT source_profiles_company_id_signature_key UNIQUE (company_id, signature);


--
-- TOC entry 4145 (class 2606 OID 25471)
-- Name: source_profiles source_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_profiles
    ADD CONSTRAINT source_profiles_pkey PRIMARY KEY (id);


--
-- TOC entry 4114 (class 2606 OID 25223)
-- Name: subdomains subdomains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subdomains
    ADD CONSTRAINT subdomains_pkey PRIMARY KEY (id);


--
-- TOC entry 4056 (class 2606 OID 17870)
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- TOC entry 4078 (class 2606 OID 19179)
-- Name: vc_firms vc_firms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vc_firms
    ADD CONSTRAINT vc_firms_pkey PRIMARY KEY (id);


--
-- TOC entry 4087 (class 2606 OID 19243)
-- Name: vc_mentors vc_mentors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vc_mentors
    ADD CONSTRAINT vc_mentors_pkey PRIMARY KEY (id);


--
-- TOC entry 4070 (class 2606 OID 19113)
-- Name: workspace_invites workspace_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_pkey PRIMARY KEY (id);


--
-- TOC entry 4072 (class 2606 OID 19115)
-- Name: workspace_invites workspace_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_token_key UNIQUE (token);


--
-- TOC entry 4196 (class 1259 OID 30295)
-- Name: bdt_metrics_company_metric_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bdt_metrics_company_metric_key_unique ON public.bdt_metrics USING btree (company_id, metric_key) WHERE (metric_key IS NOT NULL);


--
-- TOC entry 4206 (class 1259 OID 30229)
-- Name: idx_bdt_goals_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bdt_goals_company ON public.bdt_goals USING btree (company_id);


--
-- TOC entry 4215 (class 1259 OID 30281)
-- Name: idx_bdt_impacts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bdt_impacts_company ON public.bdt_metric_impacts USING btree (company_id);


--
-- TOC entry 4216 (class 1259 OID 30282)
-- Name: idx_bdt_impacts_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bdt_impacts_metric ON public.bdt_metric_impacts USING btree (metric_id);


--
-- TOC entry 4203 (class 1259 OID 30202)
-- Name: idx_bdt_metric_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bdt_metric_history ON public.bdt_metric_history USING btree (metric_id, changed_at DESC);


--
-- TOC entry 4199 (class 1259 OID 30181)
-- Name: idx_bdt_metrics_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bdt_metrics_company ON public.bdt_metrics USING btree (company_id);


--
-- TOC entry 4200 (class 1259 OID 30182)
-- Name: idx_bdt_metrics_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bdt_metrics_department ON public.bdt_metrics USING btree (department_id);


--
-- TOC entry 4049 (class 1259 OID 17947)
-- Name: idx_companies_industry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_industry ON public.companies USING btree (industry_id);


--
-- TOC entry 4050 (class 1259 OID 17948)
-- Name: idx_companies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_status ON public.companies USING btree (status);


--
-- TOC entry 4051 (class 1259 OID 25235)
-- Name: idx_companies_subdomain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_subdomain ON public.companies USING btree (subdomain_id);


--
-- TOC entry 4061 (class 1259 OID 17950)
-- Name: idx_company_members_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_members_comp ON public.company_members USING btree (company_id);


--
-- TOC entry 4062 (class 1259 OID 26848)
-- Name: idx_company_members_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_members_department ON public.company_members USING btree (department_id);


--
-- TOC entry 4063 (class 1259 OID 17949)
-- Name: idx_company_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_members_user ON public.company_members USING btree (user_id);


--
-- TOC entry 4162 (class 1259 OID 26879)
-- Name: idx_department_bdt_nodes_dept_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_department_bdt_nodes_dept_parent ON public.department_bdt_nodes USING btree (department_id, parent_node_id, sort_order);


--
-- TOC entry 4175 (class 1259 OID 27089)
-- Name: idx_department_member_grants_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_department_member_grants_member ON public.department_member_grants USING btree (company_id, member_id);


--
-- TOC entry 4180 (class 1259 OID 27193)
-- Name: idx_department_node_members_company_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_department_node_members_company_member ON public.department_node_members USING btree (company_id, company_member_id);


--
-- TOC entry 4181 (class 1259 OID 27192)
-- Name: idx_department_node_members_company_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_department_node_members_company_node ON public.department_node_members USING btree (company_id, node_id);


--
-- TOC entry 4170 (class 1259 OID 27088)
-- Name: idx_department_role_grants_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_department_role_grants_role ON public.department_role_grants USING btree (company_id, role_id);


--
-- TOC entry 4159 (class 1259 OID 26847)
-- Name: idx_departments_company_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_company_order ON public.departments USING btree (company_id, sort_order, label);


--
-- TOC entry 4163 (class 1259 OID 30388)
-- Name: idx_dept_nodes_level1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dept_nodes_level1 ON public.department_bdt_nodes USING btree (department_id, node_level) WHERE (node_level = 'level1'::text);


--
-- TOC entry 4211 (class 1259 OID 30253)
-- Name: idx_goal_metric_links_goal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_metric_links_goal ON public.bdt_goal_metric_links USING btree (goal_id);


--
-- TOC entry 4212 (class 1259 OID 30254)
-- Name: idx_goal_metric_links_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_goal_metric_links_metric ON public.bdt_goal_metric_links USING btree (metric_id);


--
-- TOC entry 4079 (class 1259 OID 19283)
-- Name: idx_investor_pipeline_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investor_pipeline_company ON public.investor_pipeline USING btree (company_id);


--
-- TOC entry 4080 (class 1259 OID 19284)
-- Name: idx_investor_pipeline_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investor_pipeline_status ON public.investor_pipeline USING btree (status);


--
-- TOC entry 4083 (class 1259 OID 19285)
-- Name: idx_investor_updates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_investor_updates_company ON public.investor_updates USING btree (company_id);


--
-- TOC entry 4088 (class 1259 OID 19287)
-- Name: idx_mentor_sessions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mentor_sessions_company ON public.mentor_sessions USING btree (company_id);


--
-- TOC entry 4089 (class 1259 OID 19286)
-- Name: idx_mentor_sessions_mentor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mentor_sessions_mentor ON public.mentor_sessions USING btree (mentor_id);


--
-- TOC entry 4150 (class 1259 OID 25732)
-- Name: idx_metric_snapshots_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_metric_snapshots_lookup ON public.metric_snapshots USING btree (company_id, integration_id, snapshot_at DESC);


--
-- TOC entry 4064 (class 1259 OID 17951)
-- Name: idx_onboarding_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_company ON public.onboarding_progress USING btree (company_id);


--
-- TOC entry 4182 (class 1259 OID 27233)
-- Name: idx_reference_companies_company_subdomain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_companies_company_subdomain ON public.reference_companies USING btree (company_id, subdomain_id, created_at DESC);


--
-- TOC entry 4183 (class 1259 OID 27234)
-- Name: idx_reference_companies_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_companies_status ON public.reference_companies USING btree (status, created_at DESC) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text, 'failed'::text]));


--
-- TOC entry 4192 (class 1259 OID 27311)
-- Name: idx_reference_company_jobs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_company_jobs_company ON public.reference_company_jobs USING btree (company_id, created_at DESC);


--
-- TOC entry 4193 (class 1259 OID 27310)
-- Name: idx_reference_company_jobs_pickup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_company_jobs_pickup ON public.reference_company_jobs USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- TOC entry 4186 (class 1259 OID 27262)
-- Name: idx_reference_company_nodes_tree; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_company_nodes_tree ON public.reference_company_nodes USING btree (reference_company_id, parent_node_id, sort_order);


--
-- TOC entry 4189 (class 1259 OID 27283)
-- Name: idx_reference_company_sources_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reference_company_sources_company ON public.reference_company_sources USING btree (reference_company_id, node_id);


--
-- TOC entry 4052 (class 1259 OID 26564)
-- Name: idx_roles_company_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_company_active ON public.roles USING btree (company_id, is_archived) WHERE (company_id IS NOT NULL);


--
-- TOC entry 4112 (class 1259 OID 25229)
-- Name: idx_subdomains_industry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subdomains_industry ON public.subdomains USING btree (industry_id);


--
-- TOC entry 4096 (class 1259 OID 24935)
-- Name: ix_data_sources_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_data_sources_company ON public.data_sources USING btree (company_id);


--
-- TOC entry 4139 (class 1259 OID 25460)
-- Name: ix_decisions_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_decisions_company_status ON public.extraction_decisions USING btree (company_id, status, created_at DESC);


--
-- TOC entry 4140 (class 1259 OID 25459)
-- Name: ix_decisions_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_decisions_run ON public.extraction_decisions USING btree (run_id);


--
-- TOC entry 4101 (class 1259 OID 24962)
-- Name: ix_ingestion_files_company_uploaded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ingestion_files_company_uploaded ON public.ingestion_files USING btree (company_id, uploaded_at DESC);


--
-- TOC entry 4104 (class 1259 OID 24989)
-- Name: ix_jobs_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_jobs_company_created ON public.ingestion_jobs USING btree (company_id, created_at DESC);


--
-- TOC entry 4105 (class 1259 OID 24988)
-- Name: ix_jobs_pickup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_jobs_pickup ON public.ingestion_jobs USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- TOC entry 4106 (class 1259 OID 25020)
-- Name: ix_metrics_company_metric_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_metrics_company_metric_period ON public.normalized_metrics USING btree (company_id, metric_key, period_end DESC) WHERE (superseded_by IS NULL);


--
-- TOC entry 4107 (class 1259 OID 25516)
-- Name: ix_metrics_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_metrics_run ON public.normalized_metrics USING btree (run_id);


--
-- TOC entry 4108 (class 1259 OID 25517)
-- Name: ix_metrics_source_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_metrics_source_profile ON public.normalized_metrics USING btree (source_profile_id);


--
-- TOC entry 4126 (class 1259 OID 25392)
-- Name: ix_raw_company_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_raw_company_file ON public.raw_extractions USING btree (company_id, file_id);


--
-- TOC entry 4121 (class 1259 OID 25357)
-- Name: ix_raw_sheets_company_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_raw_sheets_company_file ON public.raw_workbook_sheets USING btree (company_id, file_id);


--
-- TOC entry 4135 (class 1259 OID 25428)
-- Name: ix_runs_company_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_runs_company_file ON public.extraction_runs USING btree (company_id, file_id, created_at DESC);


--
-- TOC entry 4141 (class 1259 OID 25479)
-- Name: ix_source_profiles_company_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_source_profiles_company_used ON public.source_profiles USING btree (company_id, last_used_at DESC);


--
-- TOC entry 4111 (class 1259 OID 25515)
-- Name: ux_metrics_live; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_metrics_live ON public.normalized_metrics USING btree (company_id, metric_key, period_start, period_end, scenario, source_id) WHERE ((superseded_by IS NULL) AND (superseded_by_metric_id IS NULL));


--
-- TOC entry 4136 (class 1259 OID 25427)
-- Name: ux_runs_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_runs_current ON public.extraction_runs USING btree (file_id, region_id) WHERE is_current;


--
-- TOC entry 4332 (class 2620 OID 17934)
-- Name: companies companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4336 (class 2620 OID 30390)
-- Name: department_bdt_nodes enforce_level1_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_level1_limit BEFORE INSERT OR UPDATE ON public.department_bdt_nodes FOR EACH ROW EXECUTE FUNCTION public.check_level1_node_limit();


--
-- TOC entry 4335 (class 2620 OID 17936)
-- Name: onboarding_progress onboarding_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER onboarding_updated_at BEFORE UPDATE ON public.onboarding_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4333 (class 2620 OID 26448)
-- Name: user_profiles user_profiles_prevent_authority_self_edit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_profiles_prevent_authority_self_edit BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_authority_self_edit();


--
-- TOC entry 4334 (class 2620 OID 17935)
-- Name: user_profiles user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4327 (class 2606 OID 30243)
-- Name: bdt_goal_metric_links bdt_goal_metric_links_goal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goal_metric_links
    ADD CONSTRAINT bdt_goal_metric_links_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.bdt_goals(id) ON DELETE CASCADE;


--
-- TOC entry 4328 (class 2606 OID 30248)
-- Name: bdt_goal_metric_links bdt_goal_metric_links_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goal_metric_links
    ADD CONSTRAINT bdt_goal_metric_links_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.bdt_metrics(id) ON DELETE CASCADE;


--
-- TOC entry 4324 (class 2606 OID 30214)
-- Name: bdt_goals bdt_goals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goals
    ADD CONSTRAINT bdt_goals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4325 (class 2606 OID 30224)
-- Name: bdt_goals bdt_goals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goals
    ADD CONSTRAINT bdt_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4326 (class 2606 OID 30219)
-- Name: bdt_goals bdt_goals_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_goals
    ADD CONSTRAINT bdt_goals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- TOC entry 4322 (class 2606 OID 30197)
-- Name: bdt_metric_history bdt_metric_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metric_history
    ADD CONSTRAINT bdt_metric_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);


--
-- TOC entry 4323 (class 2606 OID 30192)
-- Name: bdt_metric_history bdt_metric_history_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metric_history
    ADD CONSTRAINT bdt_metric_history_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.bdt_metrics(id) ON DELETE CASCADE;


--
-- TOC entry 4329 (class 2606 OID 30266)
-- Name: bdt_metric_impacts bdt_metric_impacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metric_impacts
    ADD CONSTRAINT bdt_metric_impacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4330 (class 2606 OID 30276)
-- Name: bdt_metric_impacts bdt_metric_impacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metric_impacts
    ADD CONSTRAINT bdt_metric_impacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4331 (class 2606 OID 30271)
-- Name: bdt_metric_impacts bdt_metric_impacts_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metric_impacts
    ADD CONSTRAINT bdt_metric_impacts_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.bdt_metrics(id) ON DELETE CASCADE;


--
-- TOC entry 4320 (class 2606 OID 30171)
-- Name: bdt_metrics bdt_metrics_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metrics
    ADD CONSTRAINT bdt_metrics_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4321 (class 2606 OID 30176)
-- Name: bdt_metrics bdt_metrics_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bdt_metrics
    ADD CONSTRAINT bdt_metrics_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- TOC entry 4217 (class 2606 OID 17847)
-- Name: companies companies_industry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.industries(id) ON DELETE SET NULL;


--
-- TOC entry 4218 (class 2606 OID 25230)
-- Name: companies companies_subdomain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_subdomain_id_fkey FOREIGN KEY (subdomain_id) REFERENCES public.subdomains(id) ON DELETE SET NULL;


--
-- TOC entry 4226 (class 2606 OID 19094)
-- Name: company_members company_members_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- TOC entry 4227 (class 2606 OID 17893)
-- Name: company_members company_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4228 (class 2606 OID 26842)
-- Name: company_members company_members_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- TOC entry 4229 (class 2606 OID 17903)
-- Name: company_members company_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- TOC entry 4230 (class 2606 OID 26570)
-- Name: company_members company_members_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_role_fk FOREIGN KEY (role) REFERENCES public.roles(id);


--
-- TOC entry 4231 (class 2606 OID 17898)
-- Name: company_members company_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4269 (class 2606 OID 25322)
-- Name: company_metric_definitions company_metric_definitions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_metric_definitions
    ADD CONSTRAINT company_metric_definitions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4252 (class 2606 OID 24925)
-- Name: data_sources data_sources_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4253 (class 2606 OID 24930)
-- Name: data_sources data_sources_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_sources
    ADD CONSTRAINT data_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4288 (class 2606 OID 26864)
-- Name: department_bdt_nodes department_bdt_nodes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_bdt_nodes
    ADD CONSTRAINT department_bdt_nodes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4289 (class 2606 OID 26869)
-- Name: department_bdt_nodes department_bdt_nodes_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_bdt_nodes
    ADD CONSTRAINT department_bdt_nodes_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- TOC entry 4290 (class 2606 OID 26874)
-- Name: department_bdt_nodes department_bdt_nodes_parent_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_bdt_nodes
    ADD CONSTRAINT department_bdt_nodes_parent_node_id_fkey FOREIGN KEY (parent_node_id) REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE;


--
-- TOC entry 4298 (class 2606 OID 27063)
-- Name: department_member_grants department_member_grants_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member_grants
    ADD CONSTRAINT department_member_grants_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4299 (class 2606 OID 27078)
-- Name: department_member_grants department_member_grants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member_grants
    ADD CONSTRAINT department_member_grants_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4300 (class 2606 OID 27068)
-- Name: department_member_grants department_member_grants_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member_grants
    ADD CONSTRAINT department_member_grants_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- TOC entry 4301 (class 2606 OID 27073)
-- Name: department_member_grants department_member_grants_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member_grants
    ADD CONSTRAINT department_member_grants_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id) ON DELETE CASCADE;


--
-- TOC entry 4302 (class 2606 OID 27083)
-- Name: department_member_grants department_member_grants_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_member_grants
    ADD CONSTRAINT department_member_grants_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- TOC entry 4291 (class 2606 OID 26975)
-- Name: department_metric_links department_metric_links_company_metric_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_metric_links
    ADD CONSTRAINT department_metric_links_company_metric_definition_id_fkey FOREIGN KEY (company_metric_definition_id) REFERENCES public.company_metric_definitions(id) ON DELETE SET NULL;


--
-- TOC entry 4292 (class 2606 OID 26970)
-- Name: department_metric_links department_metric_links_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_metric_links
    ADD CONSTRAINT department_metric_links_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE;


--
-- TOC entry 4303 (class 2606 OID 27167)
-- Name: department_node_members department_node_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_node_members
    ADD CONSTRAINT department_node_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4304 (class 2606 OID 27182)
-- Name: department_node_members department_node_members_company_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_node_members
    ADD CONSTRAINT department_node_members_company_member_id_fkey FOREIGN KEY (company_member_id) REFERENCES public.company_members(id) ON DELETE CASCADE;


--
-- TOC entry 4305 (class 2606 OID 27187)
-- Name: department_node_members department_node_members_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_node_members
    ADD CONSTRAINT department_node_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 4306 (class 2606 OID 27172)
-- Name: department_node_members department_node_members_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_node_members
    ADD CONSTRAINT department_node_members_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- TOC entry 4307 (class 2606 OID 27177)
-- Name: department_node_members department_node_members_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_node_members
    ADD CONSTRAINT department_node_members_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE;


--
-- TOC entry 4293 (class 2606 OID 27024)
-- Name: department_role_grants department_role_grants_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_role_grants
    ADD CONSTRAINT department_role_grants_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4294 (class 2606 OID 27039)
-- Name: department_role_grants department_role_grants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_role_grants
    ADD CONSTRAINT department_role_grants_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4295 (class 2606 OID 27029)
-- Name: department_role_grants department_role_grants_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_role_grants
    ADD CONSTRAINT department_role_grants_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- TOC entry 4296 (class 2606 OID 27034)
-- Name: department_role_grants department_role_grants_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_role_grants
    ADD CONSTRAINT department_role_grants_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- TOC entry 4297 (class 2606 OID 27044)
-- Name: department_role_grants department_role_grants_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_role_grants
    ADD CONSTRAINT department_role_grants_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- TOC entry 4287 (class 2606 OID 26837)
-- Name: departments departments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4281 (class 2606 OID 25444)
-- Name: extraction_decisions extraction_decisions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_decisions
    ADD CONSTRAINT extraction_decisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4282 (class 2606 OID 25454)
-- Name: extraction_decisions extraction_decisions_overridden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_decisions
    ADD CONSTRAINT extraction_decisions_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES auth.users(id);


--
-- TOC entry 4283 (class 2606 OID 25449)
-- Name: extraction_decisions extraction_decisions_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_decisions
    ADD CONSTRAINT extraction_decisions_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.extraction_runs(id) ON DELETE CASCADE;


--
-- TOC entry 4277 (class 2606 OID 25407)
-- Name: extraction_runs extraction_runs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_runs
    ADD CONSTRAINT extraction_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4278 (class 2606 OID 25412)
-- Name: extraction_runs extraction_runs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_runs
    ADD CONSTRAINT extraction_runs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.ingestion_files(id) ON DELETE CASCADE;


--
-- TOC entry 4279 (class 2606 OID 25422)
-- Name: extraction_runs extraction_runs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_runs
    ADD CONSTRAINT extraction_runs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id);


--
-- TOC entry 4280 (class 2606 OID 25417)
-- Name: extraction_runs extraction_runs_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extraction_runs
    ADD CONSTRAINT extraction_runs_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.raw_extractions(id) ON DELETE CASCADE;


--
-- TOC entry 4254 (class 2606 OID 24947)
-- Name: ingestion_files ingestion_files_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_files
    ADD CONSTRAINT ingestion_files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4255 (class 2606 OID 24952)
-- Name: ingestion_files ingestion_files_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_files
    ADD CONSTRAINT ingestion_files_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.data_sources(id) ON DELETE CASCADE;


--
-- TOC entry 4256 (class 2606 OID 24957)
-- Name: ingestion_files ingestion_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_files
    ADD CONSTRAINT ingestion_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- TOC entry 4257 (class 2606 OID 24978)
-- Name: ingestion_jobs ingestion_jobs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4258 (class 2606 OID 24983)
-- Name: ingestion_jobs ingestion_jobs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_jobs
    ADD CONSTRAINT ingestion_jobs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.ingestion_files(id) ON DELETE CASCADE;


--
-- TOC entry 4285 (class 2606 OID 25580)
-- Name: integration_connections integration_connections_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4242 (class 2606 OID 19194)
-- Name: investor_pipeline investor_pipeline_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_pipeline
    ADD CONSTRAINT investor_pipeline_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4243 (class 2606 OID 19204)
-- Name: investor_pipeline investor_pipeline_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_pipeline
    ADD CONSTRAINT investor_pipeline_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4244 (class 2606 OID 19199)
-- Name: investor_pipeline investor_pipeline_vc_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_pipeline
    ADD CONSTRAINT investor_pipeline_vc_firm_id_fkey FOREIGN KEY (vc_firm_id) REFERENCES public.vc_firms(id) ON DELETE SET NULL;


--
-- TOC entry 4245 (class 2606 OID 19223)
-- Name: investor_updates investor_updates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_updates
    ADD CONSTRAINT investor_updates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4246 (class 2606 OID 19228)
-- Name: investor_updates investor_updates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investor_updates
    ADD CONSTRAINT investor_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4237 (class 2606 OID 26585)
-- Name: join_requests join_requests_assigned_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_assigned_role_fk FOREIGN KEY (assigned_role) REFERENCES public.roles(id);


--
-- TOC entry 4238 (class 2606 OID 19139)
-- Name: join_requests join_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4239 (class 2606 OID 26580)
-- Name: join_requests join_requests_requested_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_requested_role_fk FOREIGN KEY (requested_role) REFERENCES public.roles(id);


--
-- TOC entry 4240 (class 2606 OID 19149)
-- Name: join_requests join_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- TOC entry 4241 (class 2606 OID 19144)
-- Name: join_requests join_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.join_requests
    ADD CONSTRAINT join_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4249 (class 2606 OID 19272)
-- Name: mentor_sessions mentor_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_sessions
    ADD CONSTRAINT mentor_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4250 (class 2606 OID 19277)
-- Name: mentor_sessions mentor_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_sessions
    ADD CONSTRAINT mentor_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4251 (class 2606 OID 19267)
-- Name: mentor_sessions mentor_sessions_mentor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mentor_sessions
    ADD CONSTRAINT mentor_sessions_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.vc_mentors(id) ON DELETE CASCADE;


--
-- TOC entry 4268 (class 2606 OID 25303)
-- Name: metric_definitions metric_definitions_parent_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_definitions
    ADD CONSTRAINT metric_definitions_parent_key_fkey FOREIGN KEY (parent_key) REFERENCES public.metric_definitions(metric_key);


--
-- TOC entry 4286 (class 2606 OID 25727)
-- Name: metric_snapshots metric_snapshots_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metric_snapshots
    ADD CONSTRAINT metric_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4259 (class 2606 OID 24999)
-- Name: normalized_metrics normalized_metrics_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4260 (class 2606 OID 25499)
-- Name: normalized_metrics normalized_metrics_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.extraction_decisions(id);


--
-- TOC entry 4261 (class 2606 OID 25009)
-- Name: normalized_metrics normalized_metrics_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE;


--
-- TOC entry 4262 (class 2606 OID 25494)
-- Name: normalized_metrics normalized_metrics_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.extraction_runs(id);


--
-- TOC entry 4263 (class 2606 OID 25004)
-- Name: normalized_metrics normalized_metrics_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.data_sources(id) ON DELETE CASCADE;


--
-- TOC entry 4264 (class 2606 OID 25504)
-- Name: normalized_metrics normalized_metrics_source_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_source_profile_id_fkey FOREIGN KEY (source_profile_id) REFERENCES public.source_profiles(id);


--
-- TOC entry 4265 (class 2606 OID 25014)
-- Name: normalized_metrics normalized_metrics_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.ingestion_jobs(id);


--
-- TOC entry 4266 (class 2606 OID 25510)
-- Name: normalized_metrics normalized_metrics_superseded_by_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.normalized_metrics
    ADD CONSTRAINT normalized_metrics_superseded_by_metric_id_fkey FOREIGN KEY (superseded_by_metric_id) REFERENCES public.normalized_metrics(id);


--
-- TOC entry 4232 (class 2606 OID 17923)
-- Name: onboarding_progress onboarding_progress_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4233 (class 2606 OID 17928)
-- Name: onboarding_progress onboarding_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 4273 (class 2606 OID 25372)
-- Name: raw_extractions raw_extractions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_extractions
    ADD CONSTRAINT raw_extractions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4274 (class 2606 OID 25377)
-- Name: raw_extractions raw_extractions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_extractions
    ADD CONSTRAINT raw_extractions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.ingestion_files(id) ON DELETE CASCADE;


--
-- TOC entry 4275 (class 2606 OID 25382)
-- Name: raw_extractions raw_extractions_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_extractions
    ADD CONSTRAINT raw_extractions_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE;


--
-- TOC entry 4276 (class 2606 OID 25387)
-- Name: raw_extractions raw_extractions_raw_sheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_extractions
    ADD CONSTRAINT raw_extractions_raw_sheet_id_fkey FOREIGN KEY (raw_sheet_id) REFERENCES public.raw_workbook_sheets(id) ON DELETE SET NULL;


--
-- TOC entry 4270 (class 2606 OID 25342)
-- Name: raw_workbook_sheets raw_workbook_sheets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_workbook_sheets
    ADD CONSTRAINT raw_workbook_sheets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4271 (class 2606 OID 25347)
-- Name: raw_workbook_sheets raw_workbook_sheets_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_workbook_sheets
    ADD CONSTRAINT raw_workbook_sheets_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.ingestion_files(id) ON DELETE CASCADE;


--
-- TOC entry 4272 (class 2606 OID 25352)
-- Name: raw_workbook_sheets raw_workbook_sheets_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_workbook_sheets
    ADD CONSTRAINT raw_workbook_sheets_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE;


--
-- TOC entry 4308 (class 2606 OID 27208)
-- Name: reference_companies reference_companies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_companies
    ADD CONSTRAINT reference_companies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4309 (class 2606 OID 27223)
-- Name: reference_companies reference_companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_companies
    ADD CONSTRAINT reference_companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 4310 (class 2606 OID 27213)
-- Name: reference_companies reference_companies_industry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_companies
    ADD CONSTRAINT reference_companies_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.industries(id) ON DELETE SET NULL;


--
-- TOC entry 4311 (class 2606 OID 27218)
-- Name: reference_companies reference_companies_subdomain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_companies
    ADD CONSTRAINT reference_companies_subdomain_id_fkey FOREIGN KEY (subdomain_id) REFERENCES public.subdomains(id) ON DELETE SET NULL;


--
-- TOC entry 4312 (class 2606 OID 27228)
-- Name: reference_companies reference_companies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_companies
    ADD CONSTRAINT reference_companies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 4318 (class 2606 OID 27305)
-- Name: reference_company_jobs reference_company_jobs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_jobs
    ADD CONSTRAINT reference_company_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4319 (class 2606 OID 27300)
-- Name: reference_company_jobs reference_company_jobs_reference_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_jobs
    ADD CONSTRAINT reference_company_jobs_reference_company_id_fkey FOREIGN KEY (reference_company_id) REFERENCES public.reference_companies(id) ON DELETE CASCADE;


--
-- TOC entry 4313 (class 2606 OID 30097)
-- Name: reference_company_nodes reference_company_nodes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_nodes
    ADD CONSTRAINT reference_company_nodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 4314 (class 2606 OID 27257)
-- Name: reference_company_nodes reference_company_nodes_parent_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_nodes
    ADD CONSTRAINT reference_company_nodes_parent_node_id_fkey FOREIGN KEY (parent_node_id) REFERENCES public.reference_company_nodes(id) ON DELETE CASCADE;


--
-- TOC entry 4315 (class 2606 OID 27252)
-- Name: reference_company_nodes reference_company_nodes_reference_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_nodes
    ADD CONSTRAINT reference_company_nodes_reference_company_id_fkey FOREIGN KEY (reference_company_id) REFERENCES public.reference_companies(id) ON DELETE CASCADE;


--
-- TOC entry 4316 (class 2606 OID 27278)
-- Name: reference_company_sources reference_company_sources_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_sources
    ADD CONSTRAINT reference_company_sources_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.reference_company_nodes(id) ON DELETE CASCADE;


--
-- TOC entry 4317 (class 2606 OID 27273)
-- Name: reference_company_sources reference_company_sources_reference_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_company_sources
    ADD CONSTRAINT reference_company_sources_reference_company_id_fkey FOREIGN KEY (reference_company_id) REFERENCES public.reference_companies(id) ON DELETE CASCADE;


--
-- TOC entry 4219 (class 2606 OID 26505)
-- Name: roles roles_base_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_base_role_id_fkey FOREIGN KEY (base_role_id) REFERENCES public.roles(id);


--
-- TOC entry 4220 (class 2606 OID 26500)
-- Name: roles roles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4221 (class 2606 OID 26510)
-- Name: roles roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4222 (class 2606 OID 26515)
-- Name: roles roles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- TOC entry 4284 (class 2606 OID 25474)
-- Name: source_profiles source_profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_profiles
    ADD CONSTRAINT source_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4267 (class 2606 OID 25224)
-- Name: subdomains subdomains_industry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subdomains
    ADD CONSTRAINT subdomains_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.industries(id) ON DELETE CASCADE;


--
-- TOC entry 4223 (class 2606 OID 17876)
-- Name: user_profiles user_profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- TOC entry 4224 (class 2606 OID 17871)
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4225 (class 2606 OID 26565)
-- Name: user_profiles user_profiles_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_role_fk FOREIGN KEY (role) REFERENCES public.roles(id);


--
-- TOC entry 4247 (class 2606 OID 19249)
-- Name: vc_mentors vc_mentors_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vc_mentors
    ADD CONSTRAINT vc_mentors_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id);


--
-- TOC entry 4248 (class 2606 OID 19244)
-- Name: vc_mentors vc_mentors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vc_mentors
    ADD CONSTRAINT vc_mentors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4234 (class 2606 OID 19116)
-- Name: workspace_invites workspace_invites_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- TOC entry 4235 (class 2606 OID 19121)
-- Name: workspace_invites workspace_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4236 (class 2606 OID 26575)
-- Name: workspace_invites workspace_invites_role_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_role_fk FOREIGN KEY (role) REFERENCES public.roles(id);


--
-- TOC entry 4543 (class 3256 OID 25327)
-- Name: company_metric_definitions cmd_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cmd_tenant ON public.company_metric_definitions USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4486 (class 0 OID 17826)
-- Dependencies: 310
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4523 (class 3256 OID 17966)
-- Name: companies companies_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_read ON public.companies FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- TOC entry 4489 (class 0 OID 17883)
-- Dependencies: 313
-- Name: company_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4504 (class 0 OID 25309)
-- Dependencies: 329
-- Name: company_metric_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_metric_definitions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4498 (class 0 OID 24911)
-- Dependencies: 323
-- Name: data_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4511 (class 0 OID 26849)
-- Dependencies: 341
-- Name: department_bdt_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_bdt_nodes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4514 (class 0 OID 27049)
-- Dependencies: 344
-- Name: department_member_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_member_grants ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4555 (class 3256 OID 27103)
-- Name: department_member_grants department_member_grants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_member_grants_read ON public.department_member_grants FOR SELECT USING (public.can_read_department(company_id, department_id));


--
-- TOC entry 4512 (class 0 OID 26962)
-- Dependencies: 342
-- Name: department_metric_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_metric_links ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4553 (class 3256 OID 27101)
-- Name: department_metric_links department_metric_links_access_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_metric_links_access_read ON public.department_metric_links FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.department_bdt_nodes n
  WHERE ((n.id = department_metric_links.node_id) AND public.can_read_department(n.company_id, n.department_id)))));


--
-- TOC entry 4515 (class 0 OID 27158)
-- Dependencies: 345
-- Name: department_node_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_node_members ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4556 (class 3256 OID 27194)
-- Name: department_node_members department_node_members_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_node_members_read ON public.department_node_members FOR SELECT USING (public.can_read_department(company_id, department_id));


--
-- TOC entry 4552 (class 3256 OID 27094)
-- Name: department_bdt_nodes department_nodes_access_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_nodes_access_read ON public.department_bdt_nodes FOR SELECT USING (public.can_read_department(company_id, department_id));


--
-- TOC entry 4513 (class 0 OID 27008)
-- Dependencies: 343
-- Name: department_role_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_role_grants ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4554 (class 3256 OID 27102)
-- Name: department_role_grants department_role_grants_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_role_grants_read ON public.department_role_grants FOR SELECT USING (public.can_read_department(company_id, department_id));


--
-- TOC entry 4510 (class 0 OID 26819)
-- Dependencies: 340
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4551 (class 3256 OID 27093)
-- Name: departments departments_access_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY departments_access_read ON public.departments FOR SELECT USING (public.can_read_department(company_id, id));


--
-- TOC entry 4537 (class 3256 OID 25022)
-- Name: data_sources ds_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ds_tenant ON public.data_sources USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4549 (class 3256 OID 25461)
-- Name: extraction_decisions ed_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ed_tenant ON public.extraction_decisions USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4548 (class 3256 OID 25429)
-- Name: extraction_runs er_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY er_tenant ON public.extraction_runs USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4508 (class 0 OID 25430)
-- Dependencies: 333
-- Name: extraction_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extraction_decisions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4507 (class 0 OID 25394)
-- Dependencies: 332
-- Name: extraction_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extraction_runs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4538 (class 3256 OID 25023)
-- Name: ingestion_files if_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY if_tenant ON public.ingestion_files USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4534 (class 3256 OID 25024)
-- Name: ingestion_jobs ij_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ij_tenant ON public.ingestion_jobs USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4485 (class 0 OID 17815)
-- Dependencies: 309
-- Name: industries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4520 (class 3256 OID 17937)
-- Name: industries industries_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY industries_public_read ON public.industries FOR SELECT USING (true);


--
-- TOC entry 4499 (class 0 OID 24936)
-- Dependencies: 324
-- Name: ingestion_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingestion_files ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4500 (class 0 OID 24963)
-- Dependencies: 325
-- Name: ingestion_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4494 (class 0 OID 19181)
-- Dependencies: 318
-- Name: investor_pipeline; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investor_pipeline ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4495 (class 0 OID 19210)
-- Dependencies: 319
-- Name: investor_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.investor_updates ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4521 (class 3256 OID 19157)
-- Name: workspace_invites invite_select_by_token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invite_select_by_token ON public.workspace_invites FOR SELECT USING (((is_active = true) AND (expires_at > now())));


--
-- TOC entry 4542 (class 3256 OID 25035)
-- Name: workspace_invites invite_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invite_select_member ON public.workspace_invites FOR SELECT USING ((company_id IN ( SELECT public.current_user_company_ids() AS current_user_company_ids)));


--
-- TOC entry 4492 (class 0 OID 19126)
-- Dependencies: 316
-- Name: join_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4536 (class 3256 OID 26591)
-- Name: join_requests joinreq_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY joinreq_select_admin ON public.join_requests FOR SELECT USING (((user_id = auth.uid()) OR (company_id IN ( SELECT cm.company_id
   FROM public.company_members cm
  WHERE ((cm.user_id = auth.uid()) AND (cm.status = 'active'::public.member_status) AND (cm.role = ANY (ARRAY['founder'::text, 'co_founder'::text, 'admin'::text, 'super_admin'::text])))))));


--
-- TOC entry 4522 (class 3256 OID 19158)
-- Name: join_requests joinreq_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY joinreq_select_self ON public.join_requests FOR SELECT USING ((user_id = auth.uid()));


--
-- TOC entry 4545 (class 3256 OID 25308)
-- Name: metric_definitions md_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY md_public_read ON public.metric_definitions FOR SELECT USING (true);


--
-- TOC entry 4540 (class 3256 OID 25030)
-- Name: company_members members_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_company_read ON public.company_members FOR SELECT USING ((company_id IN ( SELECT public.current_user_company_ids() AS current_user_company_ids)));


--
-- TOC entry 4524 (class 3256 OID 17967)
-- Name: company_members members_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_own_read ON public.company_members FOR SELECT USING ((user_id = auth.uid()));


--
-- TOC entry 4535 (class 3256 OID 26590)
-- Name: company_members members_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY members_write ON public.company_members FOR INSERT WITH CHECK ((((user_id = auth.uid()) AND (role = 'founder'::text)) OR (company_id IN ( SELECT public.my_company_ids() AS my_company_ids))));


--
-- TOC entry 4497 (class 0 OID 19255)
-- Dependencies: 321
-- Name: mentor_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mentor_sessions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4531 (class 3256 OID 26446)
-- Name: vc_mentors mentors company members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mentors company members read" ON public.vc_mentors FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = vc_mentors.company_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::public.member_status)))));


--
-- TOC entry 4503 (class 0 OID 25288)
-- Dependencies: 328
-- Name: metric_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4539 (class 3256 OID 25025)
-- Name: normalized_metrics nm_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nm_tenant ON public.normalized_metrics USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4501 (class 0 OID 24990)
-- Dependencies: 326
-- Name: normalized_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.normalized_metrics ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4527 (class 3256 OID 17971)
-- Name: onboarding_progress onboarding_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY onboarding_own ON public.onboarding_progress USING (((user_id = auth.uid()) OR (company_id IN ( SELECT public.my_company_ids() AS my_company_ids))));


--
-- TOC entry 4490 (class 0 OID 17908)
-- Dependencies: 314
-- Name: onboarding_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4529 (class 3256 OID 26444)
-- Name: investor_pipeline pipeline company members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pipeline company members read" ON public.investor_pipeline FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = investor_pipeline.company_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::public.member_status)))));


--
-- TOC entry 4541 (class 3256 OID 25034)
-- Name: user_profiles profiles_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_own_read ON public.user_profiles FOR SELECT USING (((id = auth.uid()) OR (id IN ( SELECT company_members.user_id
   FROM public.company_members
  WHERE (company_members.company_id IN ( SELECT public.current_user_company_ids() AS current_user_company_ids))))));


--
-- TOC entry 4528 (class 3256 OID 26443)
-- Name: user_profiles profiles_own_update_basic; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_own_update_basic ON public.user_profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- TOC entry 4525 (class 3256 OID 17969)
-- Name: user_profiles profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read ON public.user_profiles FOR SELECT USING (((id = auth.uid()) OR (id IN ( SELECT company_members.user_id
   FROM public.company_members
  WHERE (company_members.company_id IN ( SELECT public.my_company_ids() AS my_company_ids))))));


--
-- TOC entry 4526 (class 3256 OID 17970)
-- Name: user_profiles profiles_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_write ON public.user_profiles USING ((id = auth.uid()));


--
-- TOC entry 4506 (class 0 OID 25359)
-- Dependencies: 331
-- Name: raw_extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_extractions ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4505 (class 0 OID 25328)
-- Dependencies: 330
-- Name: raw_workbook_sheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_workbook_sheets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4547 (class 3256 OID 25393)
-- Name: raw_extractions re_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY re_tenant ON public.raw_extractions USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4516 (class 0 OID 27195)
-- Dependencies: 346
-- Name: reference_companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_companies ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4557 (class 3256 OID 27325)
-- Name: reference_companies reference_companies_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_companies_company_read ON public.reference_companies FOR SELECT USING ((company_id = public.auth_company_id()));


--
-- TOC entry 4519 (class 0 OID 27284)
-- Dependencies: 349
-- Name: reference_company_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_company_jobs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4560 (class 3256 OID 27328)
-- Name: reference_company_jobs reference_company_jobs_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_company_jobs_company_read ON public.reference_company_jobs FOR SELECT USING ((company_id = public.auth_company_id()));


--
-- TOC entry 4517 (class 0 OID 27235)
-- Dependencies: 347
-- Name: reference_company_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_company_nodes ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4558 (class 3256 OID 27326)
-- Name: reference_company_nodes reference_company_nodes_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_company_nodes_company_read ON public.reference_company_nodes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.reference_companies rc
  WHERE ((rc.id = reference_company_nodes.reference_company_id) AND (rc.company_id = public.auth_company_id())))));


--
-- TOC entry 4518 (class 0 OID 27263)
-- Dependencies: 348
-- Name: reference_company_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_company_sources ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4559 (class 3256 OID 27327)
-- Name: reference_company_sources reference_company_sources_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_company_sources_company_read ON public.reference_company_sources FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.reference_companies rc
  WHERE ((rc.id = reference_company_sources.reference_company_id) AND (rc.company_id = public.auth_company_id())))));


--
-- TOC entry 4487 (class 0 OID 17852)
-- Dependencies: 311
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4546 (class 3256 OID 25358)
-- Name: raw_workbook_sheets rws_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rws_tenant ON public.raw_workbook_sheets USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4532 (class 3256 OID 26447)
-- Name: mentor_sessions sessions company members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sessions company members read" ON public.mentor_sessions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = mentor_sessions.company_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::public.member_status)))));


--
-- TOC entry 4509 (class 0 OID 25462)
-- Dependencies: 334
-- Name: source_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.source_profiles ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4550 (class 3256 OID 25480)
-- Name: source_profiles sp_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sp_tenant ON public.source_profiles USING ((company_id = public.auth_company_id())) WITH CHECK ((company_id = public.auth_company_id()));


--
-- TOC entry 4502 (class 0 OID 25215)
-- Dependencies: 327
-- Name: subdomains; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subdomains ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4544 (class 3256 OID 25236)
-- Name: subdomains subdomains_read_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subdomains_read_authenticated ON public.subdomains FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4530 (class 3256 OID 26445)
-- Name: investor_updates updates company members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "updates company members read" ON public.investor_updates FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.company_members cm
  WHERE ((cm.company_id = investor_updates.company_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::public.member_status)))));


--
-- TOC entry 4488 (class 0 OID 17860)
-- Dependencies: 312
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4493 (class 0 OID 19170)
-- Dependencies: 317
-- Name: vc_firms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vc_firms ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4533 (class 3256 OID 19180)
-- Name: vc_firms vc_firms public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "vc_firms public read" ON public.vc_firms FOR SELECT USING (true);


--
-- TOC entry 4496 (class 0 OID 19234)
-- Dependencies: 320
-- Name: vc_mentors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vc_mentors ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4491 (class 0 OID 19099)
-- Dependencies: 315
-- Name: workspace_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Completed on 2026-06-28 20:41:20 IST

--
-- PostgreSQL database dump complete
--



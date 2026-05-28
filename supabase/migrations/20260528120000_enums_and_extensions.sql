-- Migration 1 — Enums + extensions
-- 360° feedback platform. See DESIGN.md §1 (UUID PKs) and §7 (enum list).

create extension if not exists pgcrypto;  -- gen_random_uuid()

create type app_role          as enum ('ceo', 'manager', 'ic');
create type cycle_status      as enum ('draft', 'open', 'closed', 'published');
create type relationship_type as enum ('manages', 'peer');
create type assignment_type   as enum ('self', 'upward', 'downward', 'peer');
create type assignment_status as enum ('pending', 'draft', 'submitted');
create type question_type     as enum ('scale_5', 'scale_10', 'text', 'multi_choice');
create type nomination_status as enum ('pending', 'approved', 'rejected');

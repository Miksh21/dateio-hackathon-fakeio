// App-facing row types (hand-authored; supabase gen types needs Docker which
// isn't available here). Mirrors the public schema we query from the UI.

export type AppRole = "ceo" | "manager" | "ic";
export type CycleStatus = "draft" | "open" | "closed" | "published";
export type MatchingStatus = "draft" | "in_review" | "approved" | "active";
export type RelationshipType = "manages" | "peer";
export type AssignmentType = "self" | "upward" | "downward" | "peer";
export type AssignmentStatus = "pending" | "draft" | "submitted" | "proposed";
export type QuestionType = "scale_5" | "scale_10" | "text" | "multi_choice";

export interface Employee {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  division: string | null;
  job_title: string | null;
  reporting_to_id: string | null;
  role: AppRole;
  is_super_admin: boolean;
  work_phone: string | null;
  is_active: boolean;
}

export interface EvaluationCycle {
  id: string;
  name: string;
  status: CycleStatus;
  matching_status: MatchingStatus;
  form_start: string | null;
  form_end: string | null;
  anon_min_responses: number;
  require_peer_approval: boolean;
  published_at: string | null;
}

export interface QuestionOption {
  value: number;
  en: string;
  cs: string | null;
}

export interface Question {
  id: string;
  cycle_id: string;
  code: string | null;
  text: string;
  text_cs: string | null;
  description: string | null;
  type: QuestionType;
  category: string | null;
  target_assignment_types: AssignmentType[];
  options: QuestionOption[] | null;
  sort_order: number;
  is_required: boolean;
}

export interface FeedbackAssignment {
  id: string;
  cycle_id: string;
  from_id: string;
  to_id: string;
  type: AssignmentType;
  status: AssignmentStatus;
  submitted_at: string | null;
}

export interface ResponseRow {
  id: string;
  assignment_id: string;
  question_id: string;
  scale_value: number | null;
  text_value: string | null;
  choice_value: string | null;
}

// Views (anonymized, threshold-gated)
export interface ReceivedAggregated {
  cycle_id: string;
  recipient_id: string;
  question_id: string;
  response_count: number;
  avg_scale: number | null;
}

export interface ReceivedTextAnon {
  cycle_id: string;
  recipient_id: string;
  question_id: string;
  response_id: string;
  text_value: string;
}

export interface MyGiven {
  response_id: string;
  cycle_id: string;
  recipient_id: string;
  assignment_type: AssignmentType;
  question_id: string;
  question_text: string;
  question_type: QuestionType;
  scale_value: number | null;
  text_value: string | null;
  choice_value: string | null;
  updated_at: string;
}

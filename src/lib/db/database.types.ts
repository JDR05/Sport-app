// Table, enum and helper types for the Supabase schema.
//
// The Database type is generated output and must not be edited by hand:
// regenerate it after every migration in supabase/migrations/.
//
// The helper types at the bottom (Tables, TablesInsert, TablesUpdate, Enums)
// are deliberately simplified versions of the generated ones. The generated
// variants carry conditional branches for cross-schema lookups that this
// project does not use, and which make every error message referencing them
// unreadable. If a second schema is ever added, restore the generated forms.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      check_ins: {
        Row: {
          checked_in_on: string
          created_at: string
          energy: number | null
          id: string
          mood: number | null
          note: string | null
          profile_id: string
        }
        Insert: {
          checked_in_on: string
          created_at?: string
          energy?: number | null
          id?: string
          mood?: number | null
          note?: string | null
          profile_id: string
        }
        Update: {
          checked_in_on?: string
          created_at?: string
          energy?: number | null
          id?: string
          mood?: number | null
          note?: string | null
          profile_id?: string
        }
      }
      constraints: {
        Row: {
          created_at: string
          hard: boolean
          id: string
          kind: Database["public"]["Enums"]["constraint_kind"]
          profile_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          hard?: boolean
          id?: string
          kind: Database["public"]["Enums"]["constraint_kind"]
          profile_id: string
          value: Json
        }
        Update: {
          created_at?: string
          hard?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["constraint_kind"]
          profile_id?: string
          value?: Json
        }
      }
      experiment_results: {
        Row: {
          baseline_value: number
          decision: Database["public"]["Enums"]["experiment_decision"]
          evaluated_at: string
          experiment_id: string
          id: string
          metric: string
          metric_class: Database["public"]["Enums"]["metric_class"]
          observed_value: number
          profile_id: string
        }
        Insert: {
          baseline_value: number
          decision: Database["public"]["Enums"]["experiment_decision"]
          evaluated_at?: string
          experiment_id: string
          id?: string
          metric: string
          metric_class: Database["public"]["Enums"]["metric_class"]
          observed_value: number
          profile_id: string
        }
        Update: {
          baseline_value?: number
          decision?: Database["public"]["Enums"]["experiment_decision"]
          evaluated_at?: string
          experiment_id?: string
          id?: string
          metric?: string
          metric_class?: Database["public"]["Enums"]["metric_class"]
          observed_value?: number
          profile_id?: string
        }
      }
      experiments: {
        Row: {
          baseline: Json
          change_description: string
          created_at: string
          end_date: string
          goal_id: string
          hypothesis: string
          id: string
          metric_key: string
          profile_id: string
          start_date: string
          status: Database["public"]["Enums"]["experiment_status"]
          updated_at: string
          variable: string
        }
        Insert: {
          baseline: Json
          change_description: string
          created_at?: string
          end_date: string
          goal_id: string
          hypothesis: string
          id?: string
          metric_key: string
          profile_id: string
          start_date: string
          status?: Database["public"]["Enums"]["experiment_status"]
          updated_at?: string
          variable: string
        }
        Update: {
          baseline?: Json
          change_description?: string
          created_at?: string
          end_date?: string
          goal_id?: string
          hypothesis?: string
          id?: string
          metric_key?: string
          profile_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["experiment_status"]
          updated_at?: string
          variable?: string
        }
      }
      goal_metrics: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          metric_key: string
          profile_id: string
          start_value: number
          target_value: number
          unit: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          metric_key: string
          profile_id: string
          start_value: number
          target_value: number
          unit: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          metric_key?: string
          profile_id?: string
          start_value?: number
          target_value?: number
          unit?: string
        }
      }
      goals: {
        Row: {
          ai_proposal: Json | null
          ai_proposal_at: string | null
          archetype: Database["public"]["Enums"]["goal_archetype"]
          classified_by: Database["public"]["Enums"]["goal_classified_by"]
          created_at: string
          id: string
          priority: number
          profile_id: string
          raw_text: string
          status: Database["public"]["Enums"]["goal_status"]
          target_date: string | null
          updated_at: string
        }
        Insert: {
          ai_proposal?: Json | null
          ai_proposal_at?: string | null
          archetype?: Database["public"]["Enums"]["goal_archetype"]
          classified_by?: Database["public"]["Enums"]["goal_classified_by"]
          created_at?: string
          id?: string
          priority?: number
          profile_id: string
          raw_text: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          ai_proposal?: Json | null
          ai_proposal_at?: string | null
          archetype?: Database["public"]["Enums"]["goal_archetype"]
          classified_by?: Database["public"]["Enums"]["goal_classified_by"]
          created_at?: string
          id?: string
          priority?: number
          profile_id?: string
          raw_text?: string
          status?: Database["public"]["Enums"]["goal_status"]
          target_date?: string | null
          updated_at?: string
        }
      }
      insights: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          kind: Database["public"]["Enums"]["insight_kind"]
          profile_id: string
          statement: string
        }
        Insert: {
          created_at?: string
          evidence: Json
          id?: string
          kind: Database["public"]["Enums"]["insight_kind"]
          profile_id: string
          statement: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          kind?: Database["public"]["Enums"]["insight_kind"]
          profile_id?: string
          statement?: string
        }
      }
      measurements: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          metric_class: Database["public"]["Enums"]["metric_class"]
          metric_key: string
          profile_id: string
          unit: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          metric_class: Database["public"]["Enums"]["metric_class"]
          metric_key: string
          profile_id: string
          unit: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          metric_class?: Database["public"]["Enums"]["metric_class"]
          metric_key?: string
          profile_id?: string
          unit?: string
          value?: number
        }
      }
      personal_rules: {
        Row: {
          active: boolean
          confidence: number
          created_at: string
          id: string
          profile_id: string
          rule_key: string
          rule_value: Json
          source_experiment_id: string | null
          trial: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          confidence: number
          created_at?: string
          id?: string
          profile_id: string
          rule_key: string
          rule_value: Json
          source_experiment_id?: string | null
          trial?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          confidence?: number
          created_at?: string
          id?: string
          profile_id?: string
          rule_key?: string
          rule_value?: Json
          source_experiment_id?: string | null
          trial?: boolean
          updated_at?: string
        }
      }
      plan_items: {
        Row: {
          created_at: string
          details: Json
          domain: Database["public"]["Enums"]["plan_domain"]
          id: string
          plan_id: string
          planned_duration_min: number | null
          profile_id: string
          rationale: string | null
          rationale_based_on: Json
          scheduled_on: string
          status: Database["public"]["Enums"]["plan_item_status"]
          status_changed_at: string | null
          time_slot: string | null
          title: string
          track: Database["public"]["Enums"]["plan_track"]
        }
        Insert: {
          created_at?: string
          details?: Json
          domain: Database["public"]["Enums"]["plan_domain"]
          id?: string
          plan_id: string
          planned_duration_min?: number | null
          profile_id: string
          rationale?: string | null
          rationale_based_on?: Json
          scheduled_on: string
          status?: Database["public"]["Enums"]["plan_item_status"]
          status_changed_at?: string | null
          time_slot?: string | null
          title: string
          track?: Database["public"]["Enums"]["plan_track"]
        }
        Update: {
          created_at?: string
          details?: Json
          domain?: Database["public"]["Enums"]["plan_domain"]
          id?: string
          plan_id?: string
          planned_duration_min?: number | null
          profile_id?: string
          rationale?: string | null
          rationale_based_on?: Json
          scheduled_on?: string
          status?: Database["public"]["Enums"]["plan_item_status"]
          status_changed_at?: string | null
          time_slot?: string | null
          title?: string
          track?: Database["public"]["Enums"]["plan_track"]
        }
      }
      plans: {
        Row: {
          assumptions: Json
          created_at: string
          generated_by: Database["public"]["Enums"]["plan_source"]
          goal_id: string
          id: string
          profile_id: string
          rationale: Json
          strategy: Json
          superseded_by: string | null
          week_start: string
        }
        Insert: {
          assumptions?: Json
          created_at?: string
          generated_by?: Database["public"]["Enums"]["plan_source"]
          goal_id: string
          id?: string
          profile_id: string
          rationale?: Json
          strategy: Json
          superseded_by?: string | null
          week_start: string
        }
        Update: {
          assumptions?: Json
          created_at?: string
          generated_by?: Database["public"]["Enums"]["plan_source"]
          goal_id?: string
          id?: string
          profile_id?: string
          rationale?: Json
          strategy?: Json
          superseded_by?: string | null
          week_start?: string
        }
      }
      profiles: {
        Row: {
          birth_year: number | null
          created_at: string
          height_cm: number | null
          id: string
          life_situation: string | null
          mind: Json
          nutrition: Json
          onboarding_stage: number
          sex_at_birth: string | null
          sleep: Json
          sport: Json
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          birth_year?: number | null
          created_at?: string
          height_cm?: number | null
          id: string
          life_situation?: string | null
          mind?: Json
          nutrition?: Json
          onboarding_stage?: number
          sex_at_birth?: string | null
          sleep?: Json
          sport?: Json
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          birth_year?: number | null
          created_at?: string
          height_cm?: number | null
          id?: string
          life_situation?: string | null
          mind?: Json
          nutrition?: Json
          onboarding_stage?: number
          sex_at_birth?: string | null
          sleep?: Json
          sport?: Json
          updated_at?: string
          weight_kg?: number | null
        }
      }
      schedules: {
        Row: {
          commitments: Json
          created_at: string
          free_slots: Json
          id: string
          profile_id: string
          sleep_time: string | null
          updated_at: string
          wake_time: string | null
          weekend_differs: boolean
          work_pattern: string | null
        }
        Insert: {
          commitments?: Json
          created_at?: string
          free_slots?: Json
          id?: string
          profile_id: string
          sleep_time?: string | null
          updated_at?: string
          wake_time?: string | null
          weekend_differs?: boolean
          work_pattern?: string | null
        }
        Update: {
          commitments?: Json
          created_at?: string
          free_slots?: Json
          id?: string
          profile_id?: string
          sleep_time?: string | null
          updated_at?: string
          wake_time?: string | null
          weekend_differs?: boolean
          work_pattern?: string | null
        }
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      constraint_kind:
        | "time"
        | "dietary"
        | "equipment"
        | "dislike"
        | "medical_selfreport"
      experiment_decision: "keep" | "discard" | "continue"
      experiment_status:
        | "proposed"
        | "running"
        | "evaluating"
        | "adopted"
        | "rejected"
        | "extended"
        | "aborted"
      goal_archetype:
        | "body_composition"
        | "strength"
        | "endurance"
        | "sleep_recovery"
        | "nutrition_quality"
        | "habit_routine"
        | "general_health"
      goal_classified_by: "ai" | "keywords" | "user"
      goal_status: "active" | "paused" | "reached" | "abandoned"
      insight_kind: "pattern" | "progress" | "experiment_result" | "warning"
      metric_class: "behavior" | "outcome"
      plan_domain:
        | "training"
        | "nutrition"
        | "movement"
        | "sleep"
        | "self_improvement"
        | "priority"
      plan_item_status:
        | "planned"
        | "done"
        | "moved"
        | "missed"
        | "not_relevant"
        | "unknown"
      plan_source: "engine" | "engine_ai"
      plan_track: "goal" | "baseline"
    }
    CompositeTypes: Record<never, never>
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]

export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      constraint_kind: [
        "time",
        "dietary",
        "equipment",
        "dislike",
        "medical_selfreport",
      ],
      experiment_decision: ["keep", "discard", "continue"],
      experiment_status: [
        "proposed",
        "running",
        "evaluating",
        "adopted",
        "rejected",
        "extended",
        "aborted",
      ],
      goal_archetype: [
        "body_composition",
        "strength",
        "endurance",
        "sleep_recovery",
        "nutrition_quality",
        "habit_routine",
        "general_health",
      ],
      goal_classified_by: ["ai", "keywords", "user"],
      goal_status: ["active", "paused", "reached", "abandoned"],
      insight_kind: ["pattern", "progress", "experiment_result", "warning"],
      metric_class: ["behavior", "outcome"],
      plan_domain: [
        "training",
        "nutrition",
        "movement",
        "sleep",
        "self_improvement",
        "priority",
      ],
      plan_item_status: [
        "planned",
        "done",
        "moved",
        "missed",
        "not_relevant",
        "unknown",
      ],
      plan_source: ["engine", "engine_ai"],
      plan_track: ["goal", "baseline"],
    },
  },
} as const

// types/database.ts

export type Gender = "male" | "female" | "other" | "M" | "F";
export type UserRole = "admin" | "moderator" | "premium" | "user";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  roles?: UserRole[];
  position_person_id?: string | null;
  position_parent_id?: string | null;
  position_grand_id?: string | null;
  claim_father?: string | null;
  claim_grand?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Person {
  id: string;
  name: string;
  gender: string; // "male" | "female" | "M" | "F"
  father_id: string | null;
  mother_id: string | null;
  spouse_id: string | null;
  more_spouse_ids?: string[] | null;
  is_living: boolean;
  birth_bs?: string | null; // e.g. "2045-06-12" or "2045"
  death_bs?: string | null; // e.g. "2080-01-05"
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  ai_summary?: string | null;
  ai_tags?: string[] | null;
  ai_embedding?: number[] | null;
  is_branch_locked?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AiSuggestion {
  id: string;
  source_person_id: string;
  target_person_id: string;
  suggestion_type: "potential_father" | "potential_mother" | "potential_sibling" | "potential_spouse";
  confidence_score: number;
  reasoning_ne: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  source_person?: Person;
  target_person?: Person;
}

export interface FamilyAnalyticsOverview {
  total_members: number;
  living_members: number;
  deceased_members: number;
  male_count: number;
  female_count: number;
  other_gender_count: number;
}

export interface LongevityBracket {
  age_bracket: string;
  count: number;
}

export interface GeographicItem {
  location: string;
  count: number;
}

export interface FamilyAnalyticsData {
  overview: FamilyAnalyticsOverview;
  longevity: LongevityBracket[];
  geography: GeographicItem[];
  max_generations: number;
}

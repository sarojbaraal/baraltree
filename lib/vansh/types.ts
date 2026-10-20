// Types for the Vansavali app. Mirrors the shape returned by the `get_people` RPC.

export type Gender = "M" | "F" | "O" | "" | null;
export type Role = "admin" | "moderator" | "premium" | "general";
export type TabKey = "fam" | "tree" | "mem" | "mine" | "admin" | "ov";

export interface VPerson {
  id: string;
  name: string;
  gender: string | null;
  father_id: string | null;
  mother_id: string | null;
  spouse_id: string | null;
  more_spouse_ids?: string[] | null;
  is_living: boolean;
  birth_bs?: string | null;
  death_bs?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  maiden_name?: string | null;
  married_name?: string | null;
  birth_place?: string | null;
  email?: string | null;
  facebook?: string | null;
  photo_url?: string | null;
  ai_summary?: string | null;
  ai_tags?: string[] | null;
  is_locked?: boolean;
  name_only?: boolean;
  created_at: string;
}

export interface VProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null; // legacy: admin | member | pending
  roles?: string[] | null;
  position_person_id?: string | null;
  position_parent_id?: string | null;
  position_grand_id?: string | null;
  claim_father?: string | null;
  claim_grand?: string | null;
  custom_anchor?: { target_id: string; relation_type: string } | null;
}

export type RequestAction = "add" | "update" | "delete";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface ChangeRequest {
  id: string;
  requested_by: string;
  action: RequestAction;
  person_id: string | null;
  payload: Record<string, unknown> | null;
  note: string | null;
  status: RequestStatus;
  reject_reason?: string | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

/** A change_requests row ready to be inserted. */
export interface NewRequest {
  requested_by: string;
  action: RequestAction;
  person_id: string | null;
  payload: Record<string, unknown>;
  note: string | null;
}

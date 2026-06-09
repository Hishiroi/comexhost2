export type RoleName = 'teacher' | 'coordinator' | 'master' | 'admin';
export type RoleLevel = 1 | 2 | 3 | 4;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: RoleName;
  role_level: RoleLevel;
  /** Skill level 1–7 for Teacher, Coordinator, and Master (same column as API `teacher_rank`). */
  teacher_rank?: number | null;
}

/** Extended user row from `/api/users` or `/users/me/profile` (excluding password hash). */
export interface UserPublicProfile extends AuthUser {
  is_active?: boolean | number;
  teacher_rank?: number | null;
  mobile_phone?: string | null;
  telephone?: string | null;
  address?: string | null;
  department_subject?: string | null;
  position_title?: string | null;
  employee_id?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  office_room?: string | null;
  work_schedule?: string | null;
  civil_status?: string | null;
  nationality?: string | null;
  notes_other?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Body for PATCH /users/me/profile (partial). */
export type SelfProfilePayload = Partial<{
  mobile_phone: string | null;
  telephone: string | null;
  address: string | null;
  department_subject: string | null;
  position_title: string | null;
  employee_id: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  office_room: string | null;
  work_schedule: string | null;
  civil_status: string | null;
  nationality: string | null;
  notes_other: string | null;
  name: string;
  email: string;
  password: string;
}>;

/** Principal-only PATCH payload for `/api/users/:id`. */
export type AdminUserUpdatePayload = SelfProfilePayload &
  Partial<{
    name: string;
    email: string;
    password: string;
    role_level: RoleLevel;
    teacher_rank: number | null;
    is_active: boolean;
  }>;

export interface LoginResponse {
  token: string;
  user: AuthUser;
  redirect: string;
}

export interface ApiError {
  error: string;
  request_id?: string;
  details?: unknown;
}

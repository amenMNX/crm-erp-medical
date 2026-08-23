import { apiFetch } from "./api";

export interface Skill {
  id: number;
  name: string;
  category: string;
  category_label: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface EmployeeSkill {
  id: number;
  employee: number;
  employee_name: string;
  skill: number;
  skill_name: string;
  skill_category: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
  level_label: string;
  acquired_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingEnrollment {
  id: number;
  session: number;
  employee: number;
  employee_name: string;
  result: "pending" | "passed" | "failed" | "absent";
  result_label: string;
  score: number | null;
  certificate_issued: boolean;
  notes: string;
  enrolled_at: string;
  updated_at: string;
}

export interface TrainingSession {
  id: number;
  title: string;
  skill: number | null;
  skill_name: string;
  description: string;
  trainer: string;
  location: string;
  start_date: string;
  end_date: string;
  duration_hours: number;
  status: "planned" | "ongoing" | "completed" | "cancelled";
  status_label: string;
  max_participants: number;
  enrolled_count: number;
  cost: number;
  notes: string;
  enrollments: TrainingEnrollment[];
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

// Skills
export const fetchSkills = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ results: Skill[]; count: number }>(`/hr/skills/${qs}`);
};
export const createSkill = (data: Partial<Skill>) =>
  apiFetch<Skill>("/hr/skills/", { method: "POST", body: JSON.stringify(data) });
export const updateSkill = (id: number, data: Partial<Skill>) =>
  apiFetch<Skill>(`/hr/skills/${id}/`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteSkill = (id: number) =>
  apiFetch<void>(`/hr/skills/${id}/`, { method: "DELETE" });

// Employee skills
export const fetchEmployeeSkills = (employeeId?: number) => {
  const qs = employeeId ? `?employee=${employeeId}` : "";
  return apiFetch<{ results: EmployeeSkill[]; count: number }>(`/hr/employee-skills/${qs}`);
};
export const addEmployeeSkill = (data: Partial<EmployeeSkill>) =>
  apiFetch<EmployeeSkill>("/hr/employee-skills/", { method: "POST", body: JSON.stringify(data) });
export const updateEmployeeSkill = (id: number, data: Partial<EmployeeSkill>) =>
  apiFetch<EmployeeSkill>(`/hr/employee-skills/${id}/`, { method: "PATCH", body: JSON.stringify(data) });

// Training sessions
export const fetchTrainingSessions = (params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<{ results: TrainingSession[]; count: number }>(`/hr/training-sessions/${qs}`);
};
export const fetchUpcomingTrainings = () =>
  apiFetch<TrainingSession[]>("/hr/training-sessions/upcoming/");
export const createTrainingSession = (data: Partial<TrainingSession>) =>
  apiFetch<TrainingSession>("/hr/training-sessions/", { method: "POST", body: JSON.stringify(data) });
export const updateTrainingSession = (id: number, data: Partial<TrainingSession>) =>
  apiFetch<TrainingSession>(`/hr/training-sessions/${id}/`, { method: "PATCH", body: JSON.stringify(data) });

// Enrollments
export const createEnrollment = (data: Partial<TrainingEnrollment>) =>
  apiFetch<TrainingEnrollment>("/hr/training-enrollments/", { method: "POST", body: JSON.stringify(data) });
export const updateEnrollment = (id: number, data: Partial<TrainingEnrollment>) =>
  apiFetch<TrainingEnrollment>(`/hr/training-enrollments/${id}/`, { method: "PATCH", body: JSON.stringify(data) });

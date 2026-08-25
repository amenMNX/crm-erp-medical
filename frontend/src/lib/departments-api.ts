// src/lib/departments-api.ts
import { apiFetch } from "./api";

export type ApiDepartment = {
    id: number;
    name: string;
    description: string;
    is_active: boolean;
    user_count: number;
    created_at: string;
    updated_at: string;
};

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
    return Array.isArray(data) ? data : data.results;
}

export async function fetchDepartments(): Promise<ApiDepartment[]> {
    const data = await apiFetch<Paginated<ApiDepartment>>("/accounts/departments/");
    return unwrap(data);
}

export async function createDepartment(name: string, description?: string): Promise<ApiDepartment> {
    return apiFetch<ApiDepartment>("/accounts/departments/", {
        method: "POST",
        body: { name, description },
    });
}

export async function updateDepartment(id: number, data: Partial<ApiDepartment>): Promise<ApiDepartment> {
    return apiFetch<ApiDepartment>(`/accounts/departments/${id}/`, {
        method: "PATCH",
        body: data,
    });
}

export async function deleteDepartment(id: number): Promise<void> {
    return apiFetch(`/accounts/departments/${id}/`, { method: "DELETE" });
}
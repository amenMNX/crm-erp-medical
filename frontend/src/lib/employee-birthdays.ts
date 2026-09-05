/**
 * Birthday utilities — derived purely from the employees you already fetch.
 * No additional API call needed.
 */

import type { ApiEmployee } from "./employees-api";

export type EmployeeBirthday = {
  id: number;
  employee_number: string;
  name: string;
  date_naissance: string;   // YYYY-MM-DD (stored DOB)
  next_birthday: string;    // YYYY-MM-DD (this or next year)
  days_until: number;       // 0 = today, negative impossible (always upcoming)
  age_turning: number;      // age they'll turn on next_birthday
  department: string;
  job_title: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Given an employee list and a window in days (default 60), return upcoming
 * birthdays sorted by how soon they are.
 */
export function getUpcomingBirthdays(
  employees: ApiEmployee[],
  windowDays = 30,
): EmployeeBirthday[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results: EmployeeBirthday[] = [];

  for (const emp of employees) {
    if (!emp.date_naissance || !emp.is_active) continue;

    const dob = new Date(emp.date_naissance);
    if (isNaN(dob.getTime())) continue;

    const thisYear = today.getFullYear();

    // Birthday this calendar year
    let bday = new Date(thisYear, dob.getMonth(), dob.getDate());
    bday.setHours(0, 0, 0, 0);

    // If it already passed this year, use next year
    if (bday < today) {
      bday = new Date(thisYear + 1, dob.getMonth(), dob.getDate());
      bday.setHours(0, 0, 0, 0);
    }

    const daysUntil = Math.round((bday.getTime() - today.getTime()) / 86_400_000);
    if (daysUntil > windowDays) continue;

    const ageTurning = bday.getFullYear() - dob.getFullYear();

    results.push({
      id: emp.id,
      employee_number: emp.employee_number,
      name: `${emp.first_name} ${emp.last_name}`.trim(),
      date_naissance: emp.date_naissance,
      next_birthday: `${bday.getFullYear()}-${pad(bday.getMonth() + 1)}-${pad(bday.getDate())}`,
      days_until: daysUntil,
      age_turning: ageTurning,
      department: emp.department,
      job_title: emp.job_title,
    });
  }

  return results.sort((a, b) => a.days_until - b.days_until);
}
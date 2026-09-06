import { getDatabase } from "./database";
import { Employee } from "../types";
import { requestBackgroundSync } from "../cloud/sync";

const HOURLY_RATE = 12.0; // £12 per hour
type EmployeeRow = Omit<Employee, "isClockedIn"> & { isClockedIn: number };

export async function initializeEmployees() {
  const db = getDatabase();
  const employees = ["Bilal", "Juweria", "Yusuf"];

  for (const name of employees) {
    try {
      await db.runAsync(
        "INSERT INTO employees (name, hourly_rate) VALUES (?, ?)",
        [name, HOURLY_RATE]
      );
    } catch (error: any) {
      if (!error.message.includes("UNIQUE constraint failed")) {
        throw error;
      }
      // Employee already exists, skip
    }
  }

}

export async function getEmployees(): Promise<Employee[]> {
  const db = getDatabase();
  const rows = (await db.getAllAsync(
    "SELECT id, name, hourly_rate as hourlyRate, face_id as faceId, is_clocked_in as isClockedIn FROM employees ORDER BY name"
  )) as EmployeeRow[];
  return rows.map((row) => ({ ...row, isClockedIn: !!row.isClockedIn }));
}

export async function getEmployeeByName(name: string): Promise<Employee | null> {
  const db = getDatabase();
  const row = (await db.getFirstAsync(
    "SELECT id, name, hourly_rate as hourlyRate, face_id as faceId, is_clocked_in as isClockedIn FROM employees WHERE name = ?",
    [name]
  )) as EmployeeRow | null;
  return row ? { ...row, isClockedIn: !!row.isClockedIn } : null;
}

export async function addEmployee(
  name: string,
  hourlyRate: number = HOURLY_RATE
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    "INSERT INTO employees (name, hourly_rate) VALUES (?, ?)",
    [name, hourlyRate]
  );
  requestBackgroundSync();
}

export async function updateHourlyRate(employeeId: number, hourlyRate: number) {
  const db = getDatabase();
  await db.runAsync("UPDATE employees SET hourly_rate = ? WHERE id = ?", [
    hourlyRate,
    employeeId,
  ]);
    requestBackgroundSync();
}

export async function updateEmployeeFaceId(employeeId: number, faceId: string | null) {
  const db = getDatabase();
  await db.runAsync("UPDATE employees SET face_id = ? WHERE id = ?", [faceId, employeeId]);
  requestBackgroundSync();
}

export async function deleteEmployee(employeeId: number) {
  const db = getDatabase();
  const openShift = await db.getFirstAsync(
    "SELECT id FROM shifts WHERE employee_id = ? AND clock_out_time IS NULL LIMIT 1",
    [employeeId]
  );
  if (openShift) {
    throw new Error("This employee is currently clocked in. Clock them out before deleting them.");
  }
  await db.runAsync("DELETE FROM employees WHERE id = ?", [employeeId]);
  requestBackgroundSync();
}

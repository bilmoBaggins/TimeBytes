import { getDatabase } from "../database/database";
import { cloudSyncConfigured, supabase } from "./supabase";

let syncInProgress = false;
type SyncedTable = "device_employees" | "device_shifts" | "device_admin_faces";

async function syncRows(
  table: SyncedTable,
  userId: string,
  rows: Array<{ local_id: number }>
): Promise<void> {
  if (!supabase) return;

  const { data: remoteRows, error: fetchError } = await supabase
    .from(table)
    .select("local_id")
    .eq("user_id", userId);
  if (fetchError) throw fetchError;

  if (rows.length) {
    const { error: upsertError } = await supabase
      .from(table)
      .upsert(rows, { onConflict: "user_id,local_id" });
    if (upsertError) throw upsertError;
  }

  const localIds = new Set(rows.map((row) => row.local_id));
  const staleIds = (remoteRows ?? [])
    .map((row) => row.local_id)
    .filter((localId) => !localIds.has(localId));
  if (!staleIds.length) return;

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq("user_id", userId)
    .in("local_id", staleIds);
  if (deleteError) throw deleteError;
}

export async function initializeCloudSync(): Promise<void> {
  if (!cloudSyncConfigured || !supabase) return;

  const ownerEmail = process.env.EXPO_PUBLIC_SUPABASE_EMAIL;
  const ownerPassword = process.env.EXPO_PUBLIC_SUPABASE_PASSWORD;

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (ownerEmail && ownerPassword) {
    // Data must live under the shared owner account so the web dashboard can
    // read it. Drop a stale anonymous session from before the account was set.
    if (session && !session.user.is_anonymous) return;
    if (session) {
      await supabase.auth.signOut({ scope: "local" });
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword,
    });
    if (error) {
      console.warn(
        "Cloud sync sign-in failed. Create this user in Supabase Dashboard > Authentication > Users:",
        error.message
      );
    }
    return;
  }

  if (!session) {
    await supabase.auth.signInAnonymously();
  }
}

export async function syncLocalDatabase(): Promise<void> {
  if (!cloudSyncConfigured || !supabase || syncInProgress) return;

  syncInProgress = true;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;

    const db = getDatabase();
    const employees = await db.getAllAsync<any>(
      "SELECT id, name, hourly_rate as hourlyRate, face_id as faceId, is_clocked_in as isClockedIn FROM employees"
    );
    const shifts = await db.getAllAsync<any>(
      "SELECT id, employee_id as employeeId, employee_name as employeeName, date, clock_in_time as clockInTime, clock_out_time as clockOutTime, hourly_pay as hourlyPay FROM shifts"
    );
    const adminFaces = await db.getAllAsync<any>(
      "SELECT id, name, face_id as faceId FROM admin_faces"
    );

    const employeeRows = employees.map((employee) => ({
      user_id: userId,
      local_id: employee.id,
      name: employee.name,
      hourly_rate: employee.hourlyRate,
      face_id: employee.faceId,
      is_clocked_in: Boolean(employee.isClockedIn),
    }));
    const shiftRows = shifts.map((shift) => ({
      user_id: userId,
      local_id: shift.id,
      employee_id: shift.employeeId,
      employee_name: shift.employeeName,
      date: shift.date,
      clock_in_time: shift.clockInTime,
      clock_out_time: shift.clockOutTime,
      hourly_pay: shift.hourlyPay,
    }));
    const adminFaceRows = adminFaces.map((adminFace) => ({
      user_id: userId,
      local_id: adminFace.id,
      name: adminFace.name,
      face_id: adminFace.faceId,
    }));

    await syncRows("device_employees", userId, employeeRows);
    await syncRows("device_shifts", userId, shiftRows);
    await syncRows("device_admin_faces", userId, adminFaceRows);
  } finally {
    syncInProgress = false;
  }
}

export function requestBackgroundSync(): void {
  void syncLocalDatabase().catch((error) => {
    // Offline operation is expected, but log so a stuck sync is diagnosable.
    console.warn("Background cloud sync failed; will retry on next sync:", error);
  });
}

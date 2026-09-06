import { getDatabase } from "./database";
import { requestBackgroundSync } from "../cloud/sync";

export type AdminFace = {
  id: number;
  name: string;
  faceId: string | null;
};

export async function getAdminFaces(): Promise<AdminFace[]> {
  const db = getDatabase();
  return db.getAllAsync<AdminFace>(
    "SELECT id, name, face_id as faceId FROM admin_faces ORDER BY name"
  );
}

export async function addAdminFace(name: string): Promise<AdminFace> {
  const db = getDatabase();
  const result = await db.runAsync("INSERT INTO admin_faces (name) VALUES (?)", [name]);
  requestBackgroundSync();
  return { id: result.lastInsertRowId, name, faceId: null };
}

export async function updateAdminFace(id: number, name: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync("UPDATE admin_faces SET name = ? WHERE id = ?", [name, id]);
  requestBackgroundSync();
}

export async function setAdminFaceId(id: number, faceId: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync("UPDATE admin_faces SET face_id = ? WHERE id = ?", [faceId, id]);
  requestBackgroundSync();
}

export async function deleteAdminFace(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync("DELETE FROM admin_faces WHERE id = ?", [id]);
  requestBackgroundSync();
}
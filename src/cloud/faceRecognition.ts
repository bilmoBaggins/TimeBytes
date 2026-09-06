import { cloudSyncConfigured, supabase } from "./supabase";

function requireFaceService() {
  if (!cloudSyncConfigured || !supabase) {
    throw new Error("Cloud face recognition is not configured. Please check the Supabase/AWS setup.");
  }
  return supabase;
}

async function throwFunctionError(error: unknown): Promise<never> {
  const response = (error as { context?: Response })?.context;
  if (response) {
    try {
      const body = await response.clone().json();
      if (typeof body?.error === "string") throw new Error(body.error);
    } catch (parseError) {
      if (parseError instanceof Error && parseError.message !== "Unexpected end of JSON input") {
        throw parseError;
      }
    }
  }
  throw error;
}

export async function enrollEmployeeFace(employeeId: number, imageBase64: string) {
  const client = requireFaceService();
  const { data, error } = await client.functions.invoke("face-recognition", {
    body: { action: "enroll", employeeId, imageBase64 },
  });
  if (error) await throwFunctionError(error);
  if (!data?.faceId) throw new Error("No face was detected. Try again in better light.");
  return data.faceId as string;
}

export async function recognizeEmployeeFace(imageBase64: string) {
  const client = requireFaceService();
  const { data, error } = await client.functions.invoke("face-recognition", {
    body: { action: "recognize", imageBase64 },
  });
  if (error) await throwFunctionError(error);
  if (!data?.employeeId) {
    throw new Error("Face not recognized. Please try again.");
  }
  return Number(data.employeeId);
}

export async function enrollAdminFace(adminId: number, name: string, imageBase64: string) {
  const client = requireFaceService();
  const { data, error } = await client.functions.invoke("face-recognition", {
    body: { action: "enrollAdmin", adminId, name, imageBase64 },
  });
  if (error) await throwFunctionError(error);
  if (!data?.faceId) throw new Error("No face was detected. Try again in better light.");
  return data.faceId as string;
}

export async function recognizeAdminFace(imageBase64: string) {
  const client = requireFaceService();
  const { data, error } = await client.functions.invoke("face-recognition", {
    body: { action: "recognizeAdmin", imageBase64 },
  });
  if (error) await throwFunctionError(error);
  if (!data?.adminId) throw new Error("Admin face not recognized. Please try again.");
  return Number(data.adminId);
}

export async function removeAdminFace(adminId: number, faceId: string) {
  const client = requireFaceService();
  const { error } = await client.functions.invoke("face-recognition", {
    body: { action: "deleteAdmin", adminId, faceId },
  });
  if (error) await throwFunctionError(error);
}

export async function removeEmployeeFace(employeeId: number, faceId: string) {
  const client = requireFaceService();
  const { error } = await client.functions.invoke("face-recognition", {
    body: { action: "deleteEmployee", employeeId, faceId },
  });
  if (error) await throwFunctionError(error);
}

export async function resetDeviceFaceData() {
  const client = requireFaceService();
  const { error } = await client.functions.invoke("face-recognition", {
    body: { action: "resetDevice" },
  });
  if (error) await throwFunctionError(error);
}

// @ts-nocheck
import { DeleteFacesCommand, RekognitionClient, IndexFacesCommand, SearchFacesByImageCommand } from "npm:@aws-sdk/client-rekognition";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function imageBytes(value: string) {
  const base64 = value.replace(/^data:image\/[a-z+]+;base64,/, "");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

const supabaseUrl = Deno.env.get("PROJECT_URL")!;
const supabaseAnonKey = Deno.env.get("PROJECT_ANON_KEY")!;
const rekognition = new RekognitionClient({
  region: Deno.env.get("AWS_REGION") ?? "eu-west-2",
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
  },
});
const collectionId = Deno.env.get("AWS_REKOGNITION_COLLECTION_ID") ?? "biryani-bytes-employees";
const threshold = Number(Deno.env.get("AWS_FACE_MATCH_THRESHOLD") ?? "90");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await request.json();
    if (body.action === "enroll") {
      const bytes = imageBytes(body.imageBase64);
      const employeeId = Number(body.employeeId);
      const { data: employee, error: employeeError } = await userClient
        .from("device_employees")
        .select("local_id")
        .eq("user_id", userData.user.id)
        .eq("local_id", employeeId)
        .maybeSingle();
      if (employeeError) throw employeeError;
      if (!employee) return json({ error: "Employee not found" }, 404);

      const result = await rekognition.send(new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: bytes },
        ExternalImageId: `employee-${employeeId}`,
        MaxFaces: 1,
        DetectionAttributes: [],
      }));
      const face = result.FaceRecords?.[0]?.Face;
      if (!face?.FaceId) return json({ error: "No face detected" }, 422);

      await userClient.from("device_employees").update({ face_id: face.FaceId }).eq("user_id", userData.user.id).eq("local_id", employeeId);
      return json({ faceId: face.FaceId });
    }

    if (body.action === "recognize") {
      const bytes = imageBytes(body.imageBase64);
      const result = await rekognition.send(new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: { Bytes: bytes },
        FaceMatchThreshold: threshold,
        MaxFaces: 1,
      }));
      const externalId = result.FaceMatches?.[0]?.Face?.ExternalImageId;
      const employeeId = externalId?.startsWith("employee-") ? externalId.slice("employee-".length) : null;
      if (!employeeId) return json({ employeeId: null });

      const { data: employee } = await userClient
        .from("device_employees")
        .select("local_id")
        .eq("user_id", userData.user.id)
        .eq("local_id", Number(employeeId))
        .maybeSingle();
      return json({ employeeId: employee?.local_id ?? null });
    }

    if (body.action === "enrollAdmin") {
      const bytes = imageBytes(body.imageBase64);
      const adminId = Number(body.adminId);
      const name = String(body.name ?? "").trim();
      if (!adminId || !name) return json({ error: "Admin name is required" }, 422);

      const result = await rekognition.send(new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: bytes },
        ExternalImageId: `admin-${adminId}`,
        MaxFaces: 1,
        DetectionAttributes: [],
      }));
      const face = result.FaceRecords?.[0]?.Face;
      if (!face?.FaceId) return json({ error: "No face detected" }, 422);

      const { error } = await userClient.from("device_admin_faces").upsert({
        user_id: userData.user.id,
        local_id: adminId,
        name,
        face_id: face.FaceId,
      });
      if (error) throw error;
      return json({ faceId: face.FaceId });
    }

    if (body.action === "recognizeAdmin") {
      const bytes = imageBytes(body.imageBase64);
      const result = await rekognition.send(new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: { Bytes: bytes },
        FaceMatchThreshold: threshold,
        MaxFaces: 1,
      }));
      const externalId = result.FaceMatches?.[0]?.Face?.ExternalImageId;
      const adminId = externalId?.startsWith("admin-") ? Number(externalId.slice("admin-".length)) : null;
      if (!adminId) return json({ adminId: null });

      const { data: admin } = await userClient
        .from("device_admin_faces")
        .select("local_id")
        .eq("user_id", userData.user.id)
        .eq("local_id", adminId)
        .maybeSingle();
      return json({ adminId: admin?.local_id ?? null });
    }

    if (body.action === "deleteAdmin") {
      const adminId = Number(body.adminId);
      const faceId = String(body.faceId ?? "");
      const { data: admin } = await userClient
        .from("device_admin_faces")
        .select("face_id")
        .eq("user_id", userData.user.id)
        .eq("local_id", adminId)
        .maybeSingle();
      if (!admin || admin.face_id !== faceId) return json({ error: "Admin face not found" }, 404);

      await rekognition.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: [faceId] }));
      const { error } = await userClient.from("device_admin_faces").delete().eq("user_id", userData.user.id).eq("local_id", adminId);
      if (error) throw error;
      return json({ success: true });
    }

    if (body.action === "deleteEmployee") {
      const employeeId = Number(body.employeeId);
      const faceId = String(body.faceId ?? "");
      const { data: employee } = await userClient
        .from("device_employees")
        .select("face_id")
        .eq("user_id", userData.user.id)
        .eq("local_id", employeeId)
        .maybeSingle();
      if (!employee || employee.face_id !== faceId) return json({ error: "Employee face not found" }, 404);

      await rekognition.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: [faceId] }));
      const { error } = await userClient.from("device_employees").update({ face_id: null }).eq("user_id", userData.user.id).eq("local_id", employeeId);
      if (error) throw error;
      return json({ success: true });
    }

    if (body.action === "resetDevice") {
      const [{ data: employees, error: employeeError }, { data: admins, error: adminError }] = await Promise.all([
        userClient.from("device_employees").select("face_id").eq("user_id", userData.user.id),
        userClient.from("device_admin_faces").select("face_id").eq("user_id", userData.user.id),
      ]);
      if (employeeError) throw employeeError;
      if (adminError) throw adminError;

      const faceIds = [...(employees ?? []), ...(admins ?? [])]
        .map((record) => record.face_id)
        .filter((faceId): faceId is string => Boolean(faceId));
      if (faceIds.length) {
        await rekognition.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: faceIds }));
      }

      const [{ error: shiftError }, { error: employeeDeleteError }, { error: adminDeleteError }] = await Promise.all([
        userClient.from("device_shifts").delete().eq("user_id", userData.user.id),
        userClient.from("device_employees").delete().eq("user_id", userData.user.id),
        userClient.from("device_admin_faces").delete().eq("user_id", userData.user.id),
      ]);
      if (shiftError) throw shiftError;
      if (employeeDeleteError) throw employeeDeleteError;
      if (adminDeleteError) throw adminDeleteError;
      return json({ success: true });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Face recognition failed" }, 500);
  }
});

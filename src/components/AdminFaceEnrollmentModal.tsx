import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { enrollAdminFace } from "../cloud/faceRecognition";
import { AdminFace } from "../database/adminFaces";

type Props = {
  admin: AdminFace | null;
  onClose: () => void;
  onEnrolled: (faceId: string) => Promise<void>;
};

export default function AdminFaceEnrollmentModal({ admin, onClose, onEnrolled }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setBusy(false);
    setMessage("");
  }, [admin?.id]);

  async function captureFace() {
    if (!cameraRef.current || !admin || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7, shutterSound: false });
      if (!photo?.base64) throw new Error("The camera did not return an image.");
      await onEnrolled(await enrollAdminFace(admin.id, admin.name, photo.base64));
      onClose();
    } catch (error: any) {
      setMessage(error.message || "Could not enroll this admin face.");
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    setMessage("");
    onClose();
  }

  return (
    <Modal visible={admin !== null} animationType="slide" onRequestClose={closeModal}>
      <View style={styles.container}>
        <Text style={styles.title}>Add Admin Face</Text>
        <Text style={styles.subtitle}>Enroll {admin?.name} in good light.</Text>
        {!permission ? <ActivityIndicator color="#F28C00" /> : !permission.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.message}>Camera access is needed to enroll an admin face.</Text>
            <Pressable style={styles.primaryButton} onPress={requestPermission}><Text style={styles.buttonText}>Allow Camera</Text></Pressable>
          </View>
        ) : <>
          <CameraView ref={cameraRef} style={styles.camera} facing="front" />
          {!!message && <Text style={styles.error}>{message}</Text>}
          <Pressable style={styles.primaryButton} onPress={captureFace} disabled={busy}>{busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Capture Face</Text>}</Pressable>
        </>}
        <Pressable style={styles.cancelButton} onPress={closeModal} disabled={busy}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FBF3EC", padding: 20, justifyContent: "center" },
  title: { color: "#B85F00", fontSize: 24, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#6F7477", textAlign: "center", marginTop: 8, marginBottom: 18 },
  camera: { width: "100%", aspectRatio: 3 / 4, borderRadius: 18, overflow: "hidden", backgroundColor: "#85898C" },
  permissionBox: { alignItems: "center", paddingVertical: 32 }, message: { color: "#3A2A22", textAlign: "center", marginBottom: 16 },
  error: { color: "#C62828", textAlign: "center", marginVertical: 10 }, primaryButton: { backgroundColor: "#F28C00", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 14 },
  buttonText: { color: "white", fontWeight: "800" }, cancelButton: { alignItems: "center", padding: 16, marginTop: 8 }, cancelText: { color: "#85898C", fontWeight: "700" },
});
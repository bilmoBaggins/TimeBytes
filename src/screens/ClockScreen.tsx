import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { getEmployees } from "../database/employees";
import { clockInOut, getCurrentStatus } from "../database/shifts";
import { Employee } from "../types";
import FaceRecognitionModal from "../components/FaceRecognitionModal";
import FaceEnrollmentModal from "../components/FaceEnrollmentModal";
import { updateEmployeeFaceId } from "../database/employees";

type Status = "clockedIn" | "clockedOut" | "notWorking";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ClockScreen() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [loadingList, setLoadingList] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [faceModalVisible, setFaceModalVisible] = useState(false);
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [enrollmentEmployee, setEnrollmentEmployee] = useState<Employee | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadEmployeesAndStatuses();
    }, [])
  );

  async function loadEmployeesAndStatuses() {
    setLoadingList(true);
    try {
      const employeeList = await getEmployees();
      setEmployees(employeeList);
      const entries = await Promise.all(
        employeeList.map(async (employee) => [
          employee.name,
          await getCurrentStatus(employee.name),
        ] as const)
      );
      setStatuses(Object.fromEntries(entries));
    } catch (error) {
      console.error("Failed to load employees:", error);
    } finally {
      setLoadingList(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadEmployeesAndStatuses();
    setRefreshing(false);
  }

  function openFaceModal(employee: Employee) {
    if (!employee.faceId) {
      Alert.alert("Face not enrolled", `${employee.name} does not have a face connected yet. Add one now?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Add Face", onPress: () => setEnrollmentEmployee(employee) },
      ]);
      return;
    }
    setActiveEmployee(employee);
    setFaceModalVisible(true);
  }

  async function submitClockInOut(employee: Employee) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProcessing(true);
    try {
      const result = await clockInOut(employee.name);
      setActiveEmployee(null);
      setFaceModalVisible(false);
      Alert.alert("Success", result.message);
      await loadEmployeesAndStatuses();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to process clock in/out");
    } finally {
      setProcessing(false);
    }
  }

  async function handleFaceRecognized(employeeId: number) {
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) throw new Error("That employee is not available on this tablet.");
    if (!activeEmployee || employee.id !== activeEmployee.id) {
      throw new Error("This face does not match the selected employee.");
    }
    await submitClockInOut(employee);
  }

  async function handleFaceEnrolled(faceId: string) {
    if (!enrollmentEmployee) return;
    await updateEmployeeFaceId(enrollmentEmployee.id, faceId);
    setEnrollmentEmployee(null);
    await loadEmployeesAndStatuses();
    Alert.alert("Face added", `${enrollmentEmployee.name}'s face is ready for clock-in.`);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#F28C00" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>TimeBytes</Text>
          <Text style={styles.subtitle}>Tap your name to clock in or out</Text>
        </View>

        {loadingList ? (
          <ActivityIndicator size="large" color="#F28C00" />
        ) : employees.length === 0 ? (
          <Text style={styles.noData}>No employees have been added yet</Text>
        ) : (
          <View style={styles.grid}>
            {employees.map((emp) => {
              const status = statuses[emp.name] ?? "notWorking";
              const isClockedIn = status === "clockedIn";
              return (
                <Pressable
                  key={emp.id}
                  style={({ pressed }) => [
                    styles.tile,
                    isClockedIn ? styles.tileClockedIn : styles.tileClockedOut,
                    pressed && styles.tilePressed,
                  ]}
                  onPress={() => openFaceModal(emp)}
                >
                  <View
                    style={[
                      styles.avatar,
                      isClockedIn ? styles.avatarClockedIn : styles.avatarClockedOut,
                    ]}
                  >
                    <Text style={styles.avatarText}>{initials(emp.name)}</Text>
                  </View>
                  <Text style={styles.tileName}>{emp.name}</Text>
                  <Text
                    style={[
                      styles.tileStatus,
                      isClockedIn ? styles.statusClockedIn : styles.statusClockedOut,
                    ]}
                  >
                    {isClockedIn ? "Clocked In" : "Clocked Out"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <FaceRecognitionModal
        visible={faceModalVisible}
        onClose={() => {
          setFaceModalVisible(false);
          setActiveEmployee(null);
        }}
        onRecognized={handleFaceRecognized}
      />
      <FaceEnrollmentModal
        employee={enrollmentEmployee}
        onClose={() => setEnrollmentEmployee(null)}
        onEnrolled={handleFaceEnrolled}
      />
    </SafeAreaView>
  );
}

const shadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FBF3EC",
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 28,
    marginTop: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    color: "#B85F00",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    color: "#8A7A70",
    fontWeight: "500",
  },
  faceButton: {
    backgroundColor: "#069B18",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 14,
  },
  faceButtonText: {
    color: "white",
    fontWeight: "800",
  },
  noData: {
    fontSize: 14,
    color: "#B0A6A0",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  tile: {
    width: "47%",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1.5,
    ...shadow,
  },
  tileClockedIn: {
    backgroundColor: "#E6F4E8",
    borderColor: "#A9DAB0",
  },
  tileClockedOut: {
    backgroundColor: "white",
    borderColor: "#F0E7DE",
  },
  tilePressed: {
    opacity: 0.8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarClockedIn: {
    backgroundColor: "#069B18",
  },
  avatarClockedOut: {
    backgroundColor: "#F28C00",
  },
  avatarText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  tileName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3A2A22",
    textAlign: "center",
  },
  tileStatus: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  statusClockedIn: {
    color: "#069B18",
  },
  statusClockedOut: {
    color: "#8A7A70",
  },
});

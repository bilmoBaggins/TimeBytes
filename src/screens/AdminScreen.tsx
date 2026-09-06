import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { getAllMonthlyPayroll, getCurrentMonthRange } from "../utils/payroll";
import { MonthlyPayroll } from "../types";
import { getShiftsByEmployee, getTodayShifts } from "../database/shifts";
import { Shift, Employee } from "../types";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Clock3, Pencil, ScanFace, Trash2 } from "lucide-react-native";
import {
  getEmployees,
  addEmployee,
  updateHourlyRate,
  deleteEmployee,
  resetEmployeesAndShifts,
} from "../database/employees";
import React from "react";
import FaceEnrollmentModal from "../components/FaceEnrollmentModal";
import { updateEmployeeFaceId } from "../database/employees";
import { addAdminFace, AdminFace, deleteAdminFace, getAdminFaces, resetAdminFaces, setAdminFaceId, updateAdminFace } from "../database/adminFaces";
import { removeAdminFace, removeEmployeeFace, resetDeviceFaceData } from "../cloud/faceRecognition";
import { syncLocalDatabase } from "../cloud/sync";
import AdminFaceEnrollmentModal from "../components/AdminFaceEnrollmentModal";
import AdminFaceRecognitionModal from "../components/AdminFaceRecognitionModal";

export default function AdminScreen() {
  const navigation = useNavigation();
  const [unlocked, setUnlocked] = useState(false);
  const [adminFaces, setAdminFaces] = useState<AdminFace[]>([]);
  const [adminScannerVisible, setAdminScannerVisible] = useState(false);
  const [adminEnrollment, setAdminEnrollment] = useState<AdminFace | null>(null);
  const [showAdminNameModal, setShowAdminNameModal] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [editingAdmin, setEditingAdmin] = useState<AdminFace | null>(null);

  const [monthlyData, setMonthlyData] = useState<MonthlyPayroll[]>([]);
  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState("");
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [historyShifts, setHistoryShifts] = useState<Shift[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [faceEmployee, setFaceEmployee] = useState<Employee | null>(null);

  // Add employee modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeRate, setNewEmployeeRate] = useState("12");

  // Edit employee modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editRate, setEditRate] = useState("");

  useFocusEffect(
    React.useCallback(() => {
      void prepareAdminAccess();
    }, [unlocked])
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener("blur", () => {
      setUnlocked(false);
      setAdminScannerVisible(false);
    });
    return unsubscribe;
  }, [navigation]);

  async function prepareAdminAccess() {
    const faces = await getAdminFaces();
    setAdminFaces(faces);
    const unenrolledAdmin = faces.find((admin) => !admin.faceId);
    if (unenrolledAdmin) {
      setAdminEnrollment(unenrolledAdmin);
    } else if (faces.length === 0) {
      const firstAdmin = await addAdminFace("Administrator");
      setAdminFaces([firstAdmin]);
      setAdminEnrollment(firstAdmin);
    } else if (unlocked) {
      await loadData();
    } else {
      setAdminScannerVisible(true);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const { month } = getCurrentMonthRange();
      setCurrentMonth(month);

      const [monthly, today, empList] = await Promise.all([
        getAllMonthlyPayroll(month),
        getTodayShifts(),
        getEmployees(),
      ]);

      setMonthlyData(monthly);
      setTodayShifts(today);
      setEmployees(empList);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleAddEmployee() {
    if (!newEmployeeName.trim()) {
      Alert.alert("Error", "Employee name is required");
      return;
    }

    try {
      const rate = parseFloat(newEmployeeRate) || 12;
      const name = newEmployeeName.trim();
      await addEmployee(name, rate);
      setNewEmployeeName("");
      setNewEmployeeRate("12");
      setShowAddModal(false);
      await loadData();
      Alert.alert("Success", `${name} added successfully.`);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to add employee");
    }
  }

  async function handleEditEmployee() {
    if (!editingEmployee) return;

    try {
      const rate = parseFloat(editRate) || 12;
      await updateHourlyRate(editingEmployee.id, rate);
      setShowEditModal(false);
      setEditingEmployee(null);
      setEditRate("");
      await loadData();
      Alert.alert("Success", "Employee updated successfully");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to update employee");
    }
  }

  async function handleDeleteEmployee(emp: Employee) {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to remove ${emp.name}? This will not delete their shift history.`,
      [
        { text: "Cancel", onPress: () => {} },
        {
          text: "Delete",
          onPress: async () => {
            try {
              await deleteEmployee(emp.id);
              await loadData();
              Alert.alert("Deleted", `${emp.name} has been removed`);
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to delete employee");
            }
          },
          style: "destructive",
        },
      ]
    );
  }

  async function openHistory(emp: Employee) {
    setHistoryEmployee(emp);
    setHistoryShifts([]);
    setHistoryLoading(true);
    try {
      setHistoryShifts(await getShiftsByEmployee(emp.name));
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to load shift history");
      setHistoryEmployee(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryEmployee(null);
    setHistoryShifts([]);
  }

  async function exportPayroll() {
    if (monthlyData.length === 0) {
      Alert.alert("No data", "There is no completed payroll data to export.");
      return;
    }

    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ["Employee", "Month", "Hours", "Total Pay"],
      ...monthlyData.map((record) => [
        escapeCsv(record.employeeName),
        record.month,
        record.totalHours.toFixed(2),
        record.totalPay.toFixed(2),
      ]),
      [
        "Total",
        currentMonth,
        monthlyData.reduce((sum, record) => sum + record.totalHours, 0).toFixed(2),
        monthlyData.reduce((sum, record) => sum + record.totalPay, 0).toFixed(2),
      ],
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const uri = `${FileSystem.documentDirectory}payroll-${currentMonth}.csv`;

    try {
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Export created", "CSV saved on this device, but sharing is unavailable.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: `Export payroll for ${currentMonth}`,
      });
    } catch (error: any) {
      Alert.alert("Export failed", error.message || "Failed to export payroll");
    }
  }

  function openEditModal(emp: Employee) {
    setEditingEmployee(emp);
    setEditRate(emp.hourlyRate.toString());
    setShowEditModal(true);
  }

  function closeAddModal() {
    setShowAddModal(false);
    setNewEmployeeName("");
    setNewEmployeeRate("12");
  }

  async function handleFaceEnrolled(faceId: string) {
    if (!faceEmployee) return;
    await updateEmployeeFaceId(faceEmployee.id, faceId);
    await loadData();
    Alert.alert("Success", `${faceEmployee.name}'s face has been enrolled.`);
  }

  async function handleAdminFaceEnrolled(faceId: string) {
    if (!adminEnrollment) return;
    await setAdminFaceId(adminEnrollment.id, faceId);
    setAdminEnrollment(null);
    await prepareAdminAccess();
  }

  async function handleAdminRecognized(adminId: number) {
    if (!adminFaces.some((admin) => admin.id === adminId && admin.faceId)) {
      throw new Error("This administrator is not available on this device.");
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUnlocked(true);
    setAdminScannerVisible(false);
  }

  async function saveAdminName() {
    const name = adminName.trim();
    if (!name) return;
    if (editingAdmin) {
      await updateAdminFace(editingAdmin.id, name);
    } else {
      const admin = await addAdminFace(name);
      setAdminEnrollment(admin);
    }
    setAdminName("");
    setEditingAdmin(null);
    setShowAdminNameModal(false);
    setAdminFaces(await getAdminFaces());
  }

  function removeAdmin(admin: AdminFace) {
    Alert.alert("Remove admin face", `Remove ${admin.name}'s admin access?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try {
          if (admin.faceId) await removeAdminFace(admin.id, admin.faceId);
          await deleteAdminFace(admin.id);
          setAdminFaces(await getAdminFaces());
        } catch (error: any) { Alert.alert("Error", error.message || "Could not remove admin face."); }
      } },
    ]);
  }

  function removeEmployeeFaceRecord(employee: Employee) {
    if (!employee.faceId) return;
    Alert.alert("Remove employee face", `Remove ${employee.name}'s enrolled face?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await syncLocalDatabase();
            await removeEmployeeFace(employee.id, employee.faceId!);
            await updateEmployeeFaceId(employee.id, null);
            await loadData();
          } catch (error: any) {
            Alert.alert("Could not remove face", error.message || "Please check the internet connection and try again.");
          }
        },
      },
    ]);
  }

  function resetTabletData() {
    Alert.alert(
      "Reset tablet data",
      "This permanently removes all employees, shifts, administrator faces, and enrolled AWS face records from this tablet. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Everything",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await resetDeviceFaceData();
              await resetEmployeesAndShifts();
              await resetAdminFaces();
              setEmployees([]);
              setTodayShifts([]);
              setMonthlyData([]);
              setAdminFaces([]);
              setUnlocked(false);
              await prepareAdminAccess();
            } catch (error: any) {
              Alert.alert("Reset failed", error.message || "Could not reset this tablet. Please try again with an internet connection.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  if (!unlocked) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.lockContainer}>
          <Text style={styles.lockTitle}>Admin Access</Text>
          <Text style={styles.lockSubtitle}>Scan an enrolled administrator face to continue.</Text>
          <Pressable style={styles.faceAccessButton} onPress={() => setAdminScannerVisible(true)}>
            <ScanFace size={22} color="white" strokeWidth={2.5} />
            <Text style={styles.faceAccessButtonText}>Scan Admin Face</Text>
          </Pressable>
          <AdminFaceRecognitionModal visible={adminScannerVisible} onClose={() => setAdminScannerVisible(false)} onRecognized={handleAdminRecognized} />
          <AdminFaceEnrollmentModal
            admin={adminEnrollment}
            onClose={() => setAdminEnrollment(null)}
            onEnrolled={handleAdminFaceEnrolled}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#F28C00" />
        }
      >
        <Text style={styles.title}>Admin Dashboard</Text>

        {/* Employee Management Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Manage Employees</Text>
            <Pressable
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#F28C00" />
          ) : employees.length === 0 ? (
            <Text style={styles.noData}>No employees</Text>
          ) : (
            employees.map((emp) => (
              <View key={emp.id} style={styles.employeeCard}>
                <View style={styles.employeeInfo}>
                  <Text style={styles.empName}>{emp.name}</Text>
                  <Text style={styles.empRate}>£{emp.hourlyRate}/hr</Text>
                </View>
                <View style={styles.employeeActions}>
                  <Pressable
                    style={({ pressed }) => [styles.faceBtn, emp.faceId && styles.faceRemoveBtn, pressed && styles.btnPressed]}
                    onPress={() => {
                      if (!emp.faceId) {
                        setFaceEmployee(emp);
                        return;
                      }
                      removeEmployeeFaceRecord(emp);
                    }}
                    accessibilityLabel={emp.faceId ? `Remove face for ${emp.name}` : `Enroll face for ${emp.name}`}
                    accessibilityRole="button"
                  >
                    <ScanFace size={18} color="white" strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.editBtn, pressed && styles.btnPressed]}
                    onPress={() => openEditModal(emp)}
                    accessibilityLabel={`Edit ${emp.name}`}
                    accessibilityRole="button"
                  >
                    <Pencil size={18} color="white" strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.historyBtn, pressed && styles.btnPressed]}
                    onPress={() => openHistory(emp)}
                    accessibilityLabel={`View history for ${emp.name}`}
                    accessibilityRole="button"
                  >
                    <Clock3 size={18} color="white" strokeWidth={2.5} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.deleteBtn, pressed && styles.btnPressed]}
                    onPress={() => handleDeleteEmployee(emp)}
                    accessibilityLabel={`Delete ${emp.name}`}
                    accessibilityRole="button"
                  >
                    <Trash2 size={18} color="white" strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Today's Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Clock Ins/Outs</Text>
          {todayShifts.filter((shift) => shift.clockOutTime).length === 0 ? (
            <Text style={styles.noData}>No completed shifts yet today</Text>
          ) : (
            todayShifts
              .filter((shift) => shift.clockOutTime)
              .map((shift) => (
                <View key={shift.id} style={styles.shiftCard}>
                  <View style={styles.shiftHeader}>
                    <Text style={styles.employeeName}>{shift.employeeName}</Text>
                    <Text style={styles.time}>Clock In: {shift.clockInTime}</Text>
                  </View>
                  <View style={styles.shiftDetails}>
                    <Text style={styles.detailText}>
                      Clock Out: {shift.clockOutTime}
                    </Text>
                    {shift.hourlyPay !== null && (
                      <Text style={styles.payText}>
                        Pay: £{shift.hourlyPay.toFixed(2)}
                      </Text>
                    )}
                  </View>
                </View>
              ))
          )}
        </View>

        {/* Monthly Payroll */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Monthly Payroll ({currentMonth})</Text>
            <Pressable
              style={({ pressed }) => [styles.exportButton, pressed && styles.addButtonPressed]}
              onPress={exportPayroll}
            >
              <Text style={styles.addButtonText}>Export CSV</Text>
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator size="large" color="#F28C00" />
          ) : monthlyData.length === 0 ? (
            <Text style={styles.noData}>No payroll data available</Text>
          ) : (
            <>
              {monthlyData.map((record, idx) => (
                <View key={idx} style={styles.payrollCard}>
                  <Text style={styles.payrollName}>{record.employeeName}</Text>
                  <View style={styles.payrollDetails}>
                    <View style={styles.payrollRow}>
                      <Text style={styles.label}>Hours:</Text>
                      <Text style={styles.value}>
                        {record.totalHours.toFixed(2)}h
                      </Text>
                    </View>
                    <View style={styles.payrollRow}>
                      <Text style={styles.label}>Total Pay:</Text>
                      <Text style={styles.payAmount}>
                        £{record.totalPay.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}

              {/* Summary */}
              {monthlyData.length > 0 && (
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Monthly Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total Employees:</Text>
                    <Text style={styles.summaryValue}>{monthlyData.length}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Total Hours:</Text>
                    <Text style={styles.summaryValue}>
                      {monthlyData
                        .reduce((sum, r) => sum + r.totalHours, 0)
                        .toFixed(2)}
                      h
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryRowLast]}>
                    <Text style={styles.summaryLabel}>Total Payroll:</Text>
                    <Text style={styles.totalPayAmount}>
                      £
                      {monthlyData
                        .reduce((sum, r) => sum + r.totalPay, 0)
                        .toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <Pressable
            style={({ pressed }) => [styles.outlineButton, pressed && styles.outlineButtonPressed]}
            onPress={() => {
              setEditingAdmin(null);
              setAdminName("");
              setShowAdminNameModal(true);
            }}
          >
            <Text style={styles.outlineButtonText}>Add Admin Face</Text>
          </Pressable>
          {adminFaces.map((admin) => (
            <View key={admin.id} style={styles.adminRow}>
              <Text style={styles.adminName}>{admin.name}</Text>
              <View style={styles.employeeActions}>
                <Pressable style={styles.editBtn} onPress={() => { setEditingAdmin(admin); setAdminName(admin.name); setShowAdminNameModal(true); }} accessibilityLabel={`Rename ${admin.name}`}><Pencil size={18} color="white" /></Pressable>
                <Pressable style={styles.deleteBtn} onPress={() => removeAdmin(admin)} accessibilityLabel={`Remove ${admin.name}`}><Trash2 size={18} color="white" /></Pressable>
              </View>
            </View>
          ))}
          <Pressable
            style={({ pressed }) => [styles.resetButton, pressed && styles.btnPressed]}
            onPress={resetTabletData}
          >
            <Text style={styles.resetButtonText}>Reset Tablet Data</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Add Employee Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={closeAddModal}
      >
        <Pressable style={styles.modalContainer} onPress={closeAddModal}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add New Employee</Text>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter employee name"
              placeholderTextColor="#B0A6A0"
              value={newEmployeeName}
              onChangeText={setNewEmployeeName}
            />

            <Text style={styles.inputLabel}>Hourly Rate (£)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="12.00"
              placeholderTextColor="#B0A6A0"
              value={newEmployeeRate}
              onChangeText={setNewEmployeeRate}
              keyboardType="decimal-pad"
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.cancelBtn, pressed && styles.btnPressed]}
                onPress={closeAddModal}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.confirmBtn, pressed && styles.confirmBtnPressed]}
                onPress={handleAddEmployee}
              >
                <Text style={[styles.modalBtnText, styles.confirmBtnText]}>
                  Add Employee
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <Pressable style={styles.modalContainer} onPress={() => setShowEditModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {editingEmployee ? `Edit ${editingEmployee.name}` : "Edit Employee"}
            </Text>

            <Text style={styles.inputLabel}>Hourly Rate (£)</Text>
            <TextInput
              style={styles.textInput}
              value={editRate}
              onChangeText={setEditRate}
              keyboardType="decimal-pad"
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.cancelBtn, pressed && styles.btnPressed]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.confirmBtn, pressed && styles.confirmBtnPressed]}
                onPress={handleEditEmployee}
              >
                <Text style={[styles.modalBtnText, styles.confirmBtnText]}>
                  Update
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Shift History Modal */}
      <Modal
        visible={historyEmployee !== null}
        transparent
        animationType="slide"
        onRequestClose={closeHistory}
      >
        <Pressable style={styles.modalContainer} onPress={closeHistory}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {historyEmployee ? `${historyEmployee.name} - Shift History` : "Shift History"}
            </Text>
            {historyLoading ? (
              <ActivityIndicator size="large" color="#F28C00" />
            ) : historyShifts.length === 0 ? (
              <Text style={styles.noData}>No shifts recorded</Text>
            ) : (
              <ScrollView style={styles.historyList}>
                {historyShifts.map((shift) => (
                  <View key={shift.id} style={styles.historyRow}>
                    <Text style={styles.historyDate}>{shift.date}</Text>
                    <Text style={styles.detailText}>
                      {shift.clockInTime} - {shift.clockOutTime || "Still clocked in"}
                    </Text>
                    {shift.hourlyPay !== null && (
                      <Text style={styles.payText}>£{shift.hourlyPay.toFixed(2)}</Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable
              style={({ pressed }) => [styles.outlineButton, pressed && styles.outlineButtonPressed]}
              onPress={closeHistory}
            >
              <Text style={styles.outlineButtonText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <FaceEnrollmentModal
        employee={faceEmployee}
        onClose={() => setFaceEmployee(null)}
        onEnrolled={handleFaceEnrolled}
      />

      <AdminFaceEnrollmentModal admin={adminEnrollment} onClose={() => setAdminEnrollment(null)} onEnrolled={handleAdminFaceEnrolled} />

      <Modal
        visible={showAdminNameModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdminNameModal(false)}
      >
        <Pressable
          style={styles.modalContainer}
          onPress={() => {
            setShowAdminNameModal(false);
            setAdminName("");
            setEditingAdmin(null);
          }}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editingAdmin ? "Rename Admin" : "Add Admin"}</Text>

            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={adminName}
              onChangeText={setAdminName}
              placeholder="Administrator name"
              placeholderTextColor="#B0A6A0"
            />

            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.cancelBtn, pressed && styles.btnPressed]}
                onPress={() => {
                  setShowAdminNameModal(false);
                  setAdminName("");
                  setEditingAdmin(null);
                }}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.confirmBtn, pressed && styles.confirmBtnPressed]}
                onPress={saveAdminName}
              >
                <Text style={[styles.modalBtnText, styles.confirmBtnText]}>
                  {editingAdmin ? "Save" : "Continue"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    flex: 1,
    backgroundColor: "#FBF3EC",
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#B85F00",
    marginBottom: 20,
    marginTop: 16,
    letterSpacing: -0.5,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#B85F00",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  noData: {
    fontSize: 14,
    color: "#B0A6A0",
    fontStyle: "italic",
    padding: 12,
  },
  shiftCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#85898C",
    ...shadow,
  },
  shiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  employeeName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3A2A22",
  },
  time: {
    fontSize: 13,
    color: "#8A7A70",
    fontWeight: "500",
  },
  shiftDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0E7DE",
  },
  detailText: {
    fontSize: 13,
    color: "#8A7A70",
    marginBottom: 4,
  },
  payText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#069B18",
  },
  activeText: {
    fontSize: 13,
    color: "#069B18",
    marginTop: 8,
    fontWeight: "600",
  },
  payrollCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#069B18",
    ...shadow,
  },
  payrollName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3A2A22",
    marginBottom: 10,
  },
  payrollDetails: {
    gap: 8,
  },
  payrollRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 13,
    color: "#8A7A70",
  },
  value: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3A2A22",
  },
  payAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#069B18",
  },
  summaryCard: {
    backgroundColor: "#F28C00",
    borderRadius: 16,
    padding: 18,
    marginTop: 6,
    ...shadow,
    shadowColor: "#F28C00",
    shadowOpacity: 0.25,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  summaryRowLast: {
    borderBottomWidth: 0,
    paddingTop: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "white",
  },
  totalPayAmount: {
    color: "#FFD54F",
    fontSize: 20,
    fontWeight: "800",
  },
  outlineButton: {
    backgroundColor: "white",
    borderWidth: 1.5,
    borderColor: "#F28C00",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  outlineButtonPressed: {
    backgroundColor: "#F7F1EC",
  },
  outlineButtonText: {
    color: "#B85F00",
    fontSize: 15,
    fontWeight: "700",
  },
  resetButton: {
    backgroundColor: "#C62828",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 18,
  },
  resetButtonText: { color: "white", fontSize: 15, fontWeight: "700" },
  exportButton: {
    backgroundColor: "#069B18",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  // Employee Management Styles
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: "#069B18",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonPressed: {
    backgroundColor: "#057512",
  },
  addButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
  employeeCard: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#85898C",
    ...shadow,
  },
  employeeInfo: {
    flex: 1,
  },
  empName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3A2A22",
    marginBottom: 4,
  },
  empRate: {
    fontSize: 13,
    color: "#8A7A70",
    fontWeight: "500",
  },
  employeeActions: {
    flexDirection: "row",
    gap: 10,
  },
  faceBtn: {
    backgroundColor: "#85898C",
    width: 38,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  faceRemoveBtn: { backgroundColor: "#C62828" },
  adminRow: { backgroundColor: "white", borderRadius: 12, padding: 12, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  adminName: { color: "#3A2A22", fontSize: 15, fontWeight: "700" },
  editBtn: {
    backgroundColor: "#069B18",
    width: 38,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  historyBtn: {
    backgroundColor: "#F28C00",
    width: 38,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtn: {
    backgroundColor: "#C62828",
    width: 38,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPressed: {
    opacity: 0.75,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(30, 20, 15, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5D9CD",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#B85F00",
    marginBottom: 20,
  },
  historyList: {
    maxHeight: 320,
  },
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0E7DE",
    paddingVertical: 10,
  },
  historyDate: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3A2A22",
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8A7A70",
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  textInput: {
    backgroundColor: "#F7F1EC",
    borderWidth: 1,
    borderColor: "#EEE3DA",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: "#3A2A22",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtn: {
    backgroundColor: "#F0E7DE",
  },
  confirmBtn: {
    backgroundColor: "#069B18",
  },
  confirmBtnPressed: {
    backgroundColor: "#057512",
  },
  modalBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3A2A22",
  },
  confirmBtnText: {
    color: "white",
  },

  // Admin lock screen
  lockContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  lockTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#B85F00",
  },
  lockSubtitle: {
    fontSize: 14,
    color: "#8A7A70",
    marginTop: 6,
    marginBottom: 24,
    textAlign: "center",
  },
  faceAccessButton: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#F28C00", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 13 },
  faceAccessButtonText: { color: "white", fontWeight: "800" },
});

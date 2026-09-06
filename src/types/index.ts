export interface Employee {
  id: number;
  name: string;
  hourlyRate: number;
  faceId: string | null;
  isClockedIn: boolean;
}

export interface Shift {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string; // YYYY-MM-DD
  clockInTime: string; // HH:mm
  clockOutTime: string | null; // HH:mm or null if still clocked in
  hourlyPay: number | null; // Calculated pay for this shift
}

export interface DailyPayRecord {
  date: string;
  employeeName: string;
  totalHours: number;
  totalPay: number;
}

export interface MonthlyPayroll {
  employeeName: string;
  month: string; // YYYY-MM
  totalHours: number;
  totalPay: number;
}

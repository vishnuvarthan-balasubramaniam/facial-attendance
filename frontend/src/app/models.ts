export interface Policy {
  required_days: number;
  previous_required_days: number;
  late_after: string;
}

export interface MonthOption {
  month: string;
  end: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface Meta {
  policy: Policy;
  current: DateRange;
  previous: DateRange;
  departments: string[];
}

export interface Kpi extends DateRange {
  required_days: number;
  avg_daily_in_office: number;
  wfo_pct: number;
  compliant_share: number;
  late_share: number;
  avg_hours: number;
}

export interface Kpis {
  current: Kpi;
  previous: Kpi;
}

export interface DailyRow {
  date: string;
  in_office: number;
  on_leave: number;
  late_arrivals: number;
}

export interface WeekdayRow {
  weekday: string;
  avg_in_office: number;
  occupancy: number;
}

export interface DeptRow {
  dept: string;
  employees: number;
  wfo_pct: number;
  compliant: number;
  compliant_share: number;
}

export type Status = 'Compliant' | 'At risk' | 'Below policy';

export interface EmployeeRow {
  emp_id: string;
  name: string;
  dept: string;
  location: string;
  office_days: number;
  eligible_days: number;
  wfo_pct: number;
  change_pts: number;
  required_days: number;
  days_left: number;
  avg_check_in: string | null;
  avg_hours: number | null;
  status: Status;
}

export interface RecognitionRow {
  date: string;
  recognized: number;
  unknown_faces: number;
  spoof_blocked: number;
  avg_confidence: number | null;
  avg_latency_ms: number | null;
}

export interface Tooltip {
  title: string;
  lines: [string, string][];
}

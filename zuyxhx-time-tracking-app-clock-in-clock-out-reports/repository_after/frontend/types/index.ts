export interface User {
  id: number
  email: string
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
}

export interface TimeEntry {
  id: number
  user_id: number
  start_at: string
  end_at: string | null
  notes: string | null
  is_active: boolean
  duration_seconds: number | null
  duration_hours: number | null
  created_at: string
}

export interface TimeEntryListResponse {
  entries: TimeEntry[]
  total: number
  page: number
  per_page: number
}

export interface ClockInRequest {
  notes?: string
}

export interface ClockOutRequest {
  notes?: string
}

export interface StatusResponse {
  is_clocked_in: boolean
  active_entry: TimeEntry | null
}

export interface DailySummary {
  date: string
  total_hours: number
  entry_count: number
}

export interface WeeklySummary {
  week_start: string
  week_end: string
  total_hours: number
  entry_count: number
  daily_breakdown: DailySummary[]
}

export interface ReportSummary {
  start_date: string
  end_date: string
  total_hours: number
  total_entries: number
  daily_summaries: DailySummary[]
  weekly_summaries: WeeklySummary[]
}

export interface ApiError {
  detail: string
}

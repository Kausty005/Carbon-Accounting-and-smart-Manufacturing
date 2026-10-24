/**
 * WattWise AI — Anomaly Intelligence & Incident Management API Service.
 * Interfaces with FastAPI endpoints at /api/...
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  (typeof window !== 'undefined' && window.location.port !== '8000'
    ? `http://${window.location.hostname}:8000`
    : '');

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`API request timed out after ${FETCH_TIMEOUT_MS / 1000}s. Verify backend service is running on port 8000.`);
    }
    throw new Error(err.message || 'Network error connecting to backend API');
  }
}

export interface ActionRecommendation {
  observed_evidence: string;
  recommended_action: string;
  why_relevant: string;
  suggested_priority: string;
  suggested_verification: string;
  estimated_savings_kwh?: number;
  estimated_savings_inr?: number;
  avoidable_co2e_kg?: number;
  assumptions_and_disclaimer?: string;
}

export interface AnomalyIncident {
  incident_id: string;
  equipment_id: string;
  machine_id?: string;
  equipment_type?: string;
  machine_type?: string;
  site_id?: string;
  timestamp: string;
  first_detected?: string;
  latest_occurrence?: string;
  recurrence_count?: number;
  anomaly_type: string;
  alert_category?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  is_energy_waste?: boolean;
  status: string;
  model_name?: string;
  model_score?: number;
  confidence?: number;
  actual_power_kw?: number;
  expected_power_kw?: number;
  deviation_kw?: number;
  deviation_pct?: number;
  actual_energy_kwh?: number;
  predicted_energy_kwh?: number;
  residual_kwh?: number;
  abs_residual_kwh?: number;
  relative_deviation_pct?: number;
  direction?: string;
  detector_score?: number;
  threshold?: number;
  threshold_basis?: string;
  explanation?: string;
  estimated_excess_energy_kwh?: number | null;
  evidence: string[];
  possible_causes?: string[];
  recommended_action: string;
  action_recommendations?: ActionRecommendation[];
  sensor_readings?: Record<string, number | string>;
  technician_notes?: string;
  resolution_notes?: string;
  data_provenance?: string;
  missing_inputs?: string[];
  quality_warnings?: string[];
}


export interface TelemetryPoint {
  timestamp: string;
  operating_mode?: string;
  is_incident_point?: boolean;
  power_consumption_kw?: number;
  temperature_c?: number;
  vibration_mm_s?: number;
  pressure_kpa?: number;
  discharge_pressure_bar?: number;
  airflow_cfm?: number;
  spindle_rpm?: number;
  spindle_load_pct?: number;
  supply_temp_c?: number;
  return_temp_c?: number;
  water_flow_m3h?: number;
  [key: string]: any;
}

export interface IncidentDetailsResponse {
  incident: AnomalyIncident;
  telemetry_window: TelemetryPoint[];
  [key: string]: any;
}

export interface DashboardSummaryResponse {
  data_provenance: string;
  simulation_disclaimer: string;
  total_equipment_monitored: number;
  monitored_equipment_list: string[];
  equipment_registry: Record<string, any>;
  total_anomalies_detected: number;
  critical_or_high_alerts: number;
  health_anomalies_count: number;
  energy_waste_anomalies_count: number;
  severity_breakdown: Record<string, number>;
  investigation_status_counts: Record<string, number>;
  equipment_distribution: Record<string, number>;
  anomaly_type_distribution: Record<string, number>;
  timeline_trend: Array<{ time: string; count: number }>;
  estimated_excess_energy_kwh: number;
  estimated_excess_cost_inr: number;
  estimated_avoidable_co2_kg: number;
  kpis: {
    total_equipment_monitored: number;
    total_anomalies_detected: number;
    critical_or_high_alerts: number;
    health_anomalies_count: number;
    energy_waste_anomalies_count: number;
    total_excess_kwh: number;
    estimated_cost_inr: number;
    estimated_co2e_kg: number;
    total_telemetry_readings: number;
    anomaly_rate_percent: number;
  };
  distributions: {
    equipment: Record<string, number>;
    anomaly_types: Record<string, number>;
    severities: Record<string, number>;
    statuses: Record<string, number>;
  };
  recent_incidents?: AnomalyIncident[];
}

export interface ListAnomaliesResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: AnomalyIncident[];
}

export async function fetchDashboardSummary(): Promise<DashboardSummaryResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/dashboard/summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch dashboard summary (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchAnomalies(params: {
  equipmentId?: string;
  anomalyType?: string;
  severity?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<ListAnomaliesResponse> {
  const query = new URLSearchParams();
  if (params.equipmentId) query.set('equipment_id', params.equipmentId);
  if (params.anomalyType) query.set('anomaly_type', params.anomalyType);
  if (params.severity) query.set('severity', params.severity);
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  query.set('page', String(params.page || 1));
  query.set('page_size', String(params.pageSize || 20));

  const res = await fetchWithTimeout(`${API_BASE_URL}/api/anomalies?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch anomalies list (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchIncidentDetails(incidentId: string): Promise<IncidentDetailsResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/anomalies/${encodeURIComponent(incidentId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch incident details (HTTP ${res.status})`);
  }
  return res.json();
}

export async function updateIncidentStatus(
  incidentId: string,
  payload: { status: string; technicianNotes?: string; resolutionNotes?: string }
): Promise<{ message: string; incident: AnomalyIncident }> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/anomalies/${encodeURIComponent(incidentId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: payload.status,
      technician_notes: payload.technicianNotes,
      resolution_notes: payload.resolutionNotes,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to update incident status (HTTP ${res.status})`);
  }
  return res.json();
}

export async function downloadIncidentReport(incidentId: string, format: 'pdf' | 'docx' = 'pdf'): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/anomalies/${encodeURIComponent(incidentId)}/report?format=${format}`,
    { method: 'POST' }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Report generation failed (HTTP ${res.status})`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `incident_${incidentId}.${format}`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function fetchEquipmentRegistry(): Promise<Record<string, any>> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/equipment/registry`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch equipment registry (HTTP ${res.status})`);
  }
  return res.json();
}

export async function uploadTelemetry(
  file: File,
  equipmentType?: string
): Promise<{
  valid: boolean;
  success: boolean;
  filename: string;
  row_count: number;
  incidents_created?: number;
  equipments_detected?: string[];
  errors?: string[];
  warnings?: string[];
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (equipmentType) {
    formData.append('equipment_type', equipmentType);
  }

  const res = await fetchWithTimeout(`${API_BASE_URL}/api/upload-telemetry`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Telemetry upload failed (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchOptimizationSummary(
  siteId?: string,
  machineId?: string
): Promise<any> {
  const params = new URLSearchParams();
  if (siteId) params.append('site_id', siteId);
  if (machineId) params.append('machine_id', machineId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/optimization/summary${q}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch optimization summary (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchForecastStatus(): Promise<any> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/forecast/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch forecast status (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchForecastComparison(
  machineId: string,
  targetTimestamp: string,
  actualEnergyKwh?: number,
  siteId: string = 'SITE-01'
): Promise<any> {
  const params = new URLSearchParams({
    machine_id: machineId,
    target_timestamp: targetTimestamp,
    site_id: siteId,
  });
  if (actualEnergyKwh !== undefined) {
    params.append('actual_energy_kwh', actualEnergyKwh.toString());
  }
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/forecast/comparison?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch forecast comparison (HTTP ${res.status})`);
  }
  return res.json();
}

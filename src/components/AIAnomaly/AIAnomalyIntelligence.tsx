import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Gauge,
  Info,
  Layers,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingDown,
  Upload,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  fetchDashboardSummary,
  fetchAnomalies,
  fetchIncidentDetails,
  updateIncidentStatus,
  downloadIncidentReport,
  getIncidentReportDownloadUrl,
  fetchLiveSimulationTick,
  injectLiveSimulationAnomaly,
  uploadTelemetry,
  type AnomalyIncident,
  type ActionRecommendation,
  type DashboardSummaryResponse,
  type IncidentDetailsResponse,
  type LiveMachineReading,
  type LiveSimulationTickResponse,
} from '../../services/anomalyApi';

interface EssentialMetric {
  label: string;
  value: string;
  unit?: string;
  isWarning?: boolean;
}

function getMachineTelemetryBadges(m: any): EssentialMetric[] {
  const eq = (m.equipment_id || '').toUpperCase();
  const metrics: EssentialMetric[] = [];
  const isValid = (v: any) => v !== undefined && v !== null && v !== '' && !isNaN(Number(v));

  if (eq.includes('COMP')) {
    // Air Compressor (ELGi EN-45): Pressure, Air Temp, Vibration
    if (isValid(m.discharge_pressure_bar)) {
      const p = Number(m.discharge_pressure_bar);
      metrics.push({
        label: 'Pressure',
        value: p.toFixed(2),
        unit: 'bar',
        isWarning: p < 6.5 || p > 8.5,
      });
    }
    if (isValid(m.temperature_c)) {
      const t = Number(m.temperature_c);
      metrics.push({
        label: 'Air Temp',
        value: t.toFixed(1),
        unit: '°C',
        isWarning: t > 90,
      });
    }
    if (isValid(m.vibration_mm_s)) {
      const v = Number(m.vibration_mm_s);
      metrics.push({
        label: 'Vibration',
        value: v.toFixed(2),
        unit: 'mm/s',
        isWarning: v > 1.2,
      });
    }
  } else if (eq.includes('FURN')) {
    // Heat Furnace (IF-85): Chamber Temp, Setpoint, Thermal Offset
    if (isValid(m.temperature_c)) {
      const t = Number(m.temperature_c);
      metrics.push({
        label: 'Chamber Temp',
        value: t.toFixed(0),
        unit: '°C',
        isWarning: t > 950 || t < 700,
      });
    }
    if (isValid(m.temp_setpoint_c)) {
      const sp = Number(m.temp_setpoint_c);
      metrics.push({
        label: 'Setpoint',
        value: sp.toFixed(0),
        unit: '°C',
      });
    }
    if (isValid(m.temperature_c) && isValid(m.temp_setpoint_c)) {
      const diff = Number(m.temperature_c) - Number(m.temp_setpoint_c);
      metrics.push({
        label: 'Thermal Offset',
        value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`,
        unit: '°C',
        isWarning: Math.abs(diff) > 25,
      });
    }
  } else if (eq.includes('CNC')) {
    // 5-Axis CNC (NLX-2500): Spindle Speed, Spindle Load, Axis Vibration
    if (isValid(m.spindle_rpm)) {
      const rpm = Number(m.spindle_rpm);
      metrics.push({
        label: 'Spindle RPM',
        value: rpm === 0 ? '0 (Idle)' : rpm.toLocaleString(),
        isWarning: rpm > 6000,
      });
    }
    if (isValid(m.spindle_load_pct)) {
      const load = Number(m.spindle_load_pct);
      metrics.push({
        label: 'Spindle Load',
        value: load.toFixed(0),
        unit: '%',
        isWarning: load > 85,
      });
    }
    if (isValid(m.vibration_mm_s)) {
      const vib = Number(m.vibration_mm_s);
      metrics.push({
        label: 'Axis Vib',
        value: vib.toFixed(2),
        unit: 'mm/s',
        isWarning: vib > 0.8,
      });
    }
  } else if (eq.includes('CHILL')) {
    // Chiller System: Return-Supply Delta T, Supply Temp, Chilled Water Flow
    if (isValid(m.delta_t_c)) {
      const dt = Number(m.delta_t_c);
      metrics.push({
        label: 'Cooling ΔT',
        value: dt.toFixed(1),
        unit: '°C',
        isWarning: dt < 3.5 || dt > 8.0,
      });
    }
    if (isValid(m.supply_temp_c)) {
      const st = Number(m.supply_temp_c);
      metrics.push({
        label: 'Supply Temp',
        value: st.toFixed(1),
        unit: '°C',
        isWarning: st > 12.0 || st < 4.0,
      });
    }
    if (isValid(m.water_flow_m3h)) {
      const flow = Number(m.water_flow_m3h);
      metrics.push({
        label: 'Water Flow',
        value: flow.toFixed(1),
        unit: 'm³/h',
      });
    }
  }

  return metrics;
}

export default function AIAnomalyIntelligence() {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [anomalies, setAnomalies] = useState<AnomalyIncident[]>([]);
  const [totalAnomalies, setTotalAnomalies] = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError] = useState<string | null>(null);

  // Filters
  const [equipmentId, setEquipmentId] = useState('');
  const [anomalyType, setAnomalyType] = useState('');
  const [severity, setSeverity] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Live Telemetry Simulation Engine State
  const [isStreaming, setIsStreaming] = useState(true);
  const [streamSpeed, setStreamSpeed] = useState<number>(2000); // 2000ms = 2s tick
  const [liveTick, setLiveTick] = useState<number>(1);
  const [livePlantPower, setLivePlantPower] = useState<number>(106.2);
  const [liveMachines, setLiveMachines] = useState<LiveMachineReading[]>([
    {
      equipment_id: 'AIR-COMP-01',
      name: 'ELGi Industrial Air Compressor',
      equipment_type: 'air_compressor',
      status: 'NORMAL',
      power_kw: 24.5,
      expected_power_kw: 24.5,
      discharge_pressure_bar: 7.2,
      airflow_cfm: 125.0,
      vibration_mm_s: 1.25,
      temperature_c: 77.5,
    },
    {
      equipment_id: 'CNC-01',
      name: '5-Axis CNC Machining Center',
      equipment_type: 'cnc_machine',
      status: 'NORMAL',
      power_kw: 10.4,
      expected_power_kw: 10.4,
      spindle_rpm: 4250,
      spindle_load_pct: 42.0,
      vibration_mm_s: 0.58,
      coolant_temp_c: 24.2,
    },
    {
      equipment_id: 'FURNACE-01',
      name: 'Industrial Heat Treating Furnace',
      equipment_type: 'furnace',
      status: 'NORMAL',
      power_kw: 48.5,
      expected_power_kw: 48.5,
      temperature_c: 850.0,
      temp_setpoint_c: 850.0,
      vibration_mm_s: 0.32,
    },
    {
      equipment_id: 'CHILLER-01',
      name: 'Central Chilled Water System',
      equipment_type: 'chiller',
      status: 'NORMAL',
      power_kw: 22.8,
      expected_power_kw: 22.8,
      supply_temp_c: 7.2,
      delta_t_c: 5.4,
      water_flow_m3h: 40.5,
      vibration_mm_s: 0.78,
    },
  ]);
  const [lastTickTime, setLastTickTime] = useState<string>(new Date().toLocaleTimeString());
  const [isTickPulse, setIsTickPulse] = useState(false);
  const [activeLiveAlert, setActiveLiveAlert] = useState<AnomalyIncident | null>(null);
  const [liveAnomalyCount, setLiveAnomalyCount] = useState<number>(0);
  const [injectingFault, setInjectingFault] = useState<string | null>(null);

  // Drawer & Modal State
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [drawerData, setDrawerData] = useState<IncidentDetailsResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const [statusVal, setStatusVal] = useState('New');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusSuccess, setStatusSuccess] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState<'pdf' | 'docx' | null>(null);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadEquipmentType, setUploadEquipmentType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Load Summary
  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      setSummaryError(null);
      const data = await fetchDashboardSummary();
      setSummary(data);
    } catch (err: any) {
      setSummaryError(err.message || 'Failed to connect to AI Anomaly backend.');
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // Load Anomalies Table with auto-retry and resilience
  const retryTimerRef = useRef<any>(null);

  const loadAnomalies = useCallback(async (isAutoRetry = false) => {
    try {
      if (anomalies.length === 0) {
        setTableLoading(true);
      }
      const res = await fetchAnomalies({
        equipmentId: equipmentId || undefined,
        anomalyType: anomalyType || undefined,
        severity: severity || undefined,
        status: statusFilter || undefined,
        search: searchTerm || undefined,
        page,
        pageSize,
      });
      setAnomalies(res.items || []);
      setTotalAnomalies(res.total || 0);
      setTableError(null);
    } catch (err: any) {
      console.warn('loadAnomalies fetch notice:', err);
      setTableError(err.message || 'Failed to load anomaly incidents.');
      if (!isAutoRetry) {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => {
          loadAnomalies(true);
        }, 2200);
      }
    } finally {
      setTableLoading(false);
    }
  }, [equipmentId, anomalyType, severity, statusFilter, searchTerm, page, pageSize, anomalies.length]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadAnomalies();
  }, [loadAnomalies]);

  // ─── 2-Second Live Telemetry Streaming & Anomaly Detection Loop ───
  useEffect(() => {
    if (!isStreaming) return;

    let isMounted = true;
    const intervalId = setInterval(async () => {
      try {
        const tickData = await fetchLiveSimulationTick();
        if (!isMounted) return;

        setLiveTick(tickData.tick);
        setLivePlantPower(tickData.plant_power_kw);
        if (tickData.machines && tickData.machines.length > 0) {
          setLiveMachines(tickData.machines);
        }
        setLastTickTime(new Date().toLocaleTimeString());

        // Visual flash indicating live data arrival
        setIsTickPulse(true);
        setTimeout(() => {
          if (isMounted) setIsTickPulse(false);
        }, 450);

        // Process any real-time anomalies detected on this tick
        const incomingAnomalies: AnomalyIncident[] =
          (tickData as any).new_anomalies && (tickData as any).new_anomalies.length > 0
            ? (tickData as any).new_anomalies
            : tickData.active_anomaly
            ? [tickData.active_anomaly]
            : [];

        if (incomingAnomalies.length > 0) {
          const firstLive = incomingAnomalies[0];
          setActiveLiveAlert(firstLive);
          setLiveAnomalyCount((c) => c + incomingAnomalies.length);

          // Prepend new anomalies to incident list in real-time
          setAnomalies((prev) => {
            const existingIds = new Set(prev.map((x) => x.incident_id));
            const freshItems = incomingAnomalies.filter((item) => !existingIds.has(item.incident_id));
            if (freshItems.length === 0) return prev;
            return [...freshItems, ...prev];
          });
          setTotalAnomalies((prev) => prev + incomingAnomalies.length);
        }
      } catch (err) {
        console.warn('Live simulation tick failed:', err);
      }
    }, streamSpeed);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isStreaming, streamSpeed]);

  const handleInjectFault = async (eqId: string, faultType: string) => {
    try {
      setInjectingFault(eqId);
      await injectLiveSimulationAnomaly({ equipment_id: eqId, anomaly_type: faultType });
      // Ensure streaming is active
      setIsStreaming(true);
    } catch (err: any) {
      alert(`Fault injection failed: ${err.message}`);
    } finally {
      setTimeout(() => setInjectingFault(null), 1200);
    }
  };

  // Load Drawer Details
  useEffect(() => {
    if (!selectedIncidentId) {
      setDrawerData(null);
      return;
    }
    let isMounted = true;
    async function fetchDetail() {
      try {
        setDrawerLoading(true);
        setDrawerError(null);
        setStatusSuccess(false);
        const data = await fetchIncidentDetails(selectedIncidentId!);
        if (isMounted) {
          setDrawerData(data);
          const inc = data.incident || data;
          setStatusVal(inc.status || 'New');
          setTechnicianNotes(inc.technician_notes || '');
          setResolutionNotes(inc.resolution_notes || '');
        }
      } catch (err: any) {
        if (isMounted) {
          setDrawerError(err.message || 'Failed to fetch incident investigation data.');
        }
      } finally {
        if (isMounted) setDrawerLoading(false);
      }
    }
    fetchDetail();
    return () => {
      isMounted = false;
    };
  }, [selectedIncidentId]);

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId) return;
    try {
      setSavingStatus(true);
      await updateIncidentStatus(selectedIncidentId, {
        status: statusVal,
        technicianNotes,
        resolutionNotes,
      });
      setStatusSuccess(true);
      loadSummary();
      loadAnomalies();
      setTimeout(() => setStatusSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    if (!selectedIncidentId) return;
    try {
      setDownloadingReport(format);
      await downloadIncidentReport(selectedIncidentId, format);
      setDownloadSuccessMessage(`✓ Downloaded incident report as ${format.toUpperCase()}`);
      setTimeout(() => setDownloadSuccessMessage(null), 4000);
    } catch (err: any) {
      // Fallback: open direct link in new tab if blob API had any issue
      const directUrl = getIncidentReportDownloadUrl(selectedIncidentId, format);
      window.open(directUrl, '_blank');
      setDownloadSuccessMessage(`✓ Report opened via direct stream (${format.toUpperCase()})`);
      setTimeout(() => setDownloadSuccessMessage(null), 4000);
    } finally {
      setDownloadingReport(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a .csv or .xlsx telemetry file.');
      return;
    }
    try {
      setUploading(true);
      setUploadError(null);
      setUploadResult(null);
      const res = await uploadTelemetry(uploadFile, uploadEquipmentType || undefined);
      setUploadResult(res);
      if (res.valid && res.success) {
        loadSummary();
        loadAnomalies();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload processing failed.');
    } finally {
      setUploading(false);
    }
  };

  const resetFilters = () => {
    setEquipmentId('');
    setAnomalyType('');
    setSeverity('');
    setStatusFilter('');
    setSearchTerm('');
    setPage(1);
  };

  const totalPages = Math.ceil(totalAnomalies / pageSize) || 1;

  // Selected incident reference
  const selectedInc = drawerData?.incident || (drawerData as any);
  const telemetryWindow = drawerData?.telemetry_window || [];

  return (
    <div className="scroll-area" style={{ padding: '16px 20px', height: '100%', overflowY: 'auto' }}>
      {/* ─── Top Control Header & Data Provenance ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--white)' }}>
              Industrial AI Anomaly Intelligence & Health Monitoring
            </h2>
            <span className="live-badge" style={{ fontSize: 9 }}>
              <span className="pulse-dot" style={{ background: 'var(--emerald)' }} />
              Active Inference
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            Condition-Aware Baselines • Supervised Classification • Unsupervised Isolation Forest • 4 Equipment Classes
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-cyan btn-sm"
            onClick={() => {
              setUploadFile(null);
              setUploadResult(null);
              setUploadError(null);
              setShowUploadModal(true);
            }}
          >
            <Upload size={12} /> Upload Telemetry
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              loadSummary();
              loadAnomalies();
            }}
            title="Refresh AI Anomaly Intelligence Data"
          >
            <RefreshCw size={12} className={summaryLoading || tableLoading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ─── Provenance & Benchmarking Disclosure Banner ─── */}
      <div
        style={{
          background: 'rgba(2, 132, 199, 0.06)',
          border: '1px solid rgba(2, 132, 199, 0.2)',
          borderRadius: 'var(--r)',
          padding: '8px 14px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--slate-400)',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>⚡ DATA PROVENANCE:</span>
          <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>
            {summary?.data_provenance === 'user_uploaded_telemetry'
              ? 'USER UPLOADED TELEMETRY'
              : 'SYNTHETIC BENCHMARK SIMULATION (v1)'}
          </span>
          <span>|</span>
          <span>FURNACE-01 • AIR-COMP-01 • CNC-01 • CHILLER-01</span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--slate-500)' }}>
          {summary?.simulation_disclaimer || 'KPCL Hackathon Benchmarking Demonstrator (Not real factory data)'}
        </div>
      </div>

      {/* ─── Real-Time SCADA Telemetry Streaming & Anomaly Simulation Ribbon ─── */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: isTickPulse ? '1px solid var(--emerald)' : '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '12px 16px',
          marginBottom: 16,
          boxShadow: isTickPulse ? '0 0 16px rgba(16, 185, 129, 0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          {/* Left: Streaming Status Beacon & Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: isStreaming ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                border: isStreaming ? '1px solid var(--emerald)' : '1px solid var(--slate-400)',
                padding: '4px 10px',
                borderRadius: 20,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isStreaming ? 'var(--emerald)' : 'var(--slate-400)',
                  display: 'inline-block',
                  boxShadow: isStreaming ? '0 0 8px var(--emerald)' : 'none',
                  animation: isStreaming ? 'pulse 1.5s infinite' : 'none',
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isStreaming ? 'var(--emerald)' : 'var(--slate-400)', letterSpacing: 0.5 }}>
                {isStreaming ? 'LIVE TELEMETRY STREAMING' : 'STREAM PAUSED'}
              </span>
            </div>

            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>
                Tick: <strong style={{ color: 'var(--white)' }}>#{liveTick}</strong>
              </span>
              <span>•</span>
              <span>
                Rate: <strong style={{ color: 'var(--cyan)' }}>{(streamSpeed / 1000).toFixed(1)}s</strong>
              </span>
              <span>•</span>
              <span>
                Plant Power: <strong style={{ color: 'var(--amber)' }}>{livePlantPower.toFixed(1)} kW</strong>
              </span>
              <span>•</span>
              <span style={{ color: isTickPulse ? 'var(--emerald)' : 'var(--slate-500)', transition: 'color 0.2s ease' }}>
                {isTickPulse ? '⚡ NEW PACKET RECEIVED' : `Updated: ${lastTickTime}`}
              </span>
            </div>
          </div>

          {/* Right: Stream Controls & Anomaly Injection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${isStreaming ? 'btn-ghost' : 'btn-cyan'}`}
              onClick={() => setIsStreaming(!isStreaming)}
              title={isStreaming ? 'Pause live telemetry stream' : 'Resume live telemetry stream'}
              style={{ fontSize: 11, height: 28, padding: '0 10px' }}
            >
              {isStreaming ? (
                <>
                  <Pause size={12} /> Pause (2s)
                </>
              ) : (
                <>
                  <Play size={12} /> Resume Stream
                </>
              )}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-panel)', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)', padding: '0 4px' }}>SPEED:</span>
              {[1000, 2000, 5000].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setStreamSpeed(speed)}
                  style={{
                    background: streamSpeed === speed ? 'var(--cyan)' : 'transparent',
                    color: streamSpeed === speed ? '#fff' : 'var(--slate-400)',
                    border: 'none',
                    borderRadius: 3,
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 6px',
                    cursor: 'pointer',
                    fontWeight: streamSpeed === speed ? 700 : 400,
                  }}
                >
                  {speed / 1000}s
                </button>
              ))}
            </div>

            {/* Quick Anomaly Injection Dropdown/Buttons */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                className="btn btn-sm"
                onClick={() => handleInjectFault('FURNACE-01', 'excessive_power')}
                disabled={injectingFault !== null}
                style={{
                  background: 'rgba(234, 88, 12, 0.12)',
                  color: 'var(--amber)',
                  border: '1px solid var(--amber)',
                  fontSize: 11,
                  height: 28,
                  padding: '0 10px',
                }}
                title="Force a real-time thermal anomaly on Furnace to test live detection"
              >
                <Sparkles size={11} /> {injectingFault ? 'Injecting...' : '⚡ Simulate Anomaly'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── 4 Monitored Equipment Live Telemetry Cards ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 14 }}>
          {liveMachines.map((m) => {
            const isAnomaly = m.status === 'ANOMALY';
            const devPct = m.expected_power_kw ? Math.round(((m.power_kw - m.expected_power_kw) / m.expected_power_kw) * 100) : 0;
            const isFurnace = m.equipment_id.includes('FURN');
            const isComp = m.equipment_id.includes('COMP');
            const isCnc = m.equipment_id.includes('CNC');

            const machineDisplayName = isFurnace
              ? 'Industrial Heat Furnace'
              : isComp
              ? 'Air Compressor (ELGi)'
              : isCnc
              ? '5-Axis CNC Machining'
              : 'Chilled Water Cooling';

            const accentColor = isAnomaly
              ? 'var(--red)'
              : isFurnace
              ? '#ea580c'
              : isComp
              ? 'var(--cyan)'
              : isCnc
              ? 'var(--violet)'
              : 'var(--emerald)';

            const metrics = getMachineTelemetryBadges(m);
            const loadRatio = m.expected_power_kw ? Math.min(100, Math.round((m.power_kw / m.expected_power_kw) * 100)) : 50;

            return (
              <div
                key={m.equipment_id}
                style={{
                  background: isAnomaly ? 'rgba(239, 68, 68, 0.06)' : 'var(--bg-panel)',
                  border: isAnomaly
                    ? '2px solid var(--red)'
                    : isTickPulse
                    ? `1px solid ${accentColor}`
                    : '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '14px 16px',
                  boxShadow: isAnomaly
                    ? '0 0 18px rgba(239, 68, 68, 0.22)'
                    : '0 2px 10px rgba(60, 45, 25, 0.05)',
                  transition: 'all 0.25s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  {/* Card Header: Icon, Machine Name & Clean Status Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: `rgba(${isAnomaly ? '239,68,68' : '2,132,199'}, 0.12)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: accentColor,
                          flexShrink: 0,
                        }}
                      >
                        {isFurnace ? (
                          <Flame size={17} />
                        ) : isComp ? (
                          <Wind size={17} />
                        ) : isCnc ? (
                          <Activity size={17} />
                        ) : (
                          <Gauge size={17} />
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--white)', lineHeight: 1.2 }}>
                          {m.equipment_id}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--slate-500)', fontWeight: 500 }}>
                          {machineDisplayName}
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: 9999,
                        fontFamily: 'var(--font-mono)',
                        background: isAnomaly ? 'rgba(220, 38, 38, 0.15)' : 'rgba(5, 150, 105, 0.12)',
                        color: isAnomaly ? 'var(--red)' : 'var(--emerald)',
                        border: isAnomaly ? '1px solid rgba(220, 38, 38, 0.35)' : '1px solid rgba(5, 150, 105, 0.25)',
                        letterSpacing: 0.5,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {isAnomaly ? <AlertTriangle size={11} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--emerald)' }} />}
                      {isAnomaly ? 'FAULT' : 'NORMAL'}
                    </span>
                  </div>

                  {/* Primary Power Readout & Delta */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <div>
                        <span style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)', color: isAnomaly ? 'var(--red)' : 'var(--white)', letterSpacing: -0.5 }}>
                          {m.power_kw.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate-500)', marginLeft: 4 }}>kW</span>
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: isAnomaly
                            ? 'rgba(220, 38, 38, 0.15)'
                            : Math.abs(devPct) > 15
                            ? 'rgba(217, 119, 6, 0.15)'
                            : 'rgba(5, 150, 105, 0.1)',
                          color: isAnomaly
                            ? 'var(--red)'
                            : Math.abs(devPct) > 15
                            ? 'var(--amber)'
                            : 'var(--emerald)',
                        }}
                      >
                        {devPct > 0 ? `+${devPct}%` : `${devPct}%`} vs base ({m.expected_power_kw?.toFixed(1) || '--'} kW)
                      </div>
                    </div>

                    {/* Subtle Load Indicator */}
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(90, 75, 55, 0.1)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(10, loadRatio))}%`,
                          background: isAnomaly
                            ? 'var(--red)'
                            : Math.abs(devPct) > 15
                            ? 'var(--amber)'
                            : 'var(--emerald)',
                          borderRadius: 2,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Only Important Machine-Specific Sensor Badges */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${metrics.length || 1}, 1fr)`,
                      gap: 6,
                      marginBottom: 14,
                    }}
                  >
                    {metrics.map((met, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: met.isWarning ? 'rgba(220, 38, 38, 0.08)' : 'rgba(90, 75, 55, 0.04)',
                          border: met.isWarning ? '1px solid rgba(220, 38, 38, 0.3)' : '1px solid var(--border-muted)',
                          borderRadius: 6,
                          padding: '5px 6px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 8.5, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 2 }}>
                          {met.label}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: met.isWarning ? 'var(--red)' : 'var(--white)' }}>
                          {met.value}
                          {met.unit && <span style={{ fontSize: 9.5, fontWeight: 500, color: 'var(--slate-500)', marginLeft: 2 }}>{met.unit}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Direct Card Action Button (Preserves exact working) */}
                <div>
                  {isAnomaly ? (
                    <button
                      className="btn btn-sm btn-cyan"
                      style={{
                        width: '100%',
                        fontSize: 10,
                        fontWeight: 700,
                        height: 28,
                        background: 'var(--red)',
                        borderColor: 'var(--red)',
                        color: '#fff',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                      }}
                      onClick={() => {
                        const matching = anomalies.find((a) => a.equipment_id === m.equipment_id);
                        if (matching) setSelectedIncidentId(matching.incident_id);
                        else if (activeLiveAlert?.equipment_id === m.equipment_id) setSelectedIncidentId(activeLiveAlert.incident_id);
                      }}
                    >
                      <AlertTriangle size={12} /> Inspect Live Fault →
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm"
                      style={{
                        width: '100%',
                        fontSize: 9.5,
                        fontWeight: 600,
                        height: 26,
                        justifyContent: 'center',
                        background: 'rgba(90, 75, 55, 0.04)',
                        borderColor: 'var(--border)',
                        color: 'var(--slate-500)',
                      }}
                      onClick={() => handleInjectFault(m.equipment_id, isFurnace ? 'excessive_power' : isComp ? 'pressure_leak' : isCnc ? 'tool_wear' : 'low_delta_t')}
                      disabled={injectingFault !== null}
                      title={`Simulate an operational anomaly on ${m.equipment_id}`}
                    >
                      <Sparkles size={11} style={{ color: 'var(--amber)' }} />
                      {injectingFault === m.equipment_id ? 'Injecting...' : `Test Anomaly on ${m.equipment_id}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Real-Time Live Anomaly Alert Toast Banner ─── */}
      {activeLiveAlert && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(245, 158, 11, 0.12))',
            border: '1px solid var(--red)',
            borderRadius: 'var(--r)',
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 16px rgba(220, 38, 38, 0.15)',
            animation: 'fadeIn 0.3s ease',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                background: 'var(--red)',
                color: '#fff',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 10px rgba(220, 38, 38, 0.5)',
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', letterSpacing: 0.5 }}>
                  🚨 LIVE SCADA ANOMALY DETECTED IN REAL-TIME
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--red)', color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>
                  TICK #{liveTick}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--white)', margin: '2px 0 0 0' }}>
                <strong>{activeLiveAlert.equipment_id}</strong> — {activeLiveAlert.anomaly_type.replace(/_/g, ' ').toUpperCase()}: Measured <strong>{activeLiveAlert.actual_power_kw} kW</strong> vs expected {activeLiveAlert.expected_power_kw} kW (+{activeLiveAlert.deviation_kw} kW deviation).
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-sm btn-cyan"
              onClick={() => setSelectedIncidentId(activeLiveAlert.incident_id)}
              style={{ fontSize: 11, height: 28 }}
            >
              Inspect Incident & Report
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setActiveLiveAlert(null)}
              style={{ padding: 4, height: 28 }}
              title="Dismiss banner"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ─── Error Notification if Backend Offline ─── */}
      {summaryError && (
        <div
          style={{
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--r)',
            padding: '12px 16px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} color="var(--red)" />
            <span style={{ fontSize: 12, color: 'var(--red)' }}>
              <strong>AI Service Alert:</strong> {summaryError}
            </span>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={loadSummary} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
            Retry Connection
          </button>
        </div>
      )}

      {/* ─── 1. Industrial KPI Cards Grid ─── */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--cyan)' }}>
          <div className="kpi-label">Monitored Equipment</div>
          <div className="kpi-val">{summary?.total_equipment_monitored || 4}</div>
          <div className="kpi-sub" style={{ fontFamily: 'var(--font-mono)' }}>
            Furnace, Compressor, CNC, Chiller
          </div>
        </div>

        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--amber)' }}>
          <div className="kpi-label">Total Detected Anomalies</div>
          <div className="kpi-val" style={{ color: 'var(--amber)' }}>
            {summary?.total_anomalies_detected ?? (summaryLoading ? '...' : 0)}
          </div>
          <div className="kpi-sub" style={{ fontFamily: 'var(--font-mono)' }}>
            Health: {summary?.health_anomalies_count || 0} | Waste: {summary?.energy_waste_anomalies_count || 0}
          </div>
        </div>

        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--red)' }}>
          <div className="kpi-label">Critical / High Alerts</div>
          <div className="kpi-val" style={{ color: 'var(--red)' }}>
            {summary?.critical_or_high_alerts ?? 0}
          </div>
          <div className="kpi-sub">Immediate inspection required</div>
        </div>

        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--emerald)' }}>
          <div className="kpi-label">Telemetry Readings Flagged</div>
          <div className="kpi-val" style={{ color: 'var(--emerald)' }}>
            {summary?.kpis?.anomaly_rate_percent !== undefined ? `${summary.kpis.anomaly_rate_percent}%` : '--'}
          </div>
          <div className="kpi-sub" style={{ fontFamily: 'var(--font-mono)' }}>
            {((summary?.kpis?.total_telemetry_readings || 34560) - (summary?.total_anomalies_detected || 0)).toLocaleString()} normal readings
          </div>
        </div>

        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--violet)' }}>
          <div className="kpi-label">Avoidable Excess Energy</div>
          <div className="kpi-val" style={{ color: 'var(--violet)' }}>
            {summary?.estimated_excess_energy_kwh ? `${summary.estimated_excess_energy_kwh.toLocaleString()} kWh` : '0 kWh'}
          </div>
          <div className="kpi-sub" style={{ fontFamily: 'var(--font-mono)' }}>
            ₹{summary?.estimated_excess_cost_inr?.toLocaleString() || 0} | -{summary?.estimated_avoidable_co2_kg?.toLocaleString() || 0} kg CO₂e
          </div>
        </div>
      </div>

      {/* ─── 2. Visual Distribution & Machine Health Breakdown ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Anomaly Mechanism Breakdown */}
        <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--white)' }}>
              Anomaly Type Distribution
            </span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)' }}>
              MACHINE-SPECIFIC MECHANISMS
            </span>
          </div>

          {summary?.distributions?.anomaly_types && Object.keys(summary.distributions.anomaly_types).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(summary.distributions.anomaly_types).map(([type, count]) => {
                const maxCount = Math.max(...Object.values(summary.distributions.anomaly_types)) || 1;
                const pct = Math.round((count / maxCount) * 100);
                const color =
                  type.includes('temp') || type.includes('heat')
                    ? 'var(--red)'
                    : type.includes('bearing') || type.includes('vibration')
                    ? 'var(--amber)'
                    : type.includes('press') || type.includes('leak')
                    ? 'var(--emerald)'
                    : type.includes('chiller') || type.includes('cooling') || type.includes('delta_t')
                    ? 'var(--cyan)'
                    : 'var(--violet)';

                return (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', textTransform: 'capitalize', color: 'var(--white)' }}>
                        {type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{count} events</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : summaryLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--slate-400)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              Loading mechanism distribution...
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--slate-400)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              No anomaly distributions recorded.
            </div>
          )}
        </div>

        {/* Equipment Asset Health Breakdown */}
        <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--white)' }}>
              Equipment Asset Health
            </span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)' }}>
              4 MONITORED MACHINES
            </span>
          </div>

          {summary?.distributions?.equipment && Object.keys(summary.distributions.equipment).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(summary.distributions.equipment).map(([eqId, count]) => {
                const maxEq = Math.max(...Object.values(summary.distributions.equipment)) || 1;
                const pct = Math.round((count / maxEq) * 100);

                return (
                  <div key={eqId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan)' }}>{eqId}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate-500)' }}>{count} anomalies</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--cyan)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : summaryLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--slate-400)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              Loading equipment health telemetry...
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--slate-400)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              No equipment health anomalies recorded.
            </div>
          )}
        </div>
      </div>

      {/* ─── 3. Filter Controls Bar & Quick Filter Chips ─── */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Quick Filter Chips Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* Equipment Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)', marginRight: 2 }}>
              MACHINE:
            </span>
            {[
              { id: '', label: 'All Equipment' },
              { id: 'FURNACE-01', label: '🔥 Furnace' },
              { id: 'AIR-COMP-01', label: '💨 Compressor' },
              { id: 'CNC-01', label: '⚙️ CNC 5-Axis' },
              { id: 'CHILLER-01', label: '❄️ Chiller' },
            ].map((eq) => {
              const active = equipmentId === eq.id;
              return (
                <button
                  key={eq.id}
                  onClick={() => { setEquipmentId(eq.id); setPage(1); }}
                  style={{
                    background: active ? 'var(--cyan)' : 'var(--bg-input)',
                    color: active ? '#fff' : 'var(--slate-300)',
                    border: active ? '1px solid var(--cyan)' : '1px solid var(--border)',
                    borderRadius: 20,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {eq.label}
                </button>
              );
            })}
          </div>

          {/* Severity Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)', marginRight: 2 }}>
              SEVERITY:
            </span>
            {[
              { id: '', label: 'All' },
              { id: 'critical', label: '🔴 Critical', color: 'var(--red)' },
              { id: 'high', label: '🟠 High', color: 'var(--amber)' },
              { id: 'medium', label: '🟣 Medium', color: 'var(--violet)' },
            ].map((s) => {
              const active = severity === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSeverity(s.id); setPage(1); }}
                  style={{
                    background: active ? (s.color || 'var(--cyan)') : 'var(--bg-input)',
                    color: active ? '#fff' : 'var(--slate-300)',
                    border: active ? `1px solid ${s.color || 'var(--cyan)'}` : '1px solid var(--border)',
                    borderRadius: 20,
                    padding: '3px 9px',
                    fontSize: 10.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search, Status Dropdown & Reset */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {/* Free Text Search */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', gap: 8, flexGrow: 1, minWidth: 220 }}>
            <Search size={13} color="var(--slate-400)" />
            <input
              type="text"
              placeholder="Search incident ID, evidence text, mechanism, equipment..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--white)', width: '100%' }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', color: 'var(--slate-400)', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status Select */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 11, color: 'var(--white)', height: 32 }}
          >
            <option value="">All Statuses</option>
            <option value="New">New</option>
            <option value="Investigating">Investigating</option>
            <option value="Resolved">Resolved</option>
            <option value="False Positive">False Positive</option>
          </select>

          {/* Active Results Count Badge */}
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)', whiteSpace: 'nowrap' }}>
            <strong style={{ color: 'var(--cyan)' }}>{totalAnomalies}</strong> incidents
          </span>

          <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ height: 32, fontSize: 11 }}>
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>

      {/* ─── 4. Anomaly Table ─── */}
      <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 20 }}>
        {/* Stale-while-revalidate reconnection banner if background fetch stutters */}
        {tableError && anomalies.length > 0 && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
              padding: '8px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--amber)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={12} className="spin" />
              <span>Live incident sync reconnecting — displaying {anomalies.length} active incidents</span>
            </div>
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => loadAnomalies(false)}
              style={{ color: 'var(--amber)', borderColor: 'rgba(245, 158, 11, 0.4)', height: 24, fontSize: 10 }}
            >
              Retry Sync Now
            </button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.04)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: 'var(--slate-400)', letterSpacing: 0.5 }}>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Incident ID</th>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Equipment</th>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Timestamp</th>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Mechanism</th>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Severity</th>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Category</th>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Model Score</th>
                <th style={{ padding: '11px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading && anomalies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={14} className="spin" /> Loading telemetry anomalies...
                    </div>
                  </td>
                </tr>
              ) : tableError && anomalies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center' }}>
                    <div style={{ maxWidth: 420, margin: '0 auto', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: '20px 24px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 6 }}>
                        ⚠️ Telemetry Service Reconnecting
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)', margin: '0 0 14px 0' }}>
                        {tableError}
                      </p>
                      <button className="btn btn-sm btn-cyan" onClick={() => loadAnomalies(false)}>
                        <RefreshCw size={12} /> Reconnect to Backend API
                      </button>
                    </div>
                  </td>
                </tr>
              ) : anomalies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>
                    No matching anomaly incidents found for current filters.
                  </td>
                </tr>
              ) : (
                anomalies.map((item) => {
                  const isCrit = item.severity === 'critical';
                  const isHigh = item.severity === 'high';
                  const sevColor = isCrit ? 'var(--red)' : isHigh ? 'var(--amber)' : item.severity === 'medium' ? 'var(--violet)' : 'var(--cyan)';

                  const isLiveItem = Boolean(item.is_live || item.incident_id.includes('LIVE'));

                  return (
                    <tr
                      key={item.incident_id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        borderLeft: isLiveItem ? '3px solid var(--red)' : '3px solid transparent',
                        background: isLiveItem ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = isLiveItem ? 'rgba(239, 68, 68, 0.09)' : 'rgba(0,0,0,0.02)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = isLiveItem ? 'rgba(239, 68, 68, 0.05)' : 'transparent')}
                      onClick={() => setSelectedIncidentId(item.incident_id)}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--white)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{item.incident_id}</span>
                          {(item.is_live || item.incident_id.includes('LIVE')) && (
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
                                color: '#fff',
                                padding: '1px 5px',
                                borderRadius: 3,
                                letterSpacing: 0.5,
                                boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)',
                              }}
                            >
                              ⚡ LIVE
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            background: item.equipment_id.includes('FURN')
                              ? 'rgba(249, 115, 22, 0.15)'
                              : item.equipment_id.includes('COMP')
                              ? 'rgba(6, 182, 212, 0.15)'
                              : item.equipment_id.includes('CNC')
                              ? 'rgba(139, 92, 246, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                            color: item.equipment_id.includes('FURN')
                              ? '#ea580c'
                              : item.equipment_id.includes('COMP')
                              ? '#0284c7'
                              : item.equipment_id.includes('CNC')
                              ? '#7c3aed'
                              : '#059669',
                            border: `1px solid ${
                              item.equipment_id.includes('FURN')
                                ? 'rgba(249, 115, 22, 0.3)'
                                : item.equipment_id.includes('COMP')
                                ? 'rgba(6, 182, 212, 0.3)'
                                : item.equipment_id.includes('CNC')
                                ? 'rgba(139, 92, 246, 0.3)'
                                : 'rgba(16, 185, 129, 0.3)'
                            }`,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontWeight: 700,
                            fontSize: 10.5,
                          }}
                        >
                          {item.equipment_id}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--slate-300)', fontSize: 10.5 }}>
                        {item.timestamp?.replace('T', ' ')}
                      </td>
                      <td style={{ padding: '10px 14px', textTransform: 'capitalize', color: 'var(--white)', fontWeight: 600 }}>
                        {item.anomaly_type.replace(/_/g, ' ')}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            color: '#fff',
                            background: isCrit
                              ? '#dc2626'
                              : isHigh
                              ? '#d97706'
                              : item.severity === 'medium'
                              ? '#7c3aed'
                              : '#0284c7',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 9.5,
                            fontWeight: 800,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            display: 'inline-block',
                          }}
                        >
                          {item.severity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {item.is_energy_waste ? (
                          <span style={{ color: '#7c3aed', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                            ⚡ Energy Waste
                          </span>
                        ) : (
                          <span style={{ color: '#059669', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                            🛡️ Health Risk
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>
                        {item.confidence_available && item.confidence != null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: 'var(--cyan)', fontWeight: 800, fontSize: 11 }}>
                              {(item.confidence * 100).toFixed(1)}%
                            </span>
                            <span style={{ fontSize: 9, color: 'var(--slate-400)', background: 'rgba(0,0,0,0.03)', padding: '1px 4px', borderRadius: 3 }}>
                              RF Model
                            </span>
                          </div>
                        ) : item.anomaly_score != null ? (
                          <span title={`Detector margin score: ${item.anomaly_score}`} style={{ color: 'var(--slate-300)', fontSize: 11 }}>
                            Margin {typeof item.anomaly_score === 'number' ? item.anomaly_score.toFixed(3) : item.anomaly_score}
                          </span>
                        ) : (
                          <span
                            title={item.detection_method_label || 'Deterministic threshold baseline'}
                            style={{ color: 'var(--slate-400)', fontSize: 9.5, background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4 }}
                          >
                            Baseline Rule
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: item.status === 'Resolved'
                              ? 'rgba(16,185,129,0.12)'
                              : item.status === 'Investigating'
                              ? 'rgba(245,158,11,0.12)'
                              : 'rgba(2,132,199,0.12)',
                            color: item.status === 'Resolved'
                              ? 'var(--emerald)'
                              : item.status === 'Investigating'
                              ? 'var(--amber)'
                              : 'var(--cyan)',
                          }}
                        >
                          {item.status || 'New'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderColor: 'var(--border)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIncidentId(item.incident_id);
                          }}
                        >
                          Inspect →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--slate-400)' }}>
            Showing {anomalies.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, totalAnomalies)} of {totalAnomalies} incidents
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: 'var(--white)', fontWeight: 600 }}>
              {page} / {totalPages}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ─── 5. Incident Investigation Drawer ─── */}
      {selectedIncidentId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedIncidentId(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 720,
              height: '100%',
              background: 'var(--bg-surface)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-8px 0 24px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>
                    {selectedIncidentId}
                  </span>
                  {selectedInc?.equipment_id && (
                    <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--cyan-dim)', color: 'var(--cyan)', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {selectedInc.equipment_id}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {drawerLoading ? 'Loading incident metadata...' : `Detected: ${selectedInc?.timestamp?.replace('T', ' ')}`}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDownload('pdf')}
                  disabled={downloadingReport === 'pdf'}
                  title="Download Official Incident PDF Report"
                  style={{ fontSize: 11 }}
                >
                  <Download size={12} /> {downloadingReport === 'pdf' ? 'Generating PDF...' : 'Download PDF (.pdf)'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDownload('docx')}
                  disabled={downloadingReport === 'docx'}
                  title="Download Word DOCX Incident Report"
                  style={{ fontSize: 11 }}
                >
                  <FileText size={12} /> {downloadingReport === 'docx' ? 'Generating DOCX...' : 'Download Word (.docx)'}
                </button>
                <button
                  onClick={() => setSelectedIncidentId(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Download Status Toast Notification */}
            {downloadSuccessMessage && (
              <div
                style={{
                  background: 'var(--emerald-dim)',
                  color: 'var(--emerald)',
                  borderBottom: '1px solid var(--emerald)',
                  padding: '8px 20px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle2 size={13} /> {downloadSuccessMessage}
              </div>
            )}

            {/* Drawer Content */}
            <div style={{ padding: 20, overflowY: 'auto', flexGrow: 1 }}>
              {drawerLoading ? (
                <div style={{ padding: 60, textAlign: 'center', color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 12px' }} />
                  <div>Loading telemetry audit & trend analysis...</div>
                </div>
              ) : drawerError ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>
                  <div>⚠️ {drawerError}</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIncidentId(null)} style={{ marginTop: 12 }}>
                    Close
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Incident Summary Card */}
                  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Mechanism</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', textTransform: 'capitalize', marginTop: 2 }}>
                          {selectedInc?.anomaly_type?.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Severity</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selectedInc?.severity === 'critical' ? 'var(--red)' : 'var(--amber)', textTransform: 'uppercase', marginTop: 2 }}>
                          {selectedInc?.severity}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Model Confidence</div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: selectedInc?.confidence_available && selectedInc?.confidence != null ? 'var(--cyan)' : 'var(--slate-400)',
                            marginTop: 2,
                          }}
                        >
                          {selectedInc?.confidence_available && selectedInc?.confidence != null
                            ? `${(selectedInc.confidence * 100).toFixed(1)}%`
                            : 'Not calibrated'}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: 'var(--slate-500)',
                            fontFamily: 'var(--font-mono)',
                            marginTop: 2,
                            maxWidth: 150,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={selectedInc?.detection_method_label || selectedInc?.model_name || 'Condition-Aware Energy Baseline'}
                        >
                          {selectedInc?.detection_method_label || selectedInc?.model_name || 'Condition-Aware Baseline'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Excess Energy</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selectedInc?.estimated_excess_energy_kwh ? 'var(--violet)' : 'var(--emerald)', marginTop: 2 }}>
                          {selectedInc?.estimated_excess_energy_kwh ? `${selectedInc.estimated_excess_energy_kwh} kWh` : '0 kWh (Health)'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 15-Minute Forecast vs Actual Residual Metric Card */}
                  <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--cyan)', margin: 0 }}>
                        ⚡ 15-Minute Energy Forecast vs Measured Actual
                      </h4>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)' }}>
                        Model: HistGradientBoostingRegressor
                      </span>
                    </div>
                    {selectedInc?.actual_energy_kwh !== undefined && selectedInc?.predicted_energy_kwh !== undefined ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4 }}>
                          <div style={{ fontSize: 9, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Measured Actual</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>{selectedInc.actual_energy_kwh} kWh</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4 }}>
                          <div style={{ fontSize: 9, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Predicted Forecast</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>{selectedInc.predicted_energy_kwh} kWh</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4 }}>
                          <div style={{ fontSize: 9, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Signed Residual</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: (selectedInc.residual_kwh || 0) > 0 ? 'var(--red)' : 'var(--cyan)' }}>
                            {(selectedInc.residual_kwh || 0) > 0 ? `+${selectedInc.residual_kwh}` : selectedInc.residual_kwh} kWh
                          </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4 }}>
                          <div style={{ fontSize: 9, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Relative Deviation</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: (selectedInc.relative_deviation_pct || 0) > 0 ? 'var(--amber)' : 'var(--emerald)' }}>
                            {selectedInc.relative_deviation_pct !== undefined ? `${selectedInc.relative_deviation_pct > 0 ? '+' : ''}${selectedInc.relative_deviation_pct}%` : 'N/A'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--slate-400)', fontStyle: 'italic', padding: '4px 0' }}>
                        Forecast comparison standing by (operating in condition-aware sensor anomaly mode).
                      </div>
                    )}
                  </div>


                  {/* Sensor Measurements Grid */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--white)', margin: 0 }}>
                        Active Sensor Telemetry
                      </h4>
                      {selectedInc?.anomaly_score != null && (
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--cyan)', background: 'rgba(2, 132, 199, 0.1)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(2, 132, 199, 0.2)' }}>
                          Detector Score: {typeof selectedInc.anomaly_score === 'number' ? selectedInc.anomaly_score.toFixed(3) : selectedInc.anomaly_score}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      <div style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Active Electrical Power</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>
                          {selectedInc?.actual_power_kw ?? selectedInc?.sensor_readings?.power_consumption_kw ?? '--'} kW
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                          Expected: {selectedInc?.expected_power_kw ?? '--'} kW ({selectedInc?.deviation_pct ? `${selectedInc.deviation_pct > 0 ? '+' : ''}${selectedInc.deviation_pct}% deviation` : 'nominal'})
                        </div>
                      </div>

                      {selectedInc?.sensor_readings?.temperature_c !== undefined && (
                        <div style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Temperature</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>
                            {selectedInc.sensor_readings.temperature_c} °C
                          </div>
                        </div>
                      )}

                      {selectedInc?.sensor_readings?.vibration_mm_s !== undefined && (
                        <div style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Vibration Velocity</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>
                            {selectedInc.sensor_readings.vibration_mm_s} mm/s
                          </div>
                        </div>
                      )}

                      {selectedInc?.sensor_readings?.discharge_pressure_bar !== undefined && (
                        <div style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Discharge Pressure</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>
                            {selectedInc.sensor_readings.discharge_pressure_bar} bar
                          </div>
                        </div>
                      )}

                      {selectedInc?.sensor_readings?.airflow_cfm !== undefined && (
                        <div style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Airflow</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>
                            {selectedInc.sensor_readings.airflow_cfm} CFM
                          </div>
                        </div>
                      )}

                      {selectedInc?.sensor_readings?.delta_t_c !== undefined && (
                        <div style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Chilled Water Delta-T</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>
                            {selectedInc.sensor_readings.delta_t_c} °C
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 30-min Trend Chart */}
                  {telemetryWindow.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, color: 'var(--white)' }}>
                        Telemetry Trend Window (±30 min)
                      </h4>
                      <div style={{ height: 180, background: 'var(--bg-panel)', borderRadius: 6, padding: '10px 4px', border: '1px solid var(--border)' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={telemetryWindow}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                            <XAxis
                              dataKey="timestamp"
                              tickFormatter={(ts) => (typeof ts === 'string' ? ts.slice(11, 16) : '')}
                              stroke="var(--slate-400)"
                              fontSize={9}
                            />
                            <YAxis stroke="var(--slate-400)" fontSize={9} />
                            <Tooltip
                              contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Line type="monotone" dataKey="power_consumption_kw" name="Power (kW)" stroke="var(--cyan)" dot={false} strokeWidth={2} />
                            {telemetryWindow[0]?.temperature_c !== undefined && (
                              <Line type="monotone" dataKey="temperature_c" name="Temp (°C)" stroke="var(--red)" dot={false} strokeWidth={1.5} />
                            )}
                            {telemetryWindow[0]?.vibration_mm_s !== undefined && (
                              <Line type="monotone" dataKey="vibration_mm_s" name="Vib (mm/s)" stroke="var(--amber)" dot={false} strokeWidth={1.5} />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Root Cause & Diagnostic Explanations */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'var(--bg-panel)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>Model Evidence & Audit</div>
                      <ul style={{ paddingLeft: 16, fontSize: 11, color: 'var(--slate-400)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {selectedInc?.evidence?.map((ev: string, idx: number) => (
                          <li key={idx}>{ev}</li>
                        )) || <li>Operating parameters outside baseline envelope.</li>}
                      </ul>
                    </div>

                    <div style={{ background: 'var(--bg-panel)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>Recommended Action</div>
                      <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>
                        {selectedInc?.recommended_action || 'Inspect equipment subsystem and verify operating conditions.'}
                      </div>
                    </div>
                  </div>

                  {/* Actionable Energy Optimization Checklist */}
                  {selectedInc?.action_recommendations && selectedInc.action_recommendations.length > 0 && (
                    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--cyan)', margin: 0 }}>
                          Actionable Energy Optimization Checklist
                        </h4>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)' }}>
                          Evidence-Linked Mitigation
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {selectedInc.action_recommendations.map((rec: ActionRecommendation, rIdx: number) => {
                          const prioColor = rec.suggested_priority === 'immediate' ? 'var(--red)' : rec.suggested_priority === 'next_shift' ? 'var(--amber)' : 'var(--cyan)';
                          return (
                            <div key={rIdx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--white)' }}>
                                  {rec.recommended_action}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: prioColor, border: `1px solid ${prioColor}`, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                                  {rec.suggested_priority.replace('_', ' ')}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--slate-400)', marginBottom: 4 }}>
                                <strong>Rationale:</strong> {rec.why_relevant}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                                🔍 Verification: {rec.suggested_verification}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}


                  {/* Status & Technician Investigation Form */}
                  <form onSubmit={handleStatusUpdate} style={{ background: 'var(--bg-panel)', padding: 16, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <h4 style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12, color: 'var(--white)' }}>
                      Incident Investigation & Workflow Status
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', marginBottom: 4 }}>
                          Workflow Status
                        </label>
                        <select
                          value={statusVal}
                          onChange={(e) => setStatusVal(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--white)', fontSize: 11 }}
                        >
                          <option value="New">New (Unassigned)</option>
                          <option value="Investigating">Investigating (Technician on Floor)</option>
                          <option value="Resolved">Resolved (Maintenance Completed)</option>
                          <option value="False Positive">False Positive (Operational Exception)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', marginBottom: 4 }}>
                          Technician Investigation Notes
                        </label>
                        <textarea
                          rows={2}
                          value={technicianNotes}
                          onChange={(e) => setTechnicianNotes(e.target.value)}
                          placeholder="Log inspection findings, measurements, physical damage..."
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--white)', fontSize: 11, resize: 'vertical' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', marginBottom: 4 }}>
                          Resolution Notes
                        </label>
                        <textarea
                          rows={2}
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                          placeholder="Document replaced parts, relubrication, seal repairs..."
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--white)', fontSize: 11, resize: 'vertical' }}
                        />
                      </div>

                      {statusSuccess && (
                        <div style={{ color: 'var(--emerald)', fontSize: 11, fontWeight: 600 }}>
                          ✓ Status & technician investigation notes persisted successfully.
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                        <button type="submit" className="btn btn-cyan btn-sm" disabled={savingStatus}>
                          {savingStatus ? 'Saving...' : 'Update Incident Status'}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. Upload Telemetry Modal ─── */}
      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: 'var(--bg-surface)',
              borderRadius: 'var(--r)',
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>Upload Telemetry Readings</h3>
                <p style={{ fontSize: 11, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>
                  Ingest CSV or Excel telemetry readings for offline AI anomaly analysis
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', marginBottom: 6 }}>
                  Telemetry File (.csv, .xlsx, .xls) *
                </label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px dashed var(--border)', background: 'var(--bg-panel)', fontSize: 11, color: 'var(--white)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', marginBottom: 6 }}>
                  Equipment Class (Optional)
                </label>
                <select
                  value={uploadEquipmentType}
                  onChange={(e) => setUploadEquipmentType(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--white)', fontSize: 11 }}
                >
                  <option value="">Auto-Detect from Equipment ID</option>
                  <option value="furnace">Furnace (temperature_c, temp_setpoint_c)</option>
                  <option value="air_compressor">Air Compressor (discharge_pressure_bar, airflow_cfm)</option>
                  <option value="cnc_machine">CNC Machine (spindle_rpm, spindle_load_pct)</option>
                  <option value="chiller">Chilled Water System (supply_temp_c, water_flow_m3h)</option>
                </select>
              </div>

              <div style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)', background: 'var(--bg-panel)', padding: 10, borderRadius: 4, border: '1px solid var(--border)' }}>
                <strong>Required Columns:</strong> timestamp, equipment_id, power_consumption_kw, operating_mode.<br />
                <em>Ground-truth leakage columns (is_anomaly, alert_code) are stripped automatically before inference.</em>
              </div>

              {uploadError && (
                <div style={{ color: 'var(--red)', fontSize: 11, background: 'rgba(220,38,38,0.08)', padding: 10, borderRadius: 4 }}>
                  ⚠️ {uploadError}
                </div>
              )}

              {uploadResult && !uploadResult.valid && (
                <div style={{ color: 'var(--red)', fontSize: 11, background: 'rgba(220,38,38,0.08)', padding: 10, borderRadius: 4 }}>
                  <strong>Validation Failed:</strong>
                  <ul style={{ paddingLeft: 16, marginTop: 4 }}>
                    {uploadResult.errors?.map((err: string, i: number) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {uploadResult && uploadResult.valid && (
                <div style={{ color: 'var(--emerald)', fontSize: 11, background: 'var(--emerald-dim)', padding: 10, borderRadius: 4 }}>
                  <strong>Upload Ingested Successfully!</strong>
                  <div>Rows processed: {uploadResult.row_count}</div>
                  <div>Anomalies created: {uploadResult.incidents_created || 0}</div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-cyan btn-sm" disabled={uploading}>
                  {uploading ? 'Analyzing...' : 'Upload & Analyze Telemetry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

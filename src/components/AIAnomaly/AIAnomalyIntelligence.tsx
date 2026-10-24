import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Layers,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sliders,
  TrendingDown,
  Upload,
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
  uploadTelemetry,
  type AnomalyIncident,
  type ActionRecommendation,
  type DashboardSummaryResponse,
  type IncidentDetailsResponse,
} from '../../services/anomalyApi';

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

  // Load Anomalies Table
  const loadAnomalies = useCallback(async () => {
    try {
      setTableLoading(true);
      setTableError(null);
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
    } catch (err: any) {
      setTableError(err.message || 'Failed to load anomaly incidents.');
    } finally {
      setTableLoading(false);
    }
  }, [equipmentId, anomalyType, severity, statusFilter, searchTerm, page]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadAnomalies();
  }, [loadAnomalies]);

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
    } catch (err: any) {
      alert(`Report download error: ${err.message}`);
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

      {/* ─── 3. Filter Controls Bar ─── */}
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>
          <Filter size={12} /> Filters:
        </div>

        {/* Equipment */}
        <select
          value={equipmentId}
          onChange={(e) => { setEquipmentId(e.target.value); setPage(1); }}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--white)' }}
        >
          <option value="">All Equipment</option>
          <option value="FURNACE-01">FURNACE-01 (Heat Furnace)</option>
          <option value="AIR-COMP-01">AIR-COMP-01 (Screw Compressor)</option>
          <option value="CNC-01">CNC-01 (5-Axis Machining)</option>
          <option value="CHILLER-01">CHILLER-01 (Water Chiller)</option>
        </select>

        {/* Severity */}
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--white)' }}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--white)' }}
        >
          <option value="">All Statuses</option>
          <option value="New">New</option>
          <option value="Investigating">Investigating</option>
          <option value="Resolved">Resolved</option>
          <option value="False Positive">False Positive</option>
        </select>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', gap: 6, flexGrow: 1, minWidth: 160 }}>
          <Search size={12} color="var(--slate-400)" />
          <input
            type="text"
            placeholder="Search incident ID, evidence, machine..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--white)', width: '100%' }}
          />
        </div>

        <button className="btn btn-ghost btn-sm" onClick={resetFilters}>
          Reset
        </button>
      </div>

      {/* ─── 4. Anomaly Table ─── */}
      <div className="panel-card" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: 'var(--slate-400)' }}>
                <th style={{ padding: '10px 14px' }}>Incident ID</th>
                <th style={{ padding: '10px 14px' }}>Equipment</th>
                <th style={{ padding: '10px 14px' }}>Timestamp</th>
                <th style={{ padding: '10px 14px' }}>Mechanism</th>
                <th style={{ padding: '10px 14px' }}>Severity</th>
                <th style={{ padding: '10px 14px' }}>Category</th>
                <th style={{ padding: '10px 14px' }}>Score</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={14} className="spin" /> Loading telemetry anomalies...
                    </div>
                  </td>
                </tr>
              ) : tableError ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                    <div>⚠️ {tableError}</div>
                    <button className="btn btn-sm btn-ghost" onClick={loadAnomalies} style={{ marginTop: 8 }}>
                      Retry
                    </button>
                  </td>
                </tr>
              ) : anomalies.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>
                    No matching anomaly incidents found.
                  </td>
                </tr>
              ) : (
                anomalies.map((item) => {
                  const isCrit = item.severity === 'critical';
                  const isHigh = item.severity === 'high';
                  const sevColor = isCrit ? 'var(--red)' : isHigh ? 'var(--amber)' : item.severity === 'medium' ? 'var(--violet)' : 'var(--cyan)';

                  return (
                    <tr
                      key={item.incident_id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setSelectedIncidentId(item.incident_id)}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--white)' }}>
                        {item.incident_id}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--cyan-dim)', color: 'var(--cyan)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                          {item.equipment_id}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--slate-400)' }}>
                        {item.timestamp?.replace('T', ' ')}
                      </td>
                      <td style={{ padding: '10px 14px', textTransform: 'capitalize', color: 'var(--white)', fontWeight: 500 }}>
                        {item.anomaly_type.replace(/_/g, ' ')}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            color: sevColor,
                            background: `rgba(${isCrit ? '220,38,38' : isHigh ? '234,88,12' : '124,58,237'}, 0.1)`,
                            border: `1px solid ${sevColor}`,
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {item.severity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {item.is_energy_waste ? (
                          <span style={{ color: 'var(--violet)', background: 'rgba(124,58,237,0.1)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                            ⚡ Energy Waste
                          </span>
                        ) : (
                          <span style={{ color: 'var(--emerald)', background: 'var(--emerald-dim)', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>
                            🛡️ Health Risk
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--slate-500)' }}>
                        {item.model_score !== undefined ? `${(item.model_score * 100).toFixed(0)}%` : '--'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: item.status === 'Resolved' ? 'var(--emerald)' : item.status === 'Investigating' ? 'var(--amber)' : 'var(--slate-400)',
                          }}
                        >
                          {item.status || 'New'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 10, padding: '3px 8px' }}
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
                >
                  <Download size={11} /> {downloadingReport === 'pdf' ? 'Generating PDF...' : 'PDF'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDownload('docx')}
                  disabled={downloadingReport === 'docx'}
                  title="Download Word DOCX Incident Report"
                >
                  <FileText size={11} /> {downloadingReport === 'docx' ? 'Generating...' : 'DOCX'}
                </button>
                <button
                  onClick={() => setSelectedIncidentId(null)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', padding: 4 }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

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
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cyan)', marginTop: 2 }}>
                          {selectedInc?.model_score !== undefined ? `${(selectedInc.model_score * 100).toFixed(1)}%` : '--'}
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
                    <h4 style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, color: 'var(--white)' }}>
                      Active Sensor Telemetry
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      <div style={{ background: 'var(--bg-panel)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 10, color: 'var(--slate-400)', fontFamily: 'var(--font-mono)' }}>Active Electrical Power</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)' }}>
                          {selectedInc?.actual_power_kw ?? selectedInc?.sensor_readings?.power_consumption_kw ?? '--'} kW
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                          Expected: {selectedInc?.expected_power_kw ?? '--'} kW ({selectedInc?.deviation_pct ?? 0}%)
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

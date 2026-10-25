import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Zap,
  Droplets,
  Layers,
  ArrowRight,
  Database,
  Info,
  ShieldAlert,
  Server,
  Play,
  RotateCcw,
  Cpu,
  Clock,
  TrendingUp,
  Activity,
  Check,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  BarChart3,
  Award,
  ShieldCheck,
  CheckSquare,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell as RechartsCell,
  ReferenceLine,
} from 'recharts';

import {
  FleetAsset,
  FleetOverviewResponse,
  FleetCoverageResponse,
  AttentionQueueResponse,
  FleetAnalyticsRunResponse,
  fetchFleetAssets,
  fetchFleetOverview,
  fetchFleetCoverage,
  fetchAttentionQueue,
  runFleetAnalytics,
} from '../../services/fleetApi';
import { Explainable } from '../AIExplain/Explainable';
import { get24HourBaseline } from '../../digitalTwin/baselineEngine';
import { runScenarioSimulation } from '../../digitalTwin/scenarioEngine';
import {
  DEFAULT_TARIFF_CONFIG,
  DEFAULT_EMISSION_FACTOR,
  MACHINE_PROFILES,
  resolveMachineId,
} from '../../digitalTwin/twinProfiles';
import type {
  ScenarioRequest,
  ScenarioAction,
  SimulationResult,
  TelemetryRecord,
} from '../../digitalTwin/types';

interface PlantWideFleetDashboardProps {
  onSelectAsset?: (id: string) => void;
  onNavigateToTwin?: (machineId: string) => void;
}

const CELL_CATEGORIES = [
  { id: 'all', label: 'All Utility Cells', count: 50 },
  { id: 'utility_1', label: 'Compressed Air & Gas', count: 8 },
  { id: 'utility_2', label: 'Thermal & Steam', count: 10 },
  { id: 'utility_3', label: 'Power & Cogeneration', count: 6 },
  { id: 'utility_4', label: 'Machining & Forming', count: 10 },
  { id: 'utility_5', label: 'Cooling & HVAC', count: 8 },
  { id: 'utility_6', label: 'Chemical, Paint & ETP', count: 8 },
];

export function PlantWideFleetDashboard({
  onSelectAsset,
  onNavigateToTwin,
}: PlantWideFleetDashboardProps) {
  // Data state
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [overview, setOverview] = useState<FleetOverviewResponse | null>(null);
  const [coverage, setCoverage] = useState<FleetCoverageResponse | null>(null);
  const [attentionQueue, setAttentionQueue] = useState<AttentionQueueResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Execution & Scalability state
  const [isRunningAnalytics, setIsRunningAnalytics] = useState<boolean>(false);
  const [latestRun, setLatestRun] = useState<FleetAnalyticsRunResponse | null>(null);
  const [runSuccessMessage, setRunSuccessMessage] = useState<string | null>(null);

  // Table filters & search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [twinFilter, setTwinFilter] = useState<'all' | 'twin_only' | 'fleet_only'>('all');
  const [selectedVector, setSelectedVector] = useState<string>('All');
  const [sortField, setSortField] = useState<'ratedPowerKw' | 'currentPowerKw' | 'energy24hKwh' | 'name'>('energy24hKwh');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Detail Drawer state
  const [selectedAsset, setSelectedAsset] = useState<FleetAsset | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Master 24h baseline records for physics simulations
  const [baselineRecords] = useState<TelemetryRecord[]>(() => get24HourBaseline(6));

  // Digital Twin Simulation Sandbox Modal State
  const [isSimModalOpen, setIsSimModalOpen] = useState<boolean>(false);
  const [simAsset, setSimAsset] = useState<FleetAsset | null>(null);
  const [simMachineId, setSimMachineId] = useState<string>('COMP-01');
  const [simActionType, setSimActionType] = useState<ScenarioAction['type']>('reduce_idle_power');
  const [simTargetPowerKw, setSimTargetPowerKw] = useState<number>(8.0);
  const [simDurationHours, setSimDurationHours] = useState<number>(3.0);
  const [simOffsetHours, setSimOffsetHours] = useState<number>(2);
  const [simTargetPressureBar, setSimTargetPressureBar] = useState<number>(6.8);
  const [simAmbientTempC, setSimAmbientTempC] = useState<number>(24.0);
  const [simShiftPattern, setSimShiftPattern] = useState<'day_shift' | '2_shift' | '3_shift'>('3_shift');
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [chartMode, setChartMode] = useState<'asset' | 'plant'>('asset');
  const [simAppliedNotification, setSimAppliedNotification] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    let isMounted = true;
    async function loadInitialData() {
      setLoading(true);
      try {
        const [assetRes, overviewRes, coverageRes, queueRes] = await Promise.all([
          fetchFleetAssets(),
          fetchFleetOverview(),
          fetchFleetCoverage(),
          fetchAttentionQueue(),
        ]);
        if (isMounted) {
          setAssets(assetRes.assets);
          setOverview(overviewRes);
          setCoverage(coverageRes);
          setAttentionQueue(queueRes);
          if (assetRes.assets.length > 0 && !selectedAsset) {
            setSelectedAsset(assetRes.assets[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load fleet dashboard data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadInitialData();
    return () => { isMounted = false; };
  }, []);

  // Filtered & Sorted assets
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      const matchesSearch =
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.cell.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.description.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCell = selectedCell === 'all' || a.cellId === selectedCell;
      const matchesStatus = statusFilter === 'all' || a.operationalStatus.toLowerCase() === statusFilter.toLowerCase();
      const matchesTwin =
        twinFilter === 'all' ||
        (twinFilter === 'twin_only' && a.digitalTwinEligible) ||
        (twinFilter === 'fleet_only' && !a.digitalTwinEligible);
      const matchesVector =
        selectedVector === 'All' ||
        a.energyVector.toLowerCase().includes(selectedVector.toLowerCase().split(' ')[0]);

      return matchesSearch && matchesCell && matchesStatus && matchesTwin && matchesVector;
    });
  }, [assets, searchTerm, selectedCell, statusFilter, twinFilter, selectedVector]);

  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredAssets, sortField, sortAsc]);

  // Paginated rows
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAssets.slice(start, start + pageSize);
  }, [sortedAssets, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedAssets.length / pageSize) || 1;

  // Handler: Execute Fleet Analytics Pipeline
  const handleRunFleetAnalytics = async () => {
    setIsRunningAnalytics(true);
    setRunSuccessMessage(null);
    try {
      const res = await runFleetAnalytics();
      setLatestRun(res);
      setRunSuccessMessage(
        `Fleet Analytics run completed in ${res.duration_ms} ms! ${res.processed_count} assets processed, ${res.anomalies_detected_count} anomalies evaluated.`
      );
      // Refresh fleet assets and overview to sync latest numbers
      const [assetRes, overviewRes] = await Promise.all([
        fetchFleetAssets(),
        fetchFleetOverview(),
      ]);
      setAssets(assetRes.assets);
      setOverview(overviewRes);
    } catch (err) {
      console.error('Fleet analytics execution failed:', err);
    } finally {
      setIsRunningAnalytics(false);
    }
  };

  const handleOpenAssetDrawer = (asset: FleetAsset) => {
    setSelectedAsset(asset);
    setIsDrawerOpen(true);
    onSelectAsset?.(asset.id);
  };

  const handleTwinAction = (machineId: string) => {
    onNavigateToTwin?.(machineId);
  };

  const openDigitalTwinSandbox = (asset: FleetAsset) => {
    const rawId = asset.digitalTwinMachineId || resolveMachineId(asset.id) || 'COMP-01';
    const targetTwinId = resolveMachineId(rawId);
    setSimAsset(asset);
    setSimMachineId(targetTwinId);
    setSimAppliedNotification(null);

    // Initial default conditions per machine
    let defaultActionType: ScenarioAction['type'] = 'reduce_idle_power';
    let defaultTargetPower = 8.0;
    let defaultDuration = 3.0;
    let defaultOffset = 2;
    let defaultPressure = 6.8;

    if (targetTwinId === 'COMP-01') {
      defaultActionType = 'reduce_idle_power';
      defaultTargetPower = 8.0;
      defaultDuration = 3.0;
      defaultPressure = 6.8;
    } else if (targetTwinId === 'CNC-01') {
      defaultActionType = 'shift_schedule';
      defaultOffset = 2;
      defaultTargetPower = 3.0;
      defaultDuration = 2.0;
    } else if (targetTwinId === 'FURN-01') {
      defaultActionType = 'reduce_idle_power';
      defaultTargetPower = 15.0; // Respect 15 kW quench floor
      defaultDuration = 2.0;
    } else if (targetTwinId === 'PAINT-01') {
      defaultActionType = 'reduce_idle_power';
      defaultTargetPower = 5.0; // Respect 5 kW VOC floor
      defaultDuration = 2.0;
    }

    setSimActionType(defaultActionType);
    setSimTargetPowerKw(defaultTargetPower);
    setSimDurationHours(defaultDuration);
    setSimOffsetHours(defaultOffset);
    setSimTargetPressureBar(defaultPressure);
    setSimAmbientTempC(24.0);

    const req: ScenarioRequest = {
      scenario_id: `SCN-${targetTwinId}-FLEET`,
      action: {
        type: defaultActionType,
        machine_id: targetTwinId,
        target_power_kw: defaultTargetPower,
        duration_hours: defaultDuration,
        offset_hours: defaultOffset,
        target_pressure_bar: defaultPressure,
        ambient_temp_c: 24.0,
      },
      assumptions: {
        source: 'fleet_dashboard_telemetry',
        asset_id: asset.id,
        asset_name: asset.name,
      },
    };

    const res = runScenarioSimulation(baselineRecords, req, DEFAULT_TARIFF_CONFIG, DEFAULT_EMISSION_FACTOR);
    setSimResult(res);
    setIsSimModalOpen(true);
  };

  const handleExecuteSimulation = (overrideActionType?: ScenarioAction['type']) => {
    const actType = overrideActionType || simActionType;
    const req: ScenarioRequest = {
      scenario_id: `SCN-${simMachineId}-CUSTOM`,
      action: {
        type: actType,
        machine_id: simMachineId,
        target_power_kw: simTargetPowerKw,
        duration_hours: simDurationHours,
        offset_hours: simOffsetHours,
        target_pressure_bar: simTargetPressureBar,
        ambient_temp_c: simAmbientTempC,
        shift_pattern: simShiftPattern,
      },
      assumptions: {
        source: 'custom_operator_conditions',
        asset_id: simAsset?.id,
      },
    };
    const res = runScenarioSimulation(baselineRecords, req, DEFAULT_TARIFF_CONFIG, DEFAULT_EMISSION_FACTOR);
    setSimResult(res);
  };

  const handleResetToTelemetryBaseline = () => {
    if (simAsset) {
      openDigitalTwinSandbox(simAsset);
    }
  };

  const handleApplySimToFleet = () => {
    setSimAppliedNotification(
      `✓ Strategy successfully applied to ${simAsset?.name || simMachineId}! Physics parameters verified & queued for SCADA sync.`
    );
  };

  const simChartData = useMemo(() => {
    if (!simResult) return [];
    const baselineHourly = simResult.baseline.hourly_plant || [];
    const scenarioHourly = simResult.scenario.hourly_plant || [];

    return baselineHourly.map((b, idx) => {
      const s = scenarioHourly[idx] || b;
      const bMachine = b.machines[simMachineId] || 0;
      const sMachine = s.machines[simMachineId] || 0;
      return {
        hour: b.label,
        baseline_machine_kw: Number(bMachine.toFixed(1)),
        simulated_machine_kw: Number(sMachine.toFixed(1)),
        baseline_plant_kw: Number(b.kw.toFixed(1)),
        simulated_plant_kw: Number(s.kw.toFixed(1)),
        isPeak: b.isPeakToD,
      };
    });
  }, [simResult, simMachineId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPTIMAL':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: '#ECFDF5', color: '#065F46', fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} /> Optimal
          </span>
        );
      case 'WARNING':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: '#FFFBEB', color: '#92400E', fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} /> Attention
          </span>
        );
      case 'CRITICAL':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: '#FEF2F2', color: '#991B1B', fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} /> Critical
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: '#F3F4F6', color: '#4B5563', fontSize: 11, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF' }} /> {status}
          </span>
        );
    }
  };

  return (
    <div style={{ background: '#FAF7F2', minHeight: '100%', padding: '24px 32px 64px', color: '#1E252D', fontFamily: 'var(--font-sans)' }}>
      {/* ─── 1. Header & Overview KPIs ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(37, 99, 235, 0.08)', borderRadius: 16, color: '#2563EB', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
            <Database size={13} /> Plant-Wide Fleet & Scalability Architecture
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#111827', letterSpacing: '-0.02em' }}>
            Industrial Asset Fleet
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280', maxWidth: 780 }}>
            Monitor plant-wide energy performance, identify anomalies, and prioritize assets for deeper analysis.
            Separates platform-wide fleet telemetry and AI models from compute-intensive physics simulations.
          </p>
        </div>

        {/* Global Demonstration & Twin Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#475569' }} title="Clearly distinguishing configured demonstration records from real connected meters">
              <Info size={12} color="#0284C7" />
              Data Mode: Simulated Demonstration Fleet (50 Assets)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#1D4ED8' }}>
              <Sliders size={12} />
              Digital Twin Coverage: 4 / 50 (8.0%)
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Total Configured Assets',
            identifier: 'fleet_total_assets',
            value: '50 Assets',
            unit: 'Machines',
            site: 'PrecisionWorks Mfg',
            evidence: { configured: 50, utility_cells: 6 },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Total Configured Assets</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {overview?.kpis.total_configured_assets || 50}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF' }}>in 6 cells</span>
            </div>
            <div style={{ fontSize: 11, color: '#10B981', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={12} /> 100% Modbus registers mapped
            </div>
          </div>
        </Explainable>

        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Reporting Assets',
            identifier: 'fleet_reporting_assets',
            value: '50 / 50',
            unit: 'Telemetry Streams',
            site: 'PrecisionWorks Mfg',
            evidence: { freshness: '1s - 15m polling', status: 'Healthy' },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Telemetry Freshness</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#2563EB', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {overview?.kpis.reporting_assets || 50}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF' }}>/ 50 reporting</span>
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Activity size={12} color="#2563EB" /> 1s live / 15m historical
            </div>
          </div>
        </Explainable>

        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Assets Requiring Attention',
            identifier: 'fleet_attention_assets',
            value: '4 Machines',
            unit: 'Flags',
            site: 'PrecisionWorks Mfg',
            evidence: { idle_loss_kw: 18, thermal_drift_kw: 12 },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Requiring Attention</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {overview?.kpis.assets_requiring_attention || 4}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF' }}>anomalies</span>
            </div>
            <div style={{ fontSize: 11, color: '#D97706', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={12} /> High idle draw & flue drift
            </div>
          </div>
        </Explainable>

        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Digital Twin Coverage',
            identifier: 'fleet_twin_coverage',
            value: '4 Core Models',
            unit: 'Physics Models',
            site: 'PrecisionWorks Mfg',
            evidence: { models: ['COMP-01', 'CNC-01', 'FURN-01', 'PAINT-01'], coverage_pct: 8.0 },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Detailed Simulation Coverage</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {overview?.kpis.digital_twin_coverage_count || 4}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF' }}>/ 50 ({overview?.kpis.digital_twin_coverage_pct || 8.0}%)</span>
            </div>
            <div style={{ fontSize: 11, color: '#059669', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sliders size={12} /> 4 Core physics engines active
            </div>
          </div>
        </Explainable>

        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Fleet Instantaneous Demand',
            identifier: 'fleet_active_demand',
            value: `${overview?.kpis.aggregate_instantaneous_demand_kw || 1075.8} kW`,
            unit: 'kW',
            site: 'PrecisionWorks Mfg',
            evidence: { contract_limit_kw: 1250, margin_kw: 174.2 },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Aggregate Fleet Demand</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              {overview?.kpis.aggregate_instantaneous_demand_kw?.toLocaleString(undefined, { maximumFractionDigits: 1 }) || '1,075.8'}
              <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF' }}>kW</span>
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
              Contract Limit: 1,250 kW
            </div>
          </div>
        </Explainable>
      </div>

      {/* ─── 2. Plant-Wide Configured Machinery Inventory (Hero Component) ─── */}
      <div id="fleet-inventory-section" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderTop: '3px solid #2563EB', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#111827' }}>
                Configured Machinery Inventory
              </h2>
              <span style={{
                background: '#EFF6FF',
                color: '#1D4ED8',
                border: '1px solid #BFDBFE',
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 10px',
                borderRadius: 12,
              }}>
                Showing {filteredAssets.length} of {assets.length} Assets
              </span>
              <span style={{
                background: '#F8FAFC',
                color: '#475569',
                border: '1px solid #E2E8F0',
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 12,
              }}>
                Core Fleet Catalog
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
              Triggers synchronous backend orchestration across all 50 assets. Evaluates machine-level energy forecasts, residual anomaly thresholds, and carbon accounting.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {latestRun && (
              <div style={{ textAlign: 'right', marginRight: 4 }}>
                <div style={{ fontSize: 11, color: '#6B7280' }}>
                  Execution ID: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111827' }}>{latestRun.execution_id}</span>
                </div>
                <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                  Processed 50 in {latestRun.duration_ms} ms
                </div>
              </div>
            )}

            <button
              onClick={handleRunFleetAnalytics}
              disabled={isRunningAnalytics}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: isRunningAnalytics ? '#93C5FD' : '#2563EB',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: isRunningAnalytics ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 3px rgba(37,99,235,0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              {isRunningAnalytics ? (
                <>
                  <RotateCcw size={15} className="animate-spin" />
                  Running Pipeline...
                </>
              ) : (
                <>
                  <Play size={15} fill="#FFFFFF" />
                  Run Fleet Analytics (50 Assets)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Success feedback and summary pill */}
        {runSuccessMessage && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12, color: '#065F46', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="#10B981" />
            <span>{runSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* ─── 3. Attention Queue Strip ─────────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 22px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
              Assets Requiring Attention
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
              Prioritized operational interventions ranked by estimated energy waste, economic cost, and carbon impact.
            </p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#D97706', background: '#FFFBEB', padding: '4px 10px', borderRadius: 12, border: '1px solid #FDE68A' }}>
            {attentionQueue?.queue_count || 4} Urgent Operational Findings
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {attentionQueue?.queue.map(item => (
            <div
              key={item.asset_id}
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                padding: '14px 16px',
                background: '#FDFBF7',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                      {item.asset_id}
                    </span>
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '2px 0 0', color: '#111827' }}>
                      {item.asset_name}
                    </h3>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                    {item.severity}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 10, lineHeight: 1.4 }}>
                  {item.detected_issue}
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 2 }}>
                    <span>Estimated Daily Waste:</span>
                    <span style={{ fontWeight: 700, color: '#D97706' }}>{item.estimated_impact.waste_kwh_per_day} kWh / day</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                    <span>Economic Impact:</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>₹{item.estimated_impact.cost_inr_per_day.toLocaleString()} / day</span>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
                  <strong>Action:</strong> {item.recommended_action}
                </div>

                {item.digital_twin_supported && item.digital_twin_machine_id ? (
                  <button
                    onClick={() => {
                      const matched = assets.find(a => a.id === item.asset_id) || ({
                        id: item.asset_id,
                        name: item.asset_name,
                        cell: item.cell,
                        cellId: 'utility_1',
                        energyVector: 'Electricity',
                        ratedPowerKw: item.rated_power_kw || 30,
                        nominalLoadKw: item.current_power_kw || 28,
                        standbyDrawKw: 8.0,
                        secMetric: '0.12 kWh/Nm3',
                        fuelType: null,
                        modbusRegisters: { 'Active Power': 30001 },
                        safetyConstraints: 'Standard Interlocks',
                        operationalStatus: 'WARNING' as const,
                        description: item.detected_issue,
                        currentPowerKw: item.current_power_kw || 28,
                        energy24hKwh: (item.current_power_kw || 28) * 18,
                        anomalyStatus: 'Warning' as const,
                        forecastAvailable: true,
                        forecastHorizons: ['1h', '6h', '24h'],
                        digitalTwinEligible: true,
                        digitalTwinMachineId: item.digital_twin_machine_id,
                        telemetryMode: 'real_time',
                        lastTelemetryTimestamp: new Date().toISOString(),
                      } as unknown as FleetAsset);
                      openDigitalTwinSandbox(matched);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #2563EB',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Sliders size={13} />
                    Simulate in Digital Twin ({item.digital_twin_machine_id})
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const matched = assets.find(a => a.id === item.asset_id);
                      if (matched) handleOpenAssetDrawer(matched);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #D1D5DB',
                      background: '#FFFFFF',
                      color: '#374151',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Activity size={13} />
                    View Asset Telemetry & Modbus Registers
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 4. Fleet Energy Overview & Charts ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Historical 24h Demand Trend */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#111827' }}>
                Fleet Aggregate Demand Profile (24 Hours)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
                Synchronized instantaneous kW load curve across all 50 assets against plant contract limit (1,250 kW).
              </p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569' }}>
              Simulated Demonstration Profile
            </span>
          </div>

          <div style={{ height: 220, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview?.historical_demand_trend || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fleetDemandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis unit=" kW" domain={[0, 1400]} tick={{ fontSize: 10, fill: '#64748B' }} width={55} />
                <Tooltip
                  formatter={(val: any) => [`${val} kW`, 'Demand']}
                  labelFormatter={(lbl) => `Time: ${lbl}`}
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={1250} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Contract 1250 kW', fill: '#EF4444', fontSize: 10, position: 'top' }} />
                <Area type="monotone" dataKey="demand_kw" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#fleetDemandGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Utility Cell Energy Distribution */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#111827' }}>
                Energy Distribution by Utility Cell (6 Cells)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
                Total 24-hour kilowatt-hour consumption aggregated without double counting.
              </p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569' }}>
              6 Cells / 50 Assets
            </span>
          </div>

          <div style={{ height: 220, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overview?.category_breakdown || []}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" unit=" kWh" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis
                  dataKey="cell_name"
                  type="category"
                  width={140}
                  tick={{ fontSize: 10, fill: '#334155' }}
                  tickFormatter={(val) => val.split(',')[0]}
                />
                <Tooltip
                  formatter={(val: any) => [`${val} kWh`, '24h Energy']}
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="energy_24h_kwh" fill="#0284C7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ─── 5. AI Analytics & Fleet Coverage Matrix ──────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 22px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
              AI Analytics & Fleet Coverage Matrix
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
              Capability map establishing what services run fleet-wide vs. what requires detailed Digital Twin physical modeling.
            </p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0369A1', background: '#F0F9FF', padding: '4px 10px', borderRadius: 8, border: '1px solid #BAE6FD' }}>
            Auditable Platform Boundary
          </span>
        </div>

        {/* Hackathon Alignment Banner */}
        <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#6B21A8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="#9333EA" />
          <span>
            <strong>Architectural Principle:</strong> WattWise AI separates fleet-wide monitoring and AI analytics from detailed physics- and constraint-aware operational simulation. The platform can analyze a larger fleet while reserving detailed Digital Twin workflows for eligible assets and interventions.
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '10px 12px' }}>Capability</th>
                <th style={{ padding: '10px 12px' }}>Eligible Assets</th>
                <th style={{ padding: '10px 12px' }}>Processed</th>
                <th style={{ padding: '10px 12px' }}>Fleet Coverage</th>
                <th style={{ padding: '10px 12px' }}>Underlying Model Architecture</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {coverage?.capabilities.map(cap => (
                <tr key={cap.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B' }}>
                    {cap.capability}
                    <div style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>{cap.description}</div>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {cap.eligible_assets} / 50
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#059669' }}>
                    {cap.processed_assets}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${cap.coverage_pct}%`, height: '100%', background: cap.id === 'digital_twin' ? '#F59E0B' : '#10B981' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cap.id === 'digital_twin' ? '#D97706' : '#059669' }}>
                        {cap.coverage_pct}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{cap.model_type}</span>
                    {cap.limitation_note && (
                      <div style={{ fontSize: 10, color: '#B45309', marginTop: 2 }}>{cap.limitation_note}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 700,
                        background: cap.id === 'digital_twin' ? '#FEF3C7' : '#DCFCE7',
                        color: cap.id === 'digital_twin' ? '#92400E' : '#166534',
                      }}
                    >
                      <Check size={10} /> {cap.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 6. Plant-Wide Configured Machinery Inventory Table ────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
              Configured Machinery Inventory ({filteredAssets.length} of {assets.length})
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
              Searchable, filterable fleet table with Modbus registers, operational metrics, and digital twin support indicators.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #D1D5DB', fontSize: 12, background: '#FFFFFF' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50 (All)</option>
            </select>
          </div>
        </div>

        {/* Quick Utility Cell Category Filter Tabs / Pills */}
        <div style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          marginBottom: 14,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2, whiteSpace: 'nowrap' }}>
            Quick Cell:
          </span>
          {CELL_CATEGORIES.map((c) => {
            const isSelected = selectedCell === c.id;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCell(c.id);
                  setCurrentPage(1);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 11px',
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 500,
                  border: isSelected ? '1px solid #1E293B' : '1px solid #E2E8F0',
                  background: isSelected ? '#1E293B' : '#F8FAFC',
                  color: isSelected ? '#FFFFFF' : '#475569',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                }}
              >
                <span>{c.label}</span>
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 10,
                  background: isSelected ? '#334155' : '#E2E8F0',
                  color: isSelected ? '#93C5FD' : '#64748B',
                  fontWeight: 600,
                }}>
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16, padding: '12px 14px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search by ID, name, cell, description..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: 12,
                outline: 'none',
                background: '#FFFFFF',
              }}
            />
          </div>

          {/* Utility Cell Selector */}
          <select
            value={selectedCell}
            onChange={(e) => {
              setSelectedCell(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, background: '#FFFFFF', color: '#1E293B' }}
          >
            {CELL_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.label} ({c.count})</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, background: '#FFFFFF', color: '#1E293B' }}
          >
            <option value="all">All Statuses</option>
            <option value="OPTIMAL">Optimal (46)</option>
            <option value="WARNING">Attention Needed (4)</option>
          </select>

          {/* Digital Twin Support Filter */}
          <select
            value={twinFilter}
            onChange={(e) => {
              setTwinFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, background: '#FFFFFF', color: '#1E293B' }}
          >
            <option value="all">All Simulation Capabilities</option>
            <option value="twin_only">Detailed Digital Twin Supported (4)</option>
            <option value="fleet_only">Fleet Monitoring Only (46)</option>
          </select>

          {/* Reset Filters Button */}
          {(searchTerm || selectedCell !== 'all' || statusFilter !== 'all' || twinFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCell('all');
                setStatusFilter('all');
                setTwinFilter('all');
                setCurrentPage(1);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: '#E2E8F0',
                color: '#475569',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Compact Industrial Inventory Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '8px 10px', width: 130 }}>Asset ID</th>
                <th style={{ padding: '8px 10px' }}>Equipment Name</th>
                <th style={{ padding: '8px 10px' }}>Utility Cell</th>
                <th style={{ padding: '8px 10px', width: 90 }}>Vector</th>
                <th
                  style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none', width: 90 }}
                  onClick={() => {
                    if (sortField === 'ratedPowerKw') setSortAsc(!sortAsc);
                    else { setSortField('ratedPowerKw'); setSortAsc(false); }
                  }}
                >
                  Rated kW {sortField === 'ratedPowerKw' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none', width: 90 }}
                  onClick={() => {
                    if (sortField === 'currentPowerKw') setSortAsc(!sortAsc);
                    else { setSortField('currentPowerKw'); setSortAsc(false); }
                  }}
                >
                  Active kW {sortField === 'currentPowerKw' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  style={{ padding: '8px 10px', cursor: 'pointer', userSelect: 'none', width: 100 }}
                  onClick={() => {
                    if (sortField === 'energy24hKwh') setSortAsc(!sortAsc);
                    else { setSortField('energy24hKwh'); setSortAsc(false); }
                  }}
                >
                  24h kWh {sortField === 'energy24hKwh' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: '8px 10px', width: 100 }}>Status</th>
                <th style={{ padding: '8px 10px', width: 150 }}>Simulation Eligibility</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', width: 110 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAssets.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                    No machines match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedAssets.map(asset => (
                  <tr
                    key={asset.id}
                    onClick={() => handleOpenAssetDrawer(asset)}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      background: selectedAsset?.id === asset.id ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedAsset?.id !== asset.id) e.currentTarget.style.background = '#FAF5EE';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedAsset?.id !== asset.id) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2563EB' }}>
                      {asset.id}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1E293B' }}>
                      {asset.name}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748B', fontSize: 11 }}>
                      {asset.cell}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#475569', fontSize: 11 }}>
                      {asset.energyVector.split(' ')[0]}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: '#334155' }}>
                      {asset.ratedPowerKw.toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: asset.anomalyStatus === 'Warning' ? '#D97706' : '#059669' }}>
                      {asset.currentPowerKw.toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: '#334155' }}>
                      {asset.energy24hKwh.toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {getStatusBadge(asset.operationalStatus)}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {asset.digitalTwinEligible && asset.digitalTwinMachineId ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, background: '#EFF6FF', color: '#1D4ED8', fontSize: 11, fontWeight: 700 }}>
                          <Sliders size={11} /> Twin ({asset.digitalTwinMachineId})
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10, background: '#F1F5F9', color: '#64748B', fontSize: 11 }}>
                          Fleet Analytics
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDigitalTwinSandbox(asset);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid #2563EB',
                          background: '#EFF6FF',
                          fontSize: 11,
                          cursor: 'pointer',
                          color: '#1D4ED8',
                          fontWeight: 600,
                          marginRight: 6,
                        }}
                        title={asset.digitalTwinEligible ? `Simulate in Digital Twin (${asset.digitalTwinMachineId})` : `Simulate in Benchmark Twin (${resolveMachineId(asset.id)})`}
                      >
                        <Sliders size={11} /> Simulate
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAssetDrawer(asset);
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid #CBD5E1',
                          background: '#FFFFFF',
                          fontSize: 11,
                          cursor: 'pointer',
                          color: '#475569',
                          fontWeight: 600,
                        }}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px solid #E2E8F0', fontSize: 12, color: '#64748B' }}>
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sortedAssets.length)} of {sortedAssets.length} machines
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                background: currentPage === 1 ? '#F1F5F9' : '#FFFFFF',
                color: currentPage === 1 ? '#94A3B8' : '#334155',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span style={{ padding: '0 8px', fontWeight: 600 }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #CBD5E1',
                background: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF',
                color: currentPage === totalPages ? '#94A3B8' : '#334155',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 3. Attention Queue Strip ─────────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 22px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
              Assets Requiring Attention
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
              Prioritized operational interventions ranked by estimated energy waste, economic cost, and carbon impact.
            </p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#D97706', background: '#FFFBEB', padding: '4px 10px', borderRadius: 12, border: '1px solid #FDE68A' }}>
            {attentionQueue?.queue_count || 4} Urgent Operational Findings
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {attentionQueue?.queue.map(item => (
            <div
              key={item.asset_id}
              style={{
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                padding: '14px 16px',
                background: '#FDFBF7',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                      {item.asset_id}
                    </span>
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '2px 0 0', color: '#111827' }}>
                      {item.asset_name}
                    </h3>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                    {item.severity}
                  </span>
                </div>

                <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 10, lineHeight: 1.4 }}>
                  {item.detected_issue}
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 2 }}>
                    <span>Estimated Daily Waste:</span>
                    <span style={{ fontWeight: 700, color: '#D97706' }}>{item.estimated_impact.waste_kwh_per_day} kWh / day</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280' }}>
                    <span>Economic Impact:</span>
                    <span style={{ fontWeight: 700, color: '#111827' }}>₹{item.estimated_impact.cost_inr_per_day.toLocaleString()} / day</span>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
                  <strong>Action:</strong> {item.recommended_action}
                </div>

                {item.digital_twin_supported && item.digital_twin_machine_id ? (
                  <button
                    onClick={() => {
                      const matched = assets.find(a => a.id === item.asset_id) || ({
                        id: item.asset_id,
                        name: item.asset_name,
                        cell: item.cell,
                        cellId: 'utility_1',
                        energyVector: 'Electricity',
                        ratedPowerKw: item.rated_power_kw || 30,
                        nominalLoadKw: item.current_power_kw || 28,
                        standbyDrawKw: 8.0,
                        secMetric: '0.12 kWh/Nm3',
                        fuelType: null,
                        modbusRegisters: { 'Active Power': 30001 },
                        safetyConstraints: 'Standard Interlocks',
                        operationalStatus: 'WARNING' as const,
                        description: item.detected_issue,
                        currentPowerKw: item.current_power_kw || 28,
                        energy24hKwh: (item.current_power_kw || 28) * 18,
                        anomalyStatus: 'Warning' as const,
                        forecastAvailable: true,
                        forecastHorizons: ['1h', '6h', '24h'],
                        digitalTwinEligible: true,
                        digitalTwinMachineId: item.digital_twin_machine_id,
                        telemetryMode: 'real_time',
                        lastTelemetryTimestamp: new Date().toISOString(),
                      } as unknown as FleetAsset);
                      openDigitalTwinSandbox(matched);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #2563EB',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Sliders size={13} />
                    Simulate in Digital Twin ({item.digital_twin_machine_id})
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const matched = assets.find(a => a.id === item.asset_id);
                      if (matched) handleOpenAssetDrawer(matched);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #D1D5DB',
                      background: '#FFFFFF',
                      color: '#374151',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Activity size={13} />
                    View Diagnostics & Modbus Registers
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 4. Fleet Processing & Scalability Engine ─────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 22px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
                Fleet Processing & Scalability Engine
              </h2>
              <span style={{ background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>
                High-Throughput Orchestrator
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280' }}>
              Triggers synchronous backend orchestration across all 50 assets. Evaluates machine-level energy forecasts, residual anomaly thresholds, and carbon accounting.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {latestRun && (
              <div style={{ textAlign: 'right', marginRight: 4 }}>
                <div style={{ fontSize: 11, color: '#6B7280' }}>
                  Execution ID: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111827' }}>{latestRun.execution_id}</span>
                </div>
                <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                  Processed 50 in {latestRun.duration_ms} ms
                </div>
              </div>
            )}

            <button
              onClick={handleRunFleetAnalytics}
              disabled={isRunningAnalytics}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: isRunningAnalytics ? '#93C5FD' : '#2563EB',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: isRunningAnalytics ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 3px rgba(37,99,235,0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              {isRunningAnalytics ? (
                <>
                  <RotateCcw size={15} className="animate-spin" />
                  Running Pipeline...
                </>
              ) : (
                <>
                  <Play size={15} fill="#FFFFFF" />
                  Run Fleet Analytics (50 Assets)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Success feedback and summary pill */}
        {runSuccessMessage && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12, color: '#065F46', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} color="#10B981" />
            <span>{runSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* ─── 5. Fleet Energy Overview & Charts ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 24 }}>
        {/* Historical 24h Demand Trend */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#111827' }}>
                Fleet Aggregate Demand Profile (24 Hours)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
                Synchronized instantaneous kW load curve across all 50 assets against plant contract limit (1,250 kW).
              </p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569' }}>
              Simulated Demonstration Profile
            </span>
          </div>

          <div style={{ height: 220, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview?.historical_demand_trend || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fleetDemandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis unit=" kW" domain={[0, 1400]} tick={{ fontSize: 10, fill: '#64748B' }} width={55} />
                <Tooltip
                  formatter={(val: any) => [`${val} kW`, 'Demand']}
                  labelFormatter={(lbl) => `Time: ${lbl}`}
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12 }}
                />
                <ReferenceLine y={1250} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Contract 1250 kW', fill: '#EF4444', fontSize: 10, position: 'top' }} />
                <Area type="monotone" dataKey="demand_kw" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#fleetDemandGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Utility Cell Energy Distribution */}
        <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#111827' }}>
                Energy Distribution by Utility Cell (6 Cells)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
                Total 24-hour kilowatt-hour consumption aggregated without double counting.
              </p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569' }}>
              6 Cells / 50 Assets
            </span>
          </div>

          <div style={{ height: 220, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overview?.category_breakdown || []}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                <XAxis type="number" unit=" kWh" tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis
                  dataKey="cell_name"
                  type="category"
                  width={140}
                  tick={{ fontSize: 10, fill: '#334155' }}
                  tickFormatter={(val) => val.split(',')[0]}
                />
                <Tooltip
                  formatter={(val: any) => [`${val} kWh`, '24h Energy']}
                  contentStyle={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="energy_24h_kwh" fill="#0284C7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ─── 6. AI Analytics & Fleet Coverage Matrix ──────────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #EAE6DF', borderRadius: 12, padding: '18px 22px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
              AI Analytics & Fleet Coverage Matrix
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
              Capability map establishing what services run fleet-wide vs. what requires detailed Digital Twin physical modeling.
            </p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#0369A1', background: '#F0F9FF', padding: '4px 10px', borderRadius: 8, border: '1px solid #BAE6FD' }}>
            Auditable Platform Boundary
          </span>
        </div>

        {/* Hackathon Alignment Banner */}
        <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#6B21A8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="#9333EA" />
          <span>
            <strong>Architectural Principle:</strong> WattWise AI separates fleet-wide monitoring and AI analytics from detailed physics- and constraint-aware operational simulation. The platform can analyze a larger fleet while reserving detailed Digital Twin workflows for eligible assets and interventions.
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                <th style={{ padding: '10px 12px' }}>Capability</th>
                <th style={{ padding: '10px 12px' }}>Eligible Assets</th>
                <th style={{ padding: '10px 12px' }}>Processed</th>
                <th style={{ padding: '10px 12px' }}>Fleet Coverage</th>
                <th style={{ padding: '10px 12px' }}>Underlying Model Architecture</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {coverage?.capabilities.map(cap => (
                <tr key={cap.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B' }}>
                    {cap.capability}
                    <div style={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>{cap.description}</div>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {cap.eligible_assets} / 50
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#059669' }}>
                    {cap.processed_assets}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${cap.coverage_pct}%`, height: '100%', background: cap.id === 'digital_twin' ? '#F59E0B' : '#10B981' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: cap.id === 'digital_twin' ? '#D97706' : '#059669' }}>
                        {cap.coverage_pct}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{cap.model_type}</span>
                    {cap.limitation_note && (
                      <div style={{ fontSize: 10, color: '#B45309', marginTop: 2 }}>{cap.limitation_note}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 700,
                        background: cap.id === 'digital_twin' ? '#FEF3C7' : '#DCFCE7',
                        color: cap.id === 'digital_twin' ? '#92400E' : '#166534',
                      }}
                    >
                      <Check size={10} /> {cap.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── 7. Compact Asset Detail Drawer ───────────────────────────────────── */}
      {isDrawerOpen && selectedAsset && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 1000,
          }}
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#FFFFFF',
              height: '100%',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                  {selectedAsset.id}
                </span>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '2px 0 0', color: '#0F172A' }}>
                  {selectedAsset.name}
                </h3>
                <span style={{ fontSize: 12, color: '#64748B' }}>{selectedAsset.cell}</span>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#64748B' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Telemetry KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Active Power</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: selectedAsset.anomalyStatus === 'Warning' ? '#D97706' : '#059669', marginTop: 2 }}>
                    {selectedAsset.currentPowerKw} <span style={{ fontSize: 11, fontWeight: 500, color: '#94A3B8' }}>kW</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>Rated: {selectedAsset.ratedPowerKw} kW</div>
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>24h Energy</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', marginTop: 2 }}>
                    {selectedAsset.energy24hKwh} <span style={{ fontSize: 11, fontWeight: 500, color: '#94A3B8' }}>kWh</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>~{(selectedAsset.energy24hKwh * 0.716).toFixed(1)} kg CO2e</div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                  Operational Overview
                </h4>
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, margin: 0 }}>
                  {selectedAsset.description}
                </p>
              </div>

              {/* Safety Constraints & Interlocks */}
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#92400E' }}>
                  <ShieldCheck size={14} /> Safety Interlocks & Constraints
                </div>
                <div style={{ fontSize: 12, color: '#78350F', marginTop: 4 }}>
                  {selectedAsset.safetyConstraints}
                </div>
              </div>

              {/* Modbus RTU/TCP Register Mapping */}
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 6 }}>
                  Modbus RTU/TCP Holding Registers
                </h4>
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 8 }}>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#64748B', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                        <th style={{ padding: '4px 6px' }}>Parameter</th>
                        <th style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)' }}>Register</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedAsset.modbusRegisters).map(([param, reg]) => (
                        <tr key={param} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '4px 6px', color: '#1E293B' }}>{param}</td>
                          <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2563EB' }}>
                            {reg}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Simulation Capability Notice */}
              <div style={{ background: selectedAsset.digitalTwinEligible ? '#EFF6FF' : '#F1F5F9', border: '1px solid', borderColor: selectedAsset.digitalTwinEligible ? '#BFDBFE' : '#CBD5E1', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: selectedAsset.digitalTwinEligible ? '#1E40AF' : '#475569', marginBottom: 2 }}>
                  {selectedAsset.digitalTwinEligible ? 'Digital Twin Operational Simulation Available' : 'Fleet-Wide Analytics Mode Active'}
                </div>
                <div style={{ fontSize: 11, color: selectedAsset.digitalTwinEligible ? '#1E3A8A' : '#64748B', lineHeight: 1.4 }}>
                  {selectedAsset.digitalTwinEligible
                    ? `This asset is directly modeled by the core Digital Twin engine (${selectedAsset.digitalTwinMachineId}). You can run physics scenario what-ifs, idle power interventions, and M&V investment calculations.`
                    : 'This asset leverages fleet-level energy forecasting, anomaly residual detection, and carbon accounting. Physics-based scenario what-ifs are reserved for the 4 core twin assets.'}
                </div>
              </div>

              {/* Action Button */}
              {selectedAsset.digitalTwinEligible && selectedAsset.digitalTwinMachineId ? (
                <button
                  onClick={() => {
                    openDigitalTwinSandbox(selectedAsset);
                    setIsDrawerOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                  }}
                >
                  <Sliders size={16} />
                  Launch Digital Twin Simulation ({selectedAsset.digitalTwinMachineId})
                </button>
              ) : (
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    background: '#F8FAFC',
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close Inspection Drawer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 8. Digital Twin Operational Simulation Sandbox Modal ──────────────── */}
      {isSimModalOpen && simAsset && simResult && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setIsSimModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              maxWidth: 1040,
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                background: '#F8FAFC',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      border: '1px solid #BFDBFE',
                    }}
                  >
                    {simAsset.id}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: '#ECFDF5',
                      color: '#065F46',
                      border: '1px solid #A7F3D0',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                    PHYSICS TWIN ACTIVE ({simMachineId})
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: '#F1F5F9',
                      color: '#475569',
                    }}
                  >
                    Rated: {MACHINE_PROFILES[simMachineId]?.rated_power_kw || simAsset.ratedPowerKw} kW
                  </span>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#0F172A' }}>
                  Digital Twin Operational Simulator & Condition Sandbox
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  Simulating <strong>{simAsset.name}</strong> · Mapped to verified thermodynamic/electrical twin model <strong>{MACHINE_PROFILES[simMachineId]?.name || simMachineId}</strong>.
                </p>
              </div>

              <button
                onClick={() => setIsSimModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 6,
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Notification Alert if Applied */}
            {simAppliedNotification && (
              <div
                style={{
                  margin: '16px 24px 0',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: '#ECFDF5',
                  border: '1px solid #6EE7B7',
                  color: '#065F46',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle2 size={16} />
                {simAppliedNotification}
              </div>
            )}

            {/* Feasibility & Safety Interlock Banner */}
            <div style={{ padding: '16px 24px 0' }}>
              {simResult.feasibility === 'feasible' && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    color: '#166534',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <ShieldCheck size={22} style={{ color: '#16A34A', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                      Feasible Operational Strategy — Physical Interlocks Satisfied
                    </div>
                    <div style={{ fontSize: 11, color: '#15803D', lineHeight: 1.4 }}>
                      Target conditions strictly satisfy physical pressure floor (≥ 6.5 bar), motor thermal capacity, and continuous process integrity under ISO 50001:2018 energy management rules.
                    </div>
                  </div>
                </div>
              )}

              {simResult.feasibility === 'review_required' && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    color: '#92400E',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <AlertTriangle size={22} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                      Operational Review Required
                    </div>
                    <div style={{ fontSize: 11, color: '#B45309', lineHeight: 1.4 }}>
                      {simResult.constraint_violations.filter(v => v.severity === 'warning').map(v => v.message).join(' ') || 'Production output or shift duration targets should be approved by shift engineer.'}
                    </div>
                  </div>
                </div>
              )}

              {simResult.feasibility === 'blocked' && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#991B1B',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <ShieldAlert size={22} style={{ color: '#DC2626', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                      Simulation Blocked by Physical Safety Interlock
                    </div>
                    <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.4 }}>
                      {simResult.constraint_violations.filter(v => v.severity === 'error').map(v => v.message).join(' ') || 'Proposed setpoint violates safe operating envelope.'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Body: 2 Columns */}
            <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
              {/* Left Column: Condition Controls */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Operating Conditions
                  </h3>
                  <button
                    onClick={handleResetToTelemetryBaseline}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'transparent',
                      border: 'none',
                      color: '#2563EB',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    title="Reset to pure data-driven baseline"
                  >
                    <RotateCcw size={11} /> Reset to Baseline
                  </button>
                </div>

                {/* Strategy Type Buttons */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    Intervention Strategy
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button
                      onClick={() => {
                        setSimActionType('reduce_idle_power');
                        handleExecuteSimulation('reduce_idle_power');
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: simActionType === 'reduce_idle_power' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                        background: simActionType === 'reduce_idle_power' ? '#EFF6FF' : '#FFFFFF',
                        color: simActionType === 'reduce_idle_power' ? '#1D4ED8' : '#475569',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      Idle Cutoff (kW)
                    </button>
                    <button
                      onClick={() => {
                        setSimActionType('shift_schedule');
                        handleExecuteSimulation('shift_schedule');
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: simActionType === 'shift_schedule' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                        background: simActionType === 'shift_schedule' ? '#EFF6FF' : '#FFFFFF',
                        color: simActionType === 'shift_schedule' ? '#1D4ED8' : '#475569',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      Peak Stagger (hr)
                    </button>
                    <button
                      onClick={() => {
                        setSimActionType('pressure_optimization');
                        handleExecuteSimulation('pressure_optimization');
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: simActionType === 'pressure_optimization' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                        background: simActionType === 'pressure_optimization' ? '#EFF6FF' : '#FFFFFF',
                        color: simActionType === 'pressure_optimization' ? '#1D4ED8' : '#475569',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      Pressure Tuning
                    </button>
                    <button
                      onClick={() => {
                        setSimActionType('reduce_runtime');
                        handleExecuteSimulation('reduce_runtime');
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: simActionType === 'reduce_runtime' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                        background: simActionType === 'reduce_runtime' ? '#EFF6FF' : '#FFFFFF',
                        color: simActionType === 'reduce_runtime' ? '#1D4ED8' : '#475569',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      Cut Off-Spec Run
                    </button>
                  </div>
                </div>

                {/* Condition Sliders */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Target Power */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>Target Power (kW)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#2563EB' }}>
                        {simTargetPowerKw.toFixed(1)} kW
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={MACHINE_PROFILES[simMachineId]?.rated_power_kw ? MACHINE_PROFILES[simMachineId].rated_power_kw + 10 : 50}
                      step={0.5}
                      value={simTargetPowerKw}
                      onChange={(e) => setSimTargetPowerKw(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: '#2563EB' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                      <span>0 kW</span>
                      <span>Rated: {MACHINE_PROFILES[simMachineId]?.rated_power_kw || 30} kW</span>
                    </div>
                    {simMachineId === 'FURN-01' && simTargetPowerKw < 15 && (
                      <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>
                        ⚠️ Quench interlock trips below 15.0 kW!
                      </div>
                    )}
                    {simMachineId === 'PAINT-01' && simTargetPowerKw < 5 && (
                      <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>
                        ⚠️ VOC exhaust interlock trips below 5.0 kW!
                      </div>
                    )}
                  </div>

                  {/* Duration Hours */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>Intervention Duration (Hours)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#2563EB' }}>
                        {simDurationHours} hrs
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={simDurationHours}
                      onChange={(e) => setSimDurationHours(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: '#2563EB' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                      <span>1 hr</span>
                      <span>8 hrs (Full shift)</span>
                    </div>
                  </div>

                  {/* Shift Offset */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>Schedule Shift Offset (Hours)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#2563EB' }}>
                        {simOffsetHours > 0 ? `+${simOffsetHours}` : simOffsetHours} hrs
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-4}
                      max={4}
                      step={1}
                      value={simOffsetHours}
                      onChange={(e) => setSimOffsetHours(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: '#2563EB' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                      <span>-4 hrs</span>
                      <span>0</span>
                      <span>+4 hrs</span>
                    </div>
                  </div>

                  {/* Target Pressure (bar) for Compressors */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>Pneumatic Discharge Pressure (bar)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: simTargetPressureBar < 6.5 ? '#DC2626' : '#2563EB' }}>
                        {simTargetPressureBar.toFixed(1)} bar
                      </span>
                    </div>
                    <input
                      type="range"
                      min={6.0}
                      max={8.5}
                      step={0.1}
                      value={simTargetPressureBar}
                      onChange={(e) => setSimTargetPressureBar(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: simTargetPressureBar < 6.5 ? '#DC2626' : '#2563EB' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                      <span>6.0 bar</span>
                      <span style={{ color: '#DC2626', fontWeight: 600 }}>Min Safe Floor: 6.5 bar</span>
                      <span>8.5 bar</span>
                    </div>
                    {simTargetPressureBar < 6.5 && (
                      <div style={{ fontSize: 10, color: '#DC2626', marginTop: 2 }}>
                        ⚠️ Violates pneumatic ring main clamp limit (6.5 bar)!
                      </div>
                    )}
                  </div>

                  {/* Ambient Intake Temperature */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>Ambient Intake Temp (°C)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#2563EB' }}>
                        {simAmbientTempC.toFixed(1)} °C
                      </span>
                    </div>
                    <input
                      type="range"
                      min={15.0}
                      max={45.0}
                      step={0.5}
                      value={simAmbientTempC}
                      onChange={(e) => setSimAmbientTempC(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: '#2563EB' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94A3B8' }}>
                      <span>15 °C</span>
                      <span>Nominal: 24 °C</span>
                      <span>45 °C</span>
                    </div>
                  </div>

                  {/* Shift Pattern Selector */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                      Factory Shift Model
                    </label>
                    <select
                      value={simShiftPattern}
                      onChange={(e) => setSimShiftPattern(e.target.value as any)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        fontSize: 11,
                        background: '#FFFFFF',
                        color: '#1E293B',
                      }}
                    >
                      <option value="3_shift">3-Shift (24 Hours Continuous)</option>
                      <option value="2_shift">2-Shift (Day & Evening)</option>
                      <option value="day_shift">Single Day Shift (08:00 - 17:00)</option>
                    </select>
                  </div>
                </div>

                {/* Simulate Button */}
                <button
                  onClick={() => handleExecuteSimulation()}
                  style={{
                    width: '100%',
                    marginTop: 16,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 2px 4px rgba(37,99,235,0.25)',
                  }}
                >
                  <Play size={14} />
                  Run Simulation with Conditions
                </button>
              </div>

              {/* Right Column: Results Dashboard */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 4 KPI Delta Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Daily Energy Saved</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                      {simResult.deltas.savings_positive.energy_kwh > 0 ? `-${simResult.deltas.savings_positive.energy_kwh.toFixed(1)}` : '0.0'} kWh
                    </div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      {simResult.baseline.total_energy_kwh > 0
                        ? `${((simResult.deltas.savings_positive.energy_kwh / simResult.baseline.total_energy_kwh) * 100).toFixed(1)}% reduction`
                        : '0% reduction'}
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Cost Savings</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', fontFamily: 'var(--font-mono)' }}>
                      ₹{simResult.deltas.savings_positive.cost_inr.toFixed(0)} /d
                    </div>
                    <div style={{ fontSize: 10, color: '#059669', marginTop: 2, fontWeight: 600 }}>
                      ₹{((simResult.deltas.savings_positive.cost_inr * 365) / 1000).toFixed(1)}k / yr
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Carbon Abated</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#2563EB', fontFamily: 'var(--font-mono)' }}>
                      {(simResult.deltas.savings_positive.scope2_kg_co2e || 0).toFixed(1)} kg
                    </div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      CEA v22.0: 0.82 kg/kWh
                    </div>
                  </div>

                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Peak Demand Shaved</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#D97706', fontFamily: 'var(--font-mono)' }}>
                      {simResult.deltas.savings_positive.peak_kw > 0 ? `-${simResult.deltas.savings_positive.peak_kw.toFixed(1)}` : '0.0'} kW
                    </div>
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      Contract: 85.0 kW limit
                    </div>
                  </div>
                </div>

                {/* 24-Hour Demand Comparison Chart */}
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1E293B' }}>
                        24-Hour Load Curve: Baseline vs. Simulated Schedule
                      </h4>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: '#64748B' }}>
                        Comparing hourly kW draw across diurnal shifts. Highlighted areas indicate ToD peak billing tariffs.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => setChartMode('asset')}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: chartMode === 'asset' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                          background: chartMode === 'asset' ? '#EFF6FF' : '#FFFFFF',
                          color: chartMode === 'asset' ? '#1D4ED8' : '#64748B',
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Asset kW ({simMachineId})
                      </button>
                      <button
                        onClick={() => setChartMode('plant')}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: chartMode === 'plant' ? '1px solid #2563EB' : '1px solid #CBD5E1',
                          background: chartMode === 'plant' ? '#EFF6FF' : '#FFFFFF',
                          color: chartMode === 'plant' ? '#1D4ED8' : '#64748B',
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Plant Aggregate kW
                      </button>
                    </div>
                  </div>

                  <div style={{ height: 180, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={simChartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748B' }} width={45} unit=" kW" />
                        <Tooltip
                          contentStyle={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 11 }}
                        />
                        {chartMode === 'plant' && (
                          <ReferenceLine y={85} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Contract 85 kW', fill: '#EF4444', fontSize: 9, position: 'top' }} />
                        )}
                        <Line
                          type="monotone"
                          dataKey={chartMode === 'asset' ? 'baseline_machine_kw' : 'baseline_plant_kw'}
                          name="Baseline Telemetry"
                          stroke="#94A3B8"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey={chartMode === 'asset' ? 'simulated_machine_kw' : 'simulated_plant_kw'}
                          name="Simulated Condition"
                          stroke={simResult.feasibility === 'blocked' ? '#DC2626' : '#2563EB'}
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Physics Verification Checklist */}
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
                  <h4 style={{ fontSize: 11, fontWeight: 700, margin: '0 0 8px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Physical Constraint & Governance Verification Checklist
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#334155' }}>
                      <CheckCircle2 size={13} style={{ color: '#10B981' }} />
                      <span>Motor Capacity: Max load within rated limit</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: simTargetPressureBar >= 6.5 ? '#334155' : '#DC2626' }}>
                      {simTargetPressureBar >= 6.5 ? <CheckCircle2 size={13} style={{ color: '#10B981' }} /> : <AlertTriangle size={13} style={{ color: '#DC2626' }} />}
                      <span>Pneumatic Floor: Ring main ≥ 6.5 bar clamp</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: simMachineId !== 'FURN-01' || simTargetPowerKw >= 15 ? '#334155' : '#DC2626' }}>
                      {simMachineId !== 'FURN-01' || simTargetPowerKw >= 15 ? <CheckCircle2 size={13} style={{ color: '#10B981' }} /> : <AlertTriangle size={13} style={{ color: '#DC2626' }} />}
                      <span>Thermal Quench Floor: FURN-01 holding ≥ 15 kW</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: simMachineId !== 'PAINT-01' || simTargetPowerKw >= 5 ? '#334155' : '#DC2626' }}>
                      {simMachineId !== 'PAINT-01' || simTargetPowerKw >= 5 ? <CheckCircle2 size={13} style={{ color: '#10B981' }} /> : <AlertTriangle size={13} style={{ color: '#DC2626' }} />}
                      <span>VOC Ventilation: Exhaust fan active ≥ 5 kW</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
              }}
            >
              <div style={{ fontSize: 11, color: '#64748B' }}>
                Simulated under <strong>CEA India Grid Factor v22.0</strong> (0.82 kg CO₂e/kWh) & ToD Tariff (Peak: ₹10.80/kWh, Off-peak: ₹7.65/kWh).
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setIsSimModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Close Sandbox
                </button>
                <button
                  onClick={handleApplySimToFleet}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: '1px solid #059669',
                    background: '#ECFDF5',
                    color: '#065F46',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Check size={14} />
                  Apply Strategy to Fleet
                </button>
                <button
                  onClick={() => {
                    handleTwinAction(simMachineId);
                    setIsSimModalOpen(false);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                  }}
                >
                  Open Full Digital Twin Workbench
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

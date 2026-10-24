import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp, Activity, Cpu, RefreshCw, AlertTriangle,
  Clock, ChevronDown, ChevronRight, Database,
  Sparkles, CheckCircle2, Sliders, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend
} from 'recharts';
import type { Asset, SimParams } from '../../data/mockData';
import {
  fetchMachineForecast,
  fetchForecastMetadata,
  getOfflineFallbackForecast,
  mapAssetToForecastRequest,
  type EnergyForecastResponse,
  type ForecastModelMetadata,
} from '../../services/forecastApi';
import { MachineForecastIntervalChart, type ForecastIntervalPoint } from '../Charts';

interface EnergyForecastDashboardProps {
  assets: Asset[];
  params: SimParams;
  onNavigateToSimulator?: () => void;
  onSelectAsset?: (id: string) => void;
}

type ForecastViewMode = 'all' | 'compressor' | 'cnc' | 'furnace' | 'cooling';

const MONO = "'IBM Plex Mono','Courier New',monospace";
const TICK = { fill: '#64748b', fontSize: 10, fontFamily: MONO };

const MACHINE_CONFIGS: Record<string, { name: string; color: string; taxonomy: string; bay: string; model: string }> = {
  compressor: {
    name: 'Air Compressor',
    color: '#d97706', // warm amber
    taxonomy: 'AIR_COMPRESSOR',
    bay: 'Bay A-1 (Pneumatics)',
    model: 'ELGi EN 45 Screw Compressor',
  },
  cnc: {
    name: 'CNC Machining Center',
    color: '#0284c7', // calm blue
    taxonomy: 'CNC_MILL',
    bay: 'Bay B-2 (Machining)',
    model: 'DMG MORI NLX-2500 5-Axis',
  },
  furnace: {
    name: 'Industrial Heat Furnace',
    color: '#e11d48', // rose red
    taxonomy: 'OVEN_FURNACE',
    bay: 'Bay C-1 (Thermal)',
    model: 'Thermic Intl IF-85',
  },
  cooling: {
    name: 'Chilled Water Cooling',
    color: '#059669', // serene emerald
    taxonomy: 'PUMP',
    bay: 'Bay D-3 (Hydronics)',
    model: 'Carrier AquaForce 30XW',
  },
};

export default function EnergyForecastDashboard({
  assets,
  params,
  onNavigateToSimulator,
  onSelectAsset,
}: EnergyForecastDashboardProps) {
  // ─── Mode Selection (Default: Overall Plant) ─────────────────────────────────
  const [selectedMode, setSelectedMode] = useState<ForecastViewMode>('all');

  // ─── Digital Twin Simulation Clock Sync (Ticks every 1s) ────────────────────
  const [simClock, setSimClock] = useState<Date>(new Date());
  useEffect(() => {
    const clockTimer = setInterval(() => setSimClock(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // ─── Forecast State per Machine ─────────────────────────────────────────────
  const [forecasts, setForecasts] = useState<Record<string, EnergyForecastResponse | null>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [isFallbackMap, setIsFallbackMap] = useState<Record<string, boolean>>({});
  const [backendConnected, setBackendConnected] = useState<boolean>(true);

  // ─── Collapsible Technical Drawers (Collapsed by Default) ───────────────────
  const [metadata, setMetadata] = useState<ForecastModelMetadata | null>(null);
  const [showModelInfo, setShowModelInfo] = useState<boolean>(false);
  const [showDataQuality, setShowDataQuality] = useState<boolean>(false);

  // Counter to cancel stale responses and prevent race conditions
  const activeRequestIdRef = useRef<number>(0);

  // Load Model Metadata on mount
  useEffect(() => {
    let isMounted = true;
    fetchForecastMetadata()
      .then((meta) => {
        if (isMounted) setMetadata(meta);
      })
      .catch((err) => {
        console.warn('Could not load forecast metadata from backend:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // ─── Format Exact 15-Minute Target Interval Window ─────────────────────────
  const getIntervalString = useCallback((fc: EnergyForecastResponse | null) => {
    if (fc?.target_interval_start && fc?.target_interval_end) {
      try {
        const start = new Date(fc.target_interval_start);
        const end = new Date(fc.target_interval_end);
        const s = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const e = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${s} → ${e}`;
      } catch {
        // fallback to text slice
      }
    }
    const start = simClock;
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    const s = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const e = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${s} → ${e}`;
  }, [simClock]);

  // ─── Fetch Forecast for a Single Machine ───────────────────────────────────
  const fetchSingleForecast = useCallback(async (asset: Asset, reqId: number) => {
    setLoadingStates((prev) => ({ ...prev, [asset.id]: true }));
    setErrors((prev) => ({ ...prev, [asset.id]: null }));

    const req = mapAssetToForecastRequest(asset);

    try {
      const res = await fetchMachineForecast(req);
      if (reqId === activeRequestIdRef.current) {
        setForecasts((prev) => ({ ...prev, [asset.id]: res }));
        setIsFallbackMap((prev) => ({ ...prev, [asset.id]: false }));
        setBackendConnected(true);
        setErrors((prev) => ({ ...prev, [asset.id]: null }));
      }
    } catch (err: any) {
      console.warn(`Forecast fetch failed for machine ${asset.id}:`, err);
      if (reqId === activeRequestIdRef.current) {
        // Fallback demo prediction with explicit flagging
        const fallback = getOfflineFallbackForecast(req);
        setForecasts((prev) => ({ ...prev, [asset.id]: fallback }));
        setIsFallbackMap((prev) => ({ ...prev, [asset.id]: true }));
        setBackendConnected(false);
        setErrors((prev) => ({
          ...prev,
          [asset.id]: err.message || 'FastAPI backend unavailable. Using offline persistence model.',
        }));
      }
    } finally {
      if (reqId === activeRequestIdRef.current) {
        setLoadingStates((prev) => ({ ...prev, [asset.id]: false }));
      }
    }
  }, []);

  // ─── Refresh All Four Forecasts (Debounced on simulatedAssets changes) ──────
  const refreshAllForecasts = useCallback(() => {
    const nextReqId = ++activeRequestIdRef.current;
    assets.forEach((asset) => {
      fetchSingleForecast(asset, nextReqId);
    });
  }, [assets, fetchSingleForecast]);

  // Trigger forecast refresh when digital twin assets or parameters change
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshAllForecasts();
    }, 250);
    return () => clearTimeout(timer);
  }, [assets, refreshAllForecasts]);

  // ─── Fleet Aggregations ─────────────────────────────────────────────────────
  const fleetSummary = useMemo(() => {
    let totalCurrentKw = 0;
    let totalPredicted15mKwh = 0;
    let totalEquivPredictedKw = 0;
    let validForecastCount = 0;
    let fallbackCount = 0;
    let targetInterval = getIntervalString(null);

    assets.forEach((a) => {
      totalCurrentKw += a.currentKw;
      const fc = forecasts[a.id];
      if (fc) {
        totalPredicted15mKwh += fc.predicted_next_15min_energy_kwh;
        totalEquivPredictedKw += fc.equivalent_average_power_kw;
        validForecastCount++;
        if (isFallbackMap[a.id]) fallbackCount++;
        targetInterval = getIntervalString(fc);
      }
    });

    const totalReference15mEnergyKwh = +(totalCurrentKw * 0.25).toFixed(3);
    const totalDeltaKwh = +(totalPredicted15mKwh - totalReference15mEnergyKwh).toFixed(3);

    return {
      totalCurrentKw: +totalCurrentKw.toFixed(1),
      totalReference15mEnergyKwh,
      totalPredicted15mKwh: +totalPredicted15mKwh.toFixed(3),
      totalEquivPredictedKw: +totalEquivPredictedKw.toFixed(2),
      totalDeltaKwh,
      validForecastCount,
      totalMachines: assets.length,
      fallbackCount,
      targetInterval,
      isPartial: validForecastCount > 0 && validForecastCount < assets.length,
    };
  }, [assets, forecasts, isFallbackMap, getIntervalString]);

  // ─── Contribution Breakdown Chart Data for Overall Plant View ───────────────
  const fleetContributionData = useMemo(() => {
    return assets.map((a) => {
      const fc = forecasts[a.id];
      const cfg = MACHINE_CONFIGS[a.id] || { name: a.name, color: '#64748b' };
      const predKwh = fc ? fc.predicted_next_15min_energy_kwh : 0;
      const refKwh = +(a.currentKw * 0.25).toFixed(3);
      return {
        id: a.id,
        name: cfg.name,
        predictedKwh: predKwh,
        referenceKwh: refKwh,
        color: cfg.color,
      };
    });
  }, [assets, forecasts]);

  const anyWhatIfActive = params.autoIdleCutoff || params.pressureSetpoint < 7.5 || params.staggerFurnace;
  const isGlobalLoading = Object.values(loadingStates).some(Boolean);

  // Selected Machine Context
  const selectedAsset = useMemo(() => {
    if (selectedMode === 'all') return null;
    return assets.find((a) => a.id === selectedMode) || null;
  }, [assets, selectedMode]);

  const selectedForecast = useMemo(() => {
    if (!selectedAsset) return null;
    return forecasts[selectedAsset.id] || null;
  }, [forecasts, selectedAsset]);

  return (
    <div
      style={{
        background: '#f8fafc',
        minHeight: '100%',
        padding: '32px 36px 80px',
        maxWidth: 1200,
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
        color: '#0f172a',
      }}
    >
      {/* ─── Top Header & Controls ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(109, 40, 217, 0.08)',
                color: '#6d28d9',
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                fontFamily: MONO,
              }}
            >
              <Sparkles size={11} /> Industrial EMS
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Next 15-Minute Tactical Energy Forecasting
            </span>
          </div>

          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: -0.6,
              margin: '0 0 4px',
            }}
          >
            Energy Forecast Dashboard
          </h1>

          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Next-interval power requirements for precision equipment bays using trained gradient boosting inference.
          </p>
        </div>

        {/* Action Controls: Dropdown & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {anyWhatIfActive && onNavigateToSimulator && (
            <button
              onClick={onNavigateToSimulator}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: '#1d4ed8',
                cursor: 'pointer',
              }}
            >
              <Sliders size={13} />
              <span>Digital Twin Scenario Active</span>
            </button>
          )}

          {/* Machine Selection Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label
              htmlFor="forecast-view-select"
              style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              Forecast View:
            </label>
            <select
              id="forecast-view-select"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value as ForecastViewMode)}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              }}
            >
              <option value="all">Overall Plant</option>
              <option value="compressor">Air Compressor</option>
              <option value="cnc">CNC Machining Center</option>
              <option value="furnace">Industrial Heat Furnace</option>
              <option value="cooling">Chilled Water Cooling</option>
            </select>
          </div>

          {/* Secondary Refresh Button */}
          <button
            onClick={refreshAllForecasts}
            title="Refresh machine forecasts"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            }}
          >
            <RefreshCw size={13} className={isGlobalLoading ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ─── Main Content View (Overall Plant vs Single Machine) ────────────── */}
      <AnimatePresence mode="wait">
        {selectedMode === 'all' ? (
          /* ================================================================= */
          /* OVERALL PLANT VIEW                                               */
          /* ================================================================= */
          <motion.div
            key="overall-plant"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {/* Main Forecast Hero Card */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '28px 32px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#6d28d9',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Overall Plant Energy Forecast (Next 15 Minutes)
                  </span>
                </div>

                {/* API Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: MONO }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: backendConnected ? '#10b981' : '#f59e0b',
                    }}
                  />
                  <span style={{ color: backendConnected ? '#059669' : '#d97706', fontWeight: 600 }}>
                    {backendConnected ? 'Live API Forecast' : 'Offline Persistence Fallback'}
                  </span>
                </div>
              </div>

              {/* Main Metric & Equivalent Load */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <span
                  style={{
                    fontSize: 48,
                    fontWeight: 800,
                    color: '#0f172a',
                    fontFamily: MONO,
                    letterSpacing: -1.5,
                    lineHeight: 1,
                  }}
                >
                  {fleetSummary.totalPredicted15mKwh.toFixed(2)}
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#6d28d9', fontFamily: MONO }}>
                  kWh
                </span>
                <span style={{ fontSize: 14, color: '#64748b', marginLeft: 8 }}>
                  (Equiv. Average Load: <strong style={{ color: '#0f172a' }}>{fleetSummary.totalEquivPredictedKw.toFixed(1)} kW</strong>)
                </span>
              </div>

              {/* Supporting Secondary Metric Strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  paddingTop: 20,
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                    Current Plant Demand
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: MONO }}>
                    {fleetSummary.totalCurrentKw.toFixed(1)} <span style={{ fontSize: 12, color: '#64748b' }}>kW</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Ref load: {fleetSummary.totalReference15mEnergyKwh.toFixed(2)} kWh
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                    Forecast Interval Window
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: MONO }}>
                    {fleetSummary.targetInterval}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Exact 15-minute horizon
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                    Machine Coverage
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: MONO }}>
                    {fleetSummary.validForecastCount} of {fleetSummary.totalMachines} machines
                  </div>
                  <div style={{ fontSize: 11, color: fleetSummary.isPartial ? '#d97706' : '#059669', marginTop: 2 }}>
                    {fleetSummary.isPartial ? 'Partial fleet total' : 'Complete fleet reporting'}
                  </div>
                </div>
              </div>
            </div>

            {/* Compact Energy Contribution Breakdown Chart */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '24px 28px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                marginBottom: 28,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                    Forecast Energy Contribution by Machine
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Predicted next-15-minute energy consumption (kWh) across the four digital-twin assets.
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: MONO, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Total: <strong style={{ color: '#0f172a' }}>{fleetSummary.totalPredicted15mKwh.toFixed(2)} kWh</strong>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={fleetContributionData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK} unit=" kWh" axisLine={false} tickLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            padding: '8px 12px',
                            fontFamily: MONO,
                            fontSize: 11,
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{d.name}</div>
                          <div style={{ color: d.color }}>
                            Predicted: <strong>{d.predictedKwh.toFixed(3)} kWh</strong>
                          </div>
                          <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                            Reference: {d.referenceKwh.toFixed(3)} kWh (P × 0.25h)
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="predictedKwh" radius={[4, 4, 0, 0]} maxBarSize={44}>
                    {fleetContributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        ) : (
          /* ================================================================= */
          /* INDIVIDUAL MACHINE VIEW                                          */
          /* ================================================================= */
          selectedAsset && (
            <motion.div
              key={`machine-${selectedAsset.id}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {(() => {
                const cfg = MACHINE_CONFIGS[selectedAsset.id] || {
                  name: selectedAsset.name,
                  color: '#64748b',
                  taxonomy: 'EQUIPMENT',
                  bay: 'Production Bay',
                  model: selectedAsset.model,
                };
                const fc = selectedForecast;
                const reference15mKwh = +(selectedAsset.currentKw * 0.25).toFixed(4);
                const loadFactorPct = selectedAsset.ratedKw > 0 ? +((selectedAsset.currentKw / selectedAsset.ratedKw) * 100).toFixed(0) : 0;
                const intervalStr = getIntervalString(fc);

                const chartPoints: ForecastIntervalPoint[] = [
                  {
                    label: 'Reference (t)',
                    timeWindow: 'Current draw',
                    energyKwh: reference15mKwh,
                    equivalentKw: selectedAsset.currentKw,
                    isForecast: false,
                    statusLabel: 'CONSTANT-LOAD REFERENCE (P × 0.25h)',
                  },
                  {
                    label: 'Target (t+15m)',
                    timeWindow: intervalStr,
                    energyKwh: fc ? fc.predicted_next_15min_energy_kwh : reference15mKwh,
                    equivalentKw: fc ? fc.equivalent_average_power_kw : selectedAsset.currentKw,
                    isForecast: true,
                    statusLabel: isFallbackMap[selectedAsset.id] ? 'OFFLINE PERSISTENCE' : 'GRADIENT BOOSTED FORECAST',
                  },
                ];

                return (
                  <div>
                    {/* Machine Detail Card */}
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '28px 32px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        marginBottom: 24,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: 16,
                          flexWrap: 'wrap',
                          gap: 12,
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span
                              style={{
                                width: 9,
                                height: 9,
                                borderRadius: '50%',
                                background: cfg.color,
                                display: 'inline-block',
                              }}
                            />
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                              {selectedAsset.name}
                            </h2>
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: MONO,
                                background: '#f1f5f9',
                                color: '#475569',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontWeight: 700,
                              }}
                            >
                              {selectedAsset.id.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#64748b' }}>
                            {cfg.model} • {cfg.bay} • <strong style={{ color: '#0f172a' }}>{selectedAsset.ratedKw} kW</strong> Rated Power
                          </div>
                        </div>

                        {/* Status & Operating State */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: MONO,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: '#f8fafc',
                              color: '#334155',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            State {selectedAsset.currentKw <= 0.05 ? '0 (Off)' : selectedAsset.status === 'IDLE' ? '1 (Idle)' : '2 (Running)'}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: selectedAsset.status === 'OPTIMAL' ? '#ecfdf5' : selectedAsset.status === 'WARNING' ? '#fffbeb' : '#fef2f2',
                              color: selectedAsset.status === 'OPTIMAL' ? '#059669' : selectedAsset.status === 'WARNING' ? '#d97706' : '#e11d48',
                              border: `1px solid ${selectedAsset.status === 'OPTIMAL' ? '#a7f3d0' : selectedAsset.status === 'WARNING' ? '#fde68a' : '#fecdd3'}`,
                            }}
                          >
                            {selectedAsset.status}
                          </span>
                        </div>
                      </div>

                      {/* Primary Predicted Metric */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                        <span
                          style={{
                            fontSize: 44,
                            fontWeight: 800,
                            color: '#0f172a',
                            fontFamily: MONO,
                            letterSpacing: -1.2,
                            lineHeight: 1,
                          }}
                        >
                          {fc ? fc.predicted_next_15min_energy_kwh.toFixed(3) : reference15mKwh.toFixed(3)}
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#6d28d9', fontFamily: MONO }}>
                          kWh
                        </span>
                        <span style={{ fontSize: 14, color: '#64748b', marginLeft: 8 }}>
                          (Equiv. Load: <strong style={{ color: '#0f172a' }}>{fc ? fc.equivalent_average_power_kw.toFixed(2) : selectedAsset.currentKw} kW</strong>)
                        </span>
                      </div>

                      {/* Detail Metrics Strip */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: 16,
                          paddingTop: 20,
                          borderTop: '1px solid #f1f5f9',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                            Current Power Demand
                          </div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', fontFamily: MONO }}>
                            {selectedAsset.currentKw} <span style={{ fontSize: 12, color: '#64748b' }}>kW</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            {loadFactorPct}% of rated capacity
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                            Constant-Load Reference
                          </div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: '#0284c7', fontFamily: MONO }}>
                            {reference15mKwh.toFixed(3)} <span style={{ fontSize: 12, color: '#64748b' }}>kWh</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            P × 0.25h extrapolation
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                            Forecast Interval
                          </div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', fontFamily: MONO }}>
                            {intervalStr}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Next 15-minute window
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                            Capacity Bounds Check
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: fc?.physical_constraint_applied ? '#d97706' : '#059669', marginTop: 3 }}>
                            {fc?.physical_constraint_applied ? 'Clamped (Surge Limit)' : 'Within Physical Capacity'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            ≤ 1.3× nameplate rating
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Small Machine Comparison Chart */}
                    <div
                      style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '24px 28px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        marginBottom: 28,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                            Reference vs Model Forecast Comparison
                          </h3>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            Constant-load reference estimate (P × 0.25h) compared to model predicted interval energy.
                          </div>
                        </div>
                        {fc && (
                          <div
                            style={{
                              fontSize: 11,
                              fontFamily: MONO,
                              color: '#475569',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              padding: '4px 8px',
                              borderRadius: 4,
                            }}
                          >
                            Difference: <strong>{fc.delta_kwh >= 0 ? `+${fc.delta_kwh.toFixed(3)}` : fc.delta_kwh.toFixed(3)} kWh</strong> ({fc.delta_percentage > 0 ? `+${fc.delta_percentage}%` : `${fc.delta_percentage}%`})
                          </div>
                        )}
                      </div>

                      <MachineForecastIntervalChart points={chartPoints} />

                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                        *Notice: Difference relative to static constant-load extrapolation. Does not indicate verified operational energy savings or plant waste.
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* ─── Expandable Technical Sections (Collapsed by Default) ───────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Accordion 1: Model Information */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setShowModelInfo(!showModelInfo)}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={14} color="#6d28d9" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                Model Information & Lineage
              </span>
            </div>
            {showModelInfo ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}
          </button>

          <AnimatePresence>
            {showModelInfo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontFamily: MONO }}>MODEL ARCHITECTURE</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                        HistGradientBoostingRegressor
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Scikit-Learn Pipeline</div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontFamily: MONO }}>TARGET HORIZON</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', marginTop: 2 }}>
                        target_next_15min_energy_kwh
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Upcoming 15-minute interval</div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontFamily: MONO }}>DATASET SHA-256 HASH</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', marginTop: 2, fontFamily: MONO }}>
                        {metadata?.dataset_hash || '06229d9556da29c4'}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>740,748 industrial records</div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontFamily: MONO }}>SYNTHETIC BENCHMARK</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginTop: 2 }}>
                        R² = 0.652 | MAE = 0.940 kWh
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Unseen Fleet R² = 0.617</div>
                    </div>
                  </div>

                  <p style={{ margin: '12px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                    *Notice: Model benchmarked on synthetic industrial energy dataset; factory-specific accuracy has not been established on physical field sub-meters. Unseen machine IDs are handled safely via one-hot encoder zero-encoding.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Accordion 2: Forecast Inputs & Quality */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setShowDataQuality(!showDataQuality)}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={14} color="#0284c7" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                Forecast Inputs & Data Quality (29 Features)
              </span>
            </div>
            {showDataQuality ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}
          </button>

          <AnimatePresence>
            {showDataQuality && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 12, fontSize: 11 }}>
                    <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: 2 }}>
                        Operational Telemetry (Simulated)
                      </div>
                      <div style={{ color: '#475569' }}>
                        Features: power_kw, rated_power_kw, load_factor, operating_state, operating_minutes.
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: 700, color: '#6d28d9', marginBottom: 2 }}>
                        Temporal Signals (Real-Time UTC)
                      </div>
                      <div style={{ color: '#475569' }}>
                        Features: hour, day_of_week, hour_sin/cos, day_sin/cos, is_weekend, shift_pattern.
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: 700, color: '#d97706', marginBottom: 2 }}>
                        Environmental Inputs (Defaults)
                      </div>
                      <div style={{ color: '#475569' }}>
                        Furnace models explicit 840°C; other assets use equipment median (35°C) and factory ambient defaults (27.5°C, 58% RH).
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: 700, color: '#475569', marginBottom: 2 }}>
                        Lag Fallback (Zero-Leakage)
                      </div>
                      <div style={{ color: '#475569' }}>
                        Past lags default to current-interval draw (y_t) due to lack of a FIFO buffer. No future target leakage.
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

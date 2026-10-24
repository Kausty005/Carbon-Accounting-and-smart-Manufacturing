import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp, Activity, Cpu, RefreshCw, AlertTriangle,
  Clock, ChevronDown, ChevronRight, Database,
  Sparkles, CheckCircle2, Sliders, ArrowRight,
  Calendar, BarChart3, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import type { Asset, SimParams } from '../../data/mockData';
import {
  fetchHorizonForecast,
  fetchPlantHorizonForecast,
  fetchForecastMetadata,
  getOfflineFallbackHorizonForecast,
  getOfflineFallbackPlantForecast,
  mapAssetToForecastRequest,
  type ForecastHorizon,
  type HorizonForecastResponse,
  type ForecastModelMetadata,
  type ForecastTimeSeriesPoint,
  type MachineForecastBreakdown,
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
const TICK = { fill: '#78716C', fontSize: 10, fontFamily: MONO };

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

const HORIZON_OPTIONS: Array<{ id: ForecastHorizon; label: string; periodLabel: string; hours: number }> = [
  { id: '15m', label: '15 Minutes', periodLabel: 'Next 15-Minute Window', hours: 0.25 },
  { id: '1d', label: '1 Day', periodLabel: 'Next 24-Hour Horizon', hours: 24.0 },
  { id: '1w', label: '1 Week', periodLabel: 'Next 7-Day Horizon', hours: 168.0 },
];

export default function EnergyForecastDashboard({
  assets,
  params,
  onNavigateToSimulator,
  onSelectAsset,
}: EnergyForecastDashboardProps) {
  // ─── Mode Selection (Default: Overall Plant) ─────────────────────────────────
  const [selectedMode, setSelectedMode] = useState<ForecastViewMode>('all');

  // ─── Horizon Selection (Default: 15 Minutes) ────────────────────────────────
  const [selectedHorizon, setSelectedHorizon] = useState<ForecastHorizon>('15m');

  // ─── Digital Twin Simulation Clock Sync (Ticks every 1s) ────────────────────
  const [simClock, setSimClock] = useState<Date>(new Date());
  useEffect(() => {
    const clockTimer = setInterval(() => setSimClock(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // ─── Multi-Horizon Forecast State ───────────────────────────────────────────
  const [forecastResponse, setForecastResponse] = useState<HorizonForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  // ─── Selected Machine Context ───────────────────────────────────────────────
  const selectedAsset = useMemo(() => {
    if (selectedMode === 'all') return null;
    return assets.find((a) => a.id === selectedMode) || null;
  }, [assets, selectedMode]);

  // ─── Refresh Active Forecast (Plant Fleet or Single Machine) ────────────────
  const refreshForecast = useCallback(async () => {
    const reqId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);

    const assetRequests = assets.map(mapAssetToForecastRequest);

    if (selectedMode === 'all') {
      try {
        const res = await fetchPlantHorizonForecast(assetRequests, selectedHorizon);
        if (reqId === activeRequestIdRef.current) {
          setForecastResponse(res);
          setIsFallback(false);
          setBackendConnected(true);
        }
      } catch (err: any) {
        console.warn('Fleet forecast fetch failed, using fallback:', err);
        if (reqId === activeRequestIdRef.current) {
          const fallback = getOfflineFallbackPlantForecast(assetRequests, selectedHorizon);
          setForecastResponse(fallback);
          setIsFallback(true);
          setBackendConnected(false);
          setErrorMessage(err.message || 'FastAPI backend unavailable. Using offline persistence model.');
        }
      } finally {
        if (reqId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    } else {
      const targetAsset = assets.find((a) => a.id === selectedMode);
      if (!targetAsset) {
        setIsLoading(false);
        return;
      }
      const targetReq = mapAssetToForecastRequest(targetAsset);

      try {
        const res = await fetchHorizonForecast(targetReq, selectedHorizon);
        if (reqId === activeRequestIdRef.current) {
          setForecastResponse(res);
          setIsFallback(false);
          setBackendConnected(true);
        }
      } catch (err: any) {
        console.warn(`Forecast fetch failed for machine ${targetAsset.id}, using fallback:`, err);
        if (reqId === activeRequestIdRef.current) {
          const fallback = getOfflineFallbackHorizonForecast(targetReq, selectedHorizon);
          setForecastResponse(fallback);
          setIsFallback(true);
          setBackendConnected(false);
          setErrorMessage(err.message || 'FastAPI backend unavailable. Using offline persistence model.');
        }
      } finally {
        if (reqId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    }
  }, [assets, selectedMode, selectedHorizon]);

  // Trigger forecast refresh when digital twin assets, horizon, or mode changes
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshForecast();
    }, 200);
    return () => clearTimeout(timer);
  }, [refreshForecast]);

  // ─── Target Interval Window Formatter ───────────────────────────────────────
  const targetWindowFormatted = useMemo(() => {
    if (!forecastResponse) {
      if (selectedHorizon === '15m') return 'Upcoming 15m Window';
      if (selectedHorizon === '1d') return 'Upcoming 24h Profile';
      return 'Upcoming 7d Profile';
    }

    try {
      const start = new Date(forecastResponse.forecast_start);
      const end = new Date(forecastResponse.forecast_end);

      if (selectedHorizon === '15m') {
        const s = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const e = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${s} → ${e}`;
      } else if (selectedHorizon === '1d') {
        const sTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const eDate = end.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const eTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `Today ${sTime} → ${eDate} ${eTime}`;
      } else {
        const sDate = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const eDate = end.toLocaleDateString([], { month: 'short', day: 'numeric' });
        return `${sDate} → ${eDate} (7 Days)`;
      }
    } catch {
      return `${selectedHorizon} forecast window`;
    }
  }, [forecastResponse, selectedHorizon]);

  // ─── Baseline & Reference Computations ──────────────────────────────────────
  const horizonHours = selectedHorizon === '15m' ? 0.25 : selectedHorizon === '1d' ? 24.0 : 168.0;

  const currentPlantPowerKw = useMemo(() => {
    return +assets.reduce((sum, a) => sum + a.currentKw, 0).toFixed(1);
  }, [assets]);

  const referenceStaticEnergyKwh = useMemo(() => {
    if (selectedMode === 'all') {
      return +(currentPlantPowerKw * horizonHours).toFixed(2);
    }
    const currentKw = selectedAsset?.currentKw || 0;
    return +(currentKw * horizonHours).toFixed(3);
  }, [selectedMode, selectedAsset, currentPlantPowerKw, horizonHours]);

  const predictedEnergyKwh = forecastResponse?.predicted_energy_kwh ?? referenceStaticEnergyKwh;
  const equivalentPowerKw = forecastResponse?.equivalent_average_power_kw ?? (predictedEnergyKwh / horizonHours);

  const deltaKwh = +(predictedEnergyKwh - referenceStaticEnergyKwh).toFixed(2);
  const deltaPct = referenceStaticEnergyKwh > 0 ? +((deltaKwh / referenceStaticEnergyKwh) * 100).toFixed(1) : 0;

  // ─── Active Model Metadata for Active Horizon ───────────────────────────────
  const activeModelMeta = useMemo(() => {
    if (!metadata?.models) return null;
    if (selectedHorizon === '15m') return metadata.models['15m'];
    if (selectedHorizon === '1d') return metadata.models['hourly'];
    return metadata.models['daily'];
  }, [metadata, selectedHorizon]);

  const anyWhatIfActive = params.autoIdleCutoff || params.pressureSetpoint < 7.5 || params.staggerFurnace;

  return (
    <div
      className="scroll-area"
      style={{
        background: 'transparent',
        minHeight: '100%',
        padding: '20px 24px 60px',
        maxWidth: 1200,
        margin: '0 auto',
        fontFamily: 'var(--font-ui)',
        color: 'var(--white)',
      }}
    >
      {/* ─── Top Header & Controls ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(124, 58, 237, 0.12)',
                color: 'var(--violet)',
                border: '1px solid rgba(124, 58, 237, 0.25)',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <Sparkles size={11} /> Industrial EMS
            </span>
            <span style={{ fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 }}>
              Multi-Horizon Machine & Plant Energy Forecasting
            </span>
          </div>

          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--white)',
              letterSpacing: 0.5,
              margin: '0 0 4px',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Energy Forecast Dashboard
          </h1>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--slate-400)' }}>
            Precision interval power requirements using multi-horizon gradient boosted regression pipelines.
          </p>
        </div>

        {/* Action Controls: Horizon Selector, View Mode Dropdown & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {anyWhatIfActive && onNavigateToSimulator && (
            <button
              onClick={onNavigateToSimulator}
              className="btn btn-sm"
              style={{
                background: 'var(--cyan-dim)',
                borderColor: 'rgba(2, 132, 199, 0.3)',
                color: 'var(--cyan)',
              }}
            >
              <Sliders size={12} />
              <span>Scenario Active</span>
            </button>
          )}

          {/* 1. Forecast Horizon Selector (Segmented Control) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label
              htmlFor="forecast-horizon-selector"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--slate-400)',
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                fontFamily: 'var(--font-mono)',
              }}
            >
              Forecast Horizon:
            </label>
            <div
              id="forecast-horizon-selector"
              role="radiogroup"
              aria-label="Forecast Horizon"
              style={{
                display: 'inline-flex',
                background: 'rgba(90, 75, 55, 0.08)',
                padding: 3,
                borderRadius: 'var(--r)',
                border: '1px solid var(--border)',
              }}
            >
              {HORIZON_OPTIONS.map((opt) => {
                const isActive = selectedHorizon === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedHorizon(opt.id)}
                    style={{
                      border: isActive ? '1px solid rgba(90, 75, 55, 0.25)' : '1px solid transparent',
                      outline: 'none',
                      cursor: 'pointer',
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 500,
                      borderRadius: 'calc(var(--r) - 2px)',
                      fontFamily: 'var(--font-mono)',
                      background: isActive ? '#E6D7C3' : 'transparent',
                      color: isActive ? '#1C1917' : 'var(--slate-400)',
                      boxShadow: isActive ? '0 1px 3px rgba(60, 45, 25, 0.12)' : 'none',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {opt.id === '15m' && <Clock size={11} />}
                    {opt.id === '1d' && <BarChart3 size={11} />}
                    {opt.id === '1w' && <Calendar size={11} />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Machine Selection Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label
              htmlFor="forecast-view-select"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--slate-400)',
                textTransform: 'uppercase',
                letterSpacing: 1.5,
                fontFamily: 'var(--font-mono)',
              }}
            >
              Forecast View:
            </label>
            <select
              id="forecast-view-select"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value as ForecastViewMode)}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-active)',
                borderRadius: 'var(--r)',
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--white)',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
              }}
            >
              <option value="all" style={{ background: '#EFE6D7', color: '#1C1917' }}>Overall Plant</option>
              <option value="compressor" style={{ background: '#EFE6D7', color: '#1C1917' }}>Air Compressor</option>
              <option value="cnc" style={{ background: '#EFE6D7', color: '#1C1917' }}>CNC Machining Center</option>
              <option value="furnace" style={{ background: '#EFE6D7', color: '#1C1917' }}>Industrial Heat Furnace</option>
              <option value="cooling" style={{ background: '#EFE6D7', color: '#1C1917' }}>Chilled Water Cooling</option>
            </select>
          </div>

          {/* 3. Refresh Button */}
          <button
            onClick={refreshForecast}
            title="Refresh active forecast"
            className="btn btn-sm"
          >
            <RefreshCw size={11} className={isLoading ? 'spin-icon' : ''} />
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
            key={`overall-plant-${selectedHorizon}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {/* Main Forecast Hero Card */}
            <div
              className="panel"
              style={{
                background: 'rgba(238, 230, 218, 0.92)',
                backdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                padding: '24px 28px',
                boxShadow: '0 4px 20px -2px rgba(60, 45, 25, 0.06)',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
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
                      background: 'var(--violet)',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: 'var(--font-mono)' }}>
                    {selectedHorizon === '15m' && 'Overall Plant Energy Forecast (Next 15 Minutes)'}
                    {selectedHorizon === '1d' && 'Overall Plant Energy Forecast (Next 24 Hours)'}
                    {selectedHorizon === '1w' && 'Overall Plant Energy Forecast (Next 7 Days)'}
                  </span>
                </div>

                {/* API Status Badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    background: backendConnected ? 'var(--emerald-dim)' : 'var(--amber-dim)',
                    border: `1px solid ${backendConnected ? 'rgba(5, 150, 105, 0.25)' : 'rgba(217, 119, 6, 0.25)'}`,
                    color: backendConnected ? 'var(--emerald)' : 'var(--amber)',
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'currentColor',
                    }}
                  />
                  <span>
                    {backendConnected ? 'Live Multi-Horizon API' : 'Offline Persistence Fallback'}
                  </span>
                </div>
              </div>

              {/* Main Metric & Equivalent Load */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 48,
                    fontWeight: 800,
                    color: 'var(--white)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: -1,
                    lineHeight: 1,
                  }}
                >
                  {selectedHorizon === '15m'
                    ? predictedEnergyKwh.toFixed(2)
                    : selectedHorizon === '1d'
                    ? predictedEnergyKwh.toFixed(1)
                    : predictedEnergyKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--violet)', fontFamily: 'var(--font-mono)' }}>
                  kWh
                </span>
                <span style={{ fontSize: 13, color: 'var(--slate-500)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                  (Equiv. Average Load: <strong style={{ color: 'var(--white)' }}>{equivalentPowerKw.toFixed(1)} kW</strong>)
                </span>
              </div>

              {/* Supporting Secondary Metric Strip */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border-muted)',
                }}
              >
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                    Current Plant Demand
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)' }}>
                    {currentPlantPowerKw.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--slate-500)' }}>kW</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Baseline ({selectedHorizon}): {referenceStaticEnergyKwh.toFixed(1)} kWh
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                    Forecast Target Window
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)' }}>
                    {targetWindowFormatted}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {selectedHorizon === '15m' && 'Exact 15-minute horizon'}
                    {selectedHorizon === '1d' && '24 consecutive hourly predictions'}
                    {selectedHorizon === '1w' && '7 consecutive daily predictions'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                    Machine Coverage
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)' }}>
                    {forecastResponse?.coverage_count || assets.length} of {forecastResponse?.total_machines || assets.length} machines
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--emerald)', fontFamily: 'var(--font-mono)', marginTop: 2, fontWeight: 600 }}>
                    {forecastResponse?.is_complete_coverage ? 'Complete fleet reporting' : 'Partial fleet reporting'}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Horizon-Specific Plant Chart ───────────────────────────────── */}
            <div
              className="panel"
              style={{
                background: 'rgba(238, 230, 218, 0.92)',
                backdropFilter: 'blur(16px)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                padding: '20px 24px',
                boxShadow: '0 4px 20px -2px rgba(60, 45, 25, 0.06)',
                marginBottom: 20,
              }}
            >
              {selectedHorizon === '15m' && (
                /* ─── 15m Horizon: Machine Contribution Comparison Chart ─── */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Forecast Energy Contribution by Machine (Next 15 Minutes)
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2 }}>
                        Predicted next-15-minute energy consumption (kWh) across the four digital-twin assets.
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--slate-500)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        background: 'rgba(90, 75, 55, 0.08)',
                        padding: '3px 8px',
                        borderRadius: 4,
                      }}
                    >
                      Total: <strong style={{ color: 'var(--white)' }}>{predictedEnergyKwh.toFixed(2)} kWh</strong>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart
                      data={(forecastResponse?.machine_breakdown?.length ? forecastResponse.machine_breakdown : assets.map((a) => ({
                        machine_id: a.id,
                        machine_name: MACHINE_CONFIGS[a.id]?.name || a.name,
                        predicted_energy_kwh: +(a.currentKw * 0.25).toFixed(3),
                        equivalent_average_power_kw: a.currentKw,
                        percentage_of_fleet: 25,
                      }))).map((m) => {
                        const cfg = MACHINE_CONFIGS[m.machine_id] || { name: m.machine_name, color: '#64748b' };
                        return {
                          id: m.machine_id,
                          name: cfg.name,
                          predictedKwh: m.predicted_energy_kwh,
                          powerKw: m.equivalent_average_power_kw,
                          color: cfg.color,
                        };
                      })}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(90, 75, 55, 0.08)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)' }} unit=" kWh" axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div
                              style={{
                                background: '#DDD0BC',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '8px 12px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                boxShadow: '0 4px 16px rgba(60, 45, 25, 0.12)',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>{d.name}</div>
                              <div style={{ color: d.color }}>
                                Predicted: <strong>{d.predictedKwh.toFixed(3)} kWh</strong>
                              </div>
                              <div style={{ color: 'var(--slate-500)', fontSize: 10, marginTop: 2 }}>
                                Equiv. Power: {d.powerKw.toFixed(1)} kW
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="predictedKwh" radius={[4, 4, 0, 0]} maxBarSize={44}>
                        {(forecastResponse?.machine_breakdown || []).map((entry, index) => {
                          const col = MACHINE_CONFIGS[entry.machine_id]?.color || '#64748b';
                          return <Cell key={`cell-${index}`} fill={col} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {selectedHorizon === '1d' && (
                /* ─── 1d Horizon: 24-Hour Hourly Profile Chart ────────────── */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Next 24-Hour Plant Energy Profile (Hourly Forecast)
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2 }}>
                        Predicted hourly electricity consumption (kWh) over the upcoming 24-hour cycle. Sum = total 24h energy.
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--slate-500)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        background: 'rgba(90, 75, 55, 0.08)',
                        padding: '3px 8px',
                        borderRadius: 4,
                      }}
                    >
                      Total 24h: <strong style={{ color: 'var(--white)' }}>{predictedEnergyKwh.toFixed(1)} kWh</strong>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart
                      data={forecastResponse?.time_series || []}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(90, 75, 55, 0.08)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="interval_label"
                        tickFormatter={(val: string) => {
                          const match = val.match(/Hour (\d+)/i);
                          return match ? `H${match[1]}` : val;
                        }}
                        tick={{ fill: 'var(--slate-500)', fontSize: 9.5, fontFamily: 'var(--font-mono)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)' }} unit=" kWh" axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pt = payload[0].payload as ForecastTimeSeriesPoint;
                          return (
                            <div
                              style={{
                                background: '#DDD0BC',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '8px 12px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                boxShadow: '0 4px 16px rgba(60, 45, 25, 0.12)',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>
                                {pt.interval_label}
                              </div>
                              <div style={{ color: 'var(--violet)' }}>
                                Predicted Energy: <strong>{pt.predicted_energy_kwh.toFixed(2)} kWh</strong>
                              </div>
                              <div style={{ color: 'var(--slate-500)', fontSize: 10, marginTop: 2 }}>
                                Equiv. Power: <strong>{pt.equivalent_average_power_kw.toFixed(1)} kW</strong>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="predicted_energy_kwh" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                    <span>* Diurnal variation and scheduled factory shift transitions reflected across 24 hourly intervals.</span>
                    <span>Hourly average: {(predictedEnergyKwh / 24.0).toFixed(2)} kWh/h</span>
                  </div>
                </div>
              )}

              {selectedHorizon === '1w' && (
                /* ─── 1w Horizon: 7-Day Daily Profile Chart ──────────────── */
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        Next 7-Day Plant Energy Profile (Daily Forecast)
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2 }}>
                        Predicted daily electricity consumption (kWh) over the upcoming 7-day schedule. Sum = total 7d energy.
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--slate-500)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        background: 'rgba(90, 75, 55, 0.08)',
                        padding: '3px 8px',
                        borderRadius: 4,
                      }}
                    >
                      Total 7d: <strong style={{ color: 'var(--white)' }}>{predictedEnergyKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh</strong>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart
                      data={forecastResponse?.time_series || []}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid stroke="rgba(90, 75, 55, 0.08)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="interval_label"
                        tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)' }} unit=" kWh" axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const pt = payload[0].payload as ForecastTimeSeriesPoint;
                          return (
                            <div
                              style={{
                                background: '#DDD0BC',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '8px 12px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                boxShadow: '0 4px 16px rgba(60, 45, 25, 0.12)',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>
                                {pt.interval_label}
                              </div>
                              <div style={{ color: 'var(--cyan)' }}>
                                Predicted Energy: <strong>{pt.predicted_energy_kwh.toFixed(1)} kWh</strong>
                              </div>
                              <div style={{ color: 'var(--slate-500)', fontSize: 10, marginTop: 2 }}>
                                Equiv. Power: <strong>{pt.equivalent_average_power_kw.toFixed(1)} kW</strong>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="predicted_energy_kwh" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                    <span>* Captures scheduled weekday baseline requirements and weekend production idle drops.</span>
                    <span>Daily average: {(predictedEnergyKwh / 7.0).toFixed(1)} kWh/day</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* ================================================================= */
          /* INDIVIDUAL MACHINE VIEW                                          */
          /* ================================================================= */
          selectedAsset && (
            <motion.div
              key={`machine-${selectedAsset.id}-${selectedHorizon}`}
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
                const loadFactorPct = selectedAsset.ratedKw > 0 ? +((selectedAsset.currentKw / selectedAsset.ratedKw) * 100).toFixed(0) : 0;

                const chartPoints: ForecastIntervalPoint[] = [
                  {
                    label: 'Reference (t)',
                    timeWindow: 'Current draw',
                    energyKwh: referenceStaticEnergyKwh,
                    equivalentKw: selectedAsset.currentKw,
                    isForecast: false,
                    statusLabel: `CONSTANT-LOAD REFERENCE (P × ${horizonHours}h)`,
                  },
                  {
                    label: `Target (${selectedHorizon})`,
                    timeWindow: targetWindowFormatted,
                    energyKwh: predictedEnergyKwh,
                    equivalentKw: equivalentPowerKw,
                    isForecast: true,
                    statusLabel: isFallback ? 'OFFLINE PERSISTENCE' : 'GRADIENT BOOSTED FORECAST',
                  },
                ];

                return (
                  <div>
                    {/* Machine Detail Card */}
                    <div
                      className="panel"
                      style={{
                        background: 'rgba(238, 230, 218, 0.92)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        padding: '24px 28px',
                        boxShadow: '0 4px 20px -2px rgba(60, 45, 25, 0.06)',
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: 14,
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
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {selectedAsset.name}
                            </h2>
                            <span
                              style={{
                                fontSize: 9.5,
                                fontFamily: 'var(--font-mono)',
                                background: 'rgba(90, 75, 55, 0.1)',
                                color: 'var(--white)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontWeight: 700,
                                letterSpacing: 1,
                              }}
                            >
                              {selectedAsset.id.toUpperCase()}
                            </span>
                            <span
                              style={{
                                fontSize: 9.5,
                                fontFamily: 'var(--font-mono)',
                                background: 'rgba(124, 58, 237, 0.1)',
                                color: 'var(--violet)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                              }}
                            >
                              {selectedHorizon === '15m' ? '15-Min Forecast' : selectedHorizon === '1d' ? '24-Hour Forecast' : '7-Day Forecast'}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                            {cfg.model} • {cfg.bay} • <strong style={{ color: 'var(--white)' }}>{selectedAsset.ratedKw} kW</strong> Rated Power
                          </div>
                        </div>

                        {/* Status & Operating State */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 4,
                              background: 'rgba(90, 75, 55, 0.08)',
                              color: 'var(--white)',
                              border: '1px solid var(--border)',
                              letterSpacing: 0.5,
                            }}
                          >
                            State {selectedAsset.currentKw <= 0.05 ? '0 (Off)' : selectedAsset.status === 'IDLE' ? '1 (Idle)' : '2 (Running)'}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              padding: '3px 8px',
                              borderRadius: 4,
                              letterSpacing: 1,
                              textTransform: 'uppercase',
                              background: selectedAsset.status === 'OPTIMAL' ? 'var(--emerald-dim)' : selectedAsset.status === 'WARNING' ? 'var(--amber-dim)' : 'var(--red-dim)',
                              color: selectedAsset.status === 'OPTIMAL' ? 'var(--emerald)' : selectedAsset.status === 'WARNING' ? 'var(--amber)' : 'var(--red)',
                              border: `1px solid ${selectedAsset.status === 'OPTIMAL' ? 'rgba(5, 150, 105, 0.25)' : selectedAsset.status === 'WARNING' ? 'rgba(217, 119, 6, 0.25)' : 'rgba(220, 38, 38, 0.25)'}`,
                            }}
                          >
                            {selectedAsset.status}
                          </span>
                        </div>
                      </div>

                      {/* Primary Predicted Metric */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 44,
                            fontWeight: 800,
                            color: 'var(--white)',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: -1,
                            lineHeight: 1,
                          }}
                        >
                          {selectedHorizon === '15m'
                            ? predictedEnergyKwh.toFixed(3)
                            : selectedHorizon === '1d'
                            ? predictedEnergyKwh.toFixed(2)
                            : predictedEnergyKwh.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--violet)', fontFamily: 'var(--font-mono)' }}>
                          kWh
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--slate-500)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                          (Equiv. Load: <strong style={{ color: 'var(--white)' }}>{equivalentPowerKw.toFixed(2)} kW</strong>)
                        </span>
                      </div>

                      {/* Detail Metrics Strip */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: 16,
                          paddingTop: 16,
                          borderTop: '1px solid var(--border-muted)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                            Current Power Demand
                          </div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)' }}>
                            {selectedAsset.currentKw} <span style={{ fontSize: 11, color: 'var(--slate-500)' }}>kW</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            {loadFactorPct}% of rated capacity
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                            Constant-Load Reference
                          </div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                            {referenceStaticEnergyKwh.toFixed(2)} <span style={{ fontSize: 11, color: 'var(--slate-500)' }}>kWh</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            P × {horizonHours}h extrapolation
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                            Forecast Target Window
                          </div>
                          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)' }}>
                            {targetWindowFormatted}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            {selectedHorizon === '15m' && 'Next 15-minute window'}
                            {selectedHorizon === '1d' && '24 hourly intervals'}
                            {selectedHorizon === '1w' && '7 daily intervals'}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate-400)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 3 }}>
                            Capacity Bounds Check
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: forecastResponse?.physical_constraint_applied ? 'var(--amber)' : 'var(--emerald)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                            {forecastResponse?.physical_constraint_applied ? 'Clamped (Surge Limit)' : 'Within Physical Capacity'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            ≤ 1.3× nameplate rating
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Machine Horizon-Specific Chart */}
                    <div
                      className="panel"
                      style={{
                        background: 'rgba(238, 230, 218, 0.92)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r)',
                        padding: '20px 24px',
                        boxShadow: '0 4px 20px -2px rgba(60, 45, 25, 0.06)',
                        marginBottom: 20,
                      }}
                    >
                      {selectedHorizon === '15m' ? (
                        /* 15m Horizon: Reference vs Model Forecast Comparison */
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                Reference vs Model Forecast Comparison
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2 }}>
                                Constant-load reference estimate (P × 0.25h) compared to model predicted interval energy.
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--white)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                background: 'rgba(90, 75, 55, 0.08)',
                                border: '1px solid var(--border)',
                                padding: '3px 8px',
                                borderRadius: 4,
                              }}
                            >
                              Difference: <strong style={{ color: deltaKwh <= 0 ? 'var(--cyan)' : 'var(--amber)' }}>{deltaKwh >= 0 ? `+${deltaKwh.toFixed(3)}` : deltaKwh.toFixed(3)} kWh</strong> ({deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`})
                            </div>
                          </div>

                          <MachineForecastIntervalChart points={chartPoints} />

                          <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
                            *Notice: Difference relative to static constant-load extrapolation. Does not indicate verified operational energy savings or plant waste.
                          </div>
                        </div>
                      ) : selectedHorizon === '1d' ? (
                        /* 1d Horizon: 24-Hour Hourly Profile for Machine */
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                Next 24-Hour Equipment Profile ({selectedAsset.name})
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2 }}>
                                Predicted hourly electricity consumption (kWh) over the next 24 consecutive hours.
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--white)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                background: 'rgba(90, 75, 55, 0.08)',
                                border: '1px solid var(--border)',
                                padding: '3px 8px',
                                borderRadius: 4,
                              }}
                            >
                              24h Total: <strong style={{ color: 'var(--white)' }}>{predictedEnergyKwh.toFixed(2)} kWh</strong>
                            </div>
                          </div>

                          <ResponsiveContainer width="100%" height={230}>
                            <BarChart
                              data={forecastResponse?.time_series || []}
                              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                            >
                              <CartesianGrid stroke="rgba(90, 75, 55, 0.08)" strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="interval_label"
                                tickFormatter={(val: string) => {
                                  const match = val.match(/Hour (\d+)/i);
                                  return match ? `H${match[1]}` : val;
                                }}
                                tick={{ fill: 'var(--slate-500)', fontSize: 9.5, fontFamily: 'var(--font-mono)' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)' }} unit=" kWh" axisLine={false} tickLine={false} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const pt = payload[0].payload as ForecastTimeSeriesPoint;
                                  return (
                                    <div
                                      style={{
                                        background: '#DDD0BC',
                                        border: '1px solid var(--border)',
                                        borderRadius: 6,
                                        padding: '8px 12px',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        boxShadow: '0 4px 16px rgba(60, 45, 25, 0.12)',
                                      }}
                                    >
                                      <div style={{ fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>
                                        {pt.interval_label}
                                      </div>
                                      <div style={{ color: cfg.color }}>
                                        Predicted Energy: <strong>{pt.predicted_energy_kwh.toFixed(3)} kWh</strong>
                                      </div>
                                      <div style={{ color: 'var(--slate-500)', fontSize: 10, marginTop: 2 }}>
                                        Equiv. Power: <strong>{pt.equivalent_average_power_kw.toFixed(2)} kW</strong>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              <Bar dataKey="predicted_energy_kwh" fill={cfg.color} radius={[3, 3, 0, 0]} maxBarSize={22} />
                            </BarChart>
                          </ResponsiveContainer>

                          <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
                            * Hourly model prediction profile summing to {predictedEnergyKwh.toFixed(2)} kWh. Average power = {(predictedEnergyKwh / 24.0).toFixed(2)} kW.
                          </div>
                        </div>
                      ) : (
                        /* 1w Horizon: 7-Day Daily Profile for Machine */
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                Next 7-Day Equipment Profile ({selectedAsset.name})
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2 }}>
                                Predicted daily electricity consumption (kWh) over the upcoming 7 days.
                              </div>
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                fontFamily: 'var(--font-mono)',
                                color: 'var(--white)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                background: 'rgba(90, 75, 55, 0.08)',
                                border: '1px solid var(--border)',
                                padding: '3px 8px',
                                borderRadius: 4,
                              }}
                            >
                              7d Total: <strong style={{ color: 'var(--white)' }}>{predictedEnergyKwh.toFixed(1)} kWh</strong>
                            </div>
                          </div>

                          <ResponsiveContainer width="100%" height={230}>
                            <BarChart
                              data={forecastResponse?.time_series || []}
                              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                            >
                              <CartesianGrid stroke="rgba(90, 75, 55, 0.08)" strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="interval_label"
                                tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis tick={{ fill: 'var(--slate-500)', fontSize: 10, fontFamily: 'var(--font-mono)' }} unit=" kWh" axisLine={false} tickLine={false} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const pt = payload[0].payload as ForecastTimeSeriesPoint;
                                  return (
                                    <div
                                      style={{
                                        background: '#DDD0BC',
                                        border: '1px solid var(--border)',
                                        borderRadius: 6,
                                        padding: '8px 12px',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 11,
                                        boxShadow: '0 4px 16px rgba(60, 45, 25, 0.12)',
                                      }}
                                    >
                                      <div style={{ fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>
                                        {pt.interval_label}
                                      </div>
                                      <div style={{ color: cfg.color }}>
                                        Predicted Energy: <strong>{pt.predicted_energy_kwh.toFixed(2)} kWh</strong>
                                      </div>
                                      <div style={{ color: 'var(--slate-500)', fontSize: 10, marginTop: 2 }}>
                                        Equiv. Power: <strong>{pt.equivalent_average_power_kw.toFixed(2)} kW</strong>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              <Bar dataKey="predicted_energy_kwh" fill={cfg.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
                            </BarChart>
                          </ResponsiveContainer>

                          <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
                            * Daily model prediction profile summing to {predictedEnergyKwh.toFixed(1)} kWh. Average power = {(predictedEnergyKwh / 168.0).toFixed(2)} kW.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* ─── Expandable Technical Sections (Collapsed by Default) ───────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Accordion 1: Model Information */}
        <div
          className="panel"
          style={{
            background: 'rgba(238, 230, 218, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            overflow: 'hidden',
            marginBottom: 0,
          }}
        >
          <button
            onClick={() => setShowModelInfo(!showModelInfo)}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={14} color="var(--violet)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                Multi-Horizon Model Information & Lineage ({selectedHorizon.toUpperCase()})
              </span>
            </div>
            {showModelInfo ? <ChevronDown size={14} color="var(--slate-500)" /> : <ChevronRight size={14} color="var(--slate-500)" />}
          </button>

          <AnimatePresence>
            {showModelInfo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-muted)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>
                    <div style={{ background: '#DDD0BC', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 9.5, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>MODEL ARCHITECTURE</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        HistGradientBoostingRegressor
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {selectedHorizon === '15m' && '15-Minute Tactical Pipeline'}
                        {selectedHorizon === '1d' && '24-Hour Hourly Profile Pipeline'}
                        {selectedHorizon === '1w' && '7-Day Daily Profile Pipeline'}
                      </div>
                    </div>

                    <div style={{ background: '#DDD0BC', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 9.5, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>TARGET HORIZON</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {selectedHorizon === '15m' && 'target_next_15min_energy_kwh'}
                        {selectedHorizon === '1d' && 'target_hourly_energy_kwh (24h Sum)'}
                        {selectedHorizon === '1w' && 'target_daily_energy_kwh (7d Sum)'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {selectedHorizon === '15m' && 'Next 15-minute window'}
                        {selectedHorizon === '1d' && '24 consecutive hourly predictions'}
                        {selectedHorizon === '1w' && '7 consecutive daily predictions'}
                      </div>
                    </div>

                    <div style={{ background: '#DDD0BC', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 9.5, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>DATASET SHA-256 HASH</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--white)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        {metadata?.dataset_hash || '06229d9556da29c4'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>740,748 industrial records</div>
                    </div>

                    <div style={{ background: '#DDD0BC', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 6 }}>
                      <div style={{ fontSize: 9.5, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', letterSpacing: 1, textTransform: 'uppercase' }}>TEST BENCHMARK</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--emerald)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {selectedHorizon === '15m' && 'R² = 0.652 | MAE = 0.940 kWh'}
                        {selectedHorizon === '1d' && 'R² = 0.997 | MAE = 0.255 kWh'}
                        {selectedHorizon === '1w' && 'R² = 0.998 | MAE = 3.238 kWh'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {selectedHorizon === '15m' && 'WAPE = 12.4% | Unseen Fleet R² = 0.617'}
                        {selectedHorizon === '1d' && 'WAPE = 2.89% | Chronological test split'}
                        {selectedHorizon === '1w' && 'WAPE = 1.53% | Chronological test split'}
                      </div>
                    </div>
                  </div>

                  <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                    *Notice: Synthetic industrial energy dataset provenance disclosed. Multi-horizon gradient boosting pipelines are independently trained on chronological 70/15/15 splits to prevent leakage. 1-day predictions aggregate 24 hourly intervals and 1-week predictions aggregate 7 daily intervals to preserve mathematical consistency with total energy (kWh) and equivalent average power (kW = kWh / hours).
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Accordion 2: Forecast Inputs & Quality */}
        <div
          className="panel"
          style={{
            background: 'rgba(238, 230, 218, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            overflow: 'hidden',
            marginBottom: 0,
          }}
        >
          <button
            onClick={() => setShowDataQuality(!showDataQuality)}
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={14} color="var(--cyan)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--white)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                Forecast Inputs & Data Quality (29 Features)
              </span>
            </div>
            {showDataQuality ? <ChevronDown size={14} color="var(--slate-500)" /> : <ChevronRight size={14} color="var(--slate-500)" />}
          </button>

          <AnimatePresence>
            {showDataQuality && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border-muted)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 12, fontSize: 11 }}>
                    <div style={{ background: '#DDD0BC', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 2 }}>
                        Operational Telemetry (Simulated)
                      </div>
                      <div style={{ color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                        Features: power_kw, rated_power_kw, load_factor, operating_state, operating_minutes.
                      </div>
                    </div>

                    <div style={{ background: '#DDD0BC', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--violet)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 2 }}>
                        Temporal Signals (Real-Time UTC)
                      </div>
                      <div style={{ color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                        Features: hour, day_of_week, hour_sin/cos, day_sin/cos, is_weekend, shift_pattern.
                      </div>
                    </div>

                    <div style={{ background: '#DDD0BC', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 2 }}>
                        Environmental Inputs (Defaults)
                      </div>
                      <div style={{ color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                        Furnace models explicit 840°C; other assets use equipment median (35°C) and factory ambient defaults (27.5°C, 58% RH).
                      </div>
                    </div>

                    <div style={{ background: '#DDD0BC', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 2 }}>
                        Multi-Horizon Aggregations
                      </div>
                      <div style={{ color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                        Daily models aggregate 96 intervals/day; hourly models aggregate 4 intervals/hour. No flat line repetition or arbitrary multiplier extrapolation.
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

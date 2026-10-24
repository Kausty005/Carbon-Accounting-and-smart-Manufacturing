import type {
  TelemetryRecord,
  ScenarioAction,
  ConstraintViolation,
  FeasibilityStatus,
} from './types';
import { MACHINE_PROFILES, resolveMachineId } from './twinProfiles';

export function validateScenarioConstraints(
  scenarioRecords: TelemetryRecord[],
  action: ScenarioAction,
  baselineRecords: TelemetryRecord[]
): { feasibility: FeasibilityStatus; violations: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = [];
  const rawId = action.machine_id;
  const machineId = resolveMachineId(rawId);
  const profile = MACHINE_PROFILES[machineId];

  const PROVENANCE = 'Simulated Engineering Assumption (PrecisionWorks Benchmark)';

  // 1. Machine existence check
  if (!profile) {
    violations.push({
      code: 'ERR_UNKNOWN_MACHINE',
      severity: 'error',
      machine_id: rawId,
      message: `Machine ID '${rawId}' is not registered in factory digital twin profiles.`,
      provenance: PROVENANCE,
    });
    return { feasibility: 'blocked', violations };
  }

  const ratedKw = profile.rated_power_kw;
  const permittedStates = profile.permitted_states;
  const constraints = profile.constraints;

  // 2. Power bounds check
  if (typeof action.target_power_kw === 'number') {
    const p = action.target_power_kw;
    if (p < 0) {
      violations.push({
        code: 'ERR_POWER_NEGATIVE',
        severity: 'error',
        machine_id: machineId,
        message: `Proposed target power (${p} kW) cannot be negative.`,
        provenance: PROVENANCE,
      });
    } else if (p > ratedKw) {
      violations.push({
        code: 'ERR_POWER_EXCEEDS_RATED',
        severity: 'error',
        machine_id: machineId,
        message: `Target power of ${p} kW exceeds rated motor/element capacity (${ratedKw} kW) on ${profile.name}.`,
        limit_value: ratedKw,
        simulated_value: p,
        provenance: PROVENANCE,
      });
    }
  }

  // 3. Permitted state check
  if (action.target_state && !permittedStates.includes(action.target_state)) {
    violations.push({
      code: 'ERR_INVALID_STATE',
      severity: 'error',
      machine_id: machineId,
      message: `Proposed operating state '${action.target_state}' is not permitted for ${machineId}. Permitted: ${permittedStates.join(', ')}.`,
      provenance: PROVENANCE,
    });
  }

  // 4. Protected process block check (FURN-01)
  if (constraints.protected_process_block || constraints.cannot_interrupt_holding_cycle) {
    if (action.type === 'reduce_idle_power' && typeof action.target_power_kw === 'number') {
      if (action.target_power_kw < profile.expected_idle_power_kw) {
        violations.push({
          code: 'ERR_PROTECTED_PROCESS_VIOLATION',
          severity: 'error',
          machine_id: machineId,
          message: `Heat-treatment furnace (FURN-01) holding cycle requires a minimum thermal threshold of ${profile.expected_idle_power_kw} kW. Interruption or premature cooling causes metallurgy quench defects.`,
          limit_value: profile.expected_idle_power_kw,
          simulated_value: action.target_power_kw,
          provenance: PROVENANCE,
        });
      }
    }
  }

  // 5. Paint exhaust ventilation check (PAINT-01)
  if (constraints.ventilation_mandatory_during_paint) {
    if (action.type === 'reduce_idle_power' || action.type === 'reduce_runtime') {
      const isVentCut = scenarioRecords.some(
        r => r.machine_id === 'PAINT-01' && r.machine_state === 'running' && r.power_kw < 5.0
      );
      if (isVentCut) {
        violations.push({
          code: 'ERR_VENTILATION_REQUIRED',
          severity: 'error',
          machine_id: 'PAINT-01',
          message: 'Mandatory exhaust ventilation (min 5.0 kW) must remain active during painting operations to comply with factory VOC health and safety interlocks.',
          limit_value: 5.0,
          simulated_value: 0.0,
          provenance: PROVENANCE,
        });
      }
    }
  }

  // 6. Production target check (CNC-01)
  if (constraints.production_target_required) {
    const baseProd = baselineRecords
      .filter(r => r.machine_id === machineId)
      .reduce((sum, r) => sum + r.production_units, 0);
    const scenProd = scenarioRecords
      .filter(r => r.machine_id === machineId)
      .reduce((sum, r) => sum + r.production_units, 0);
    const minTarget = constraints.min_daily_production_units || 140;

    if (scenProd < minTarget) {
      violations.push({
        code: 'WARN_PRODUCTION_DEFICIT',
        severity: 'warning',
        machine_id: machineId,
        message: `Proposed schedule produces only ${scenProd} units, which is below the daily quota of ${minTarget} units (baseline achieved ${baseProd} units).`,
        limit_value: minTarget,
        simulated_value: scenProd,
        provenance: PROVENANCE,
      });
    }
  }

  // 7. Pressure setpoint validation for compressor
  if (action.type === 'pressure_optimization' && action.target_pressure_bar) {
    const minBar = constraints.min_pressure_bar || 6.5;
    if (action.target_pressure_bar < minBar) {
      violations.push({
        code: 'ERR_PRESSURE_BELOW_MINIMUM',
        severity: 'error',
        machine_id: machineId,
        message: `Target pressure (${action.target_pressure_bar} bar) is below the pneumatic ring main minimum operating limit of ${minBar} bar. Pneumatic clamps may lose torque.`,
        limit_value: minBar,
        simulated_value: action.target_pressure_bar,
        provenance: PROVENANCE,
      });
    }
  }

  // Determine feasibility
  const hasError = violations.some(v => v.severity === 'error');
  const hasWarning = violations.some(v => v.severity === 'warning');

  if (hasError) {
    return { feasibility: 'blocked', violations };
  }

  // Feasible scenarios require operator sign-off advisory note
  violations.push({
    code: 'INFO_OPERATOR_APPROVAL_REQUIRED',
    severity: 'info',
    machine_id: machineId,
    message: 'Scenario passed physical constraints. Advisory simulation: plant energy manager must sign off before DCS/SCADA implementation.',
    provenance: PROVENANCE,
  });

  if (hasWarning) {
    return { feasibility: 'review_required', violations };
  }

  return { feasibility: 'feasible', violations };
}

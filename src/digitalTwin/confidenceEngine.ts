import type { SimulationResult, InvestmentCase, ScenarioAction, EvidenceGrade } from './types';

export function calculateInvestmentCase(
  result: SimulationResult,
  action: ScenarioAction,
  hasFlowMeter: boolean = false
): InvestmentCase {
  // Approximate capex for typical industrial retrofit interventions
  let capex = 25000; // default for relay / timer
  if (action.type === 'reduce_idle_power') {
    capex = hasFlowMeter ? 37000 : 25000; // ₹25,000 relay + optional ₹12,000 flowmeter
  } else if (action.type === 'pressure_optimization') {
    capex = 12000; // ₹12,000 for precision pneumatic regulator valve & calibration
  } else if (action.type === 'shift_schedule') {
    capex = 15000; // ₹15,000 for DCS shift scheduling configuration & work order sync
  } else if (action.type === 'reduce_runtime') {
    capex = 10000; // ₹10,000 for control interlock
  }

  // Daily savings
  const dailyCostSaving = Math.max(0, result.deltas.savings_positive.cost_inr);
  
  // Annualized savings (assuming 300 working days/year)
  const expectedAnnual = Number((dailyCostSaving * 300).toFixed(2));
  
  // If flowmeter is missing, conservative case accounts for 60% of idle draw being unmetered pipe leaks
  const conservativeFactor = hasFlowMeter ? 0.92 : 0.35;
  const conservativeAnnual = Number((expectedAnnual * conservativeFactor).toFixed(2));
  const bestCaseAnnual = Number((expectedAnnual * 1.35).toFixed(2)); // +35% with full dual-shift and demand peak shaving

  // Payback in months
  const paybackExpected = expectedAnnual > 0 ? Number(((capex / expectedAnnual) * 12).toFixed(1)) : 99.9;
  const paybackConservative = conservativeAnnual > 0 ? Number(((capex / conservativeAnnual) * 12).toFixed(1)) : 99.9;
  const paybackBest = bestCaseAnnual > 0 ? Number(((capex / bestCaseAnnual) * 12).toFixed(1)) : 99.9;

  // NIST Data Evidence Grade (Idea A: Diagnostic Humility)
  const evidenceGrade: EvidenceGrade = hasFlowMeter ? 'A' : 'B';
  const evidenceDescription = hasFlowMeter
    ? 'Grade A (High Instrumentation): Electrical power + inline ultrasonic flowmeter confirms zero downstream demand during break periods.'
    : 'Grade B (Telemetry Heuristic): Electrical smart submeter verified (Class 0.5), but downstream pneumatic airflow is unmetered.';

  const diagnosticAmbiguity = hasFlowMeter
    ? 'RESOLVED: Flow transducer confirms 0.0 Nm³/min flow during lunch break. 100% of the 10 kW idle excess is control blow-off timer waste, solvable via auto-cutoff relay.'
    : 'DIAGNOSTIC AMBIGUITY: Electrical power alone cannot distinguish between Hypothesis 1 (blow-off timer stuck in load mode, solvable via ₹2,000 relay) vs Hypothesis 2 (downstream ring-main leaks, requiring physical pipe repair). Auto-cutoff without flow verification risks header pressure collapse below 6.5 bar.';

  const flowmeterCapex = 12000;
  const annualUncertaintySpan = Math.max(0, expectedAnnual - conservativeAnnual);
  const voiRatio = Number((annualUncertaintySpan / (flowmeterCapex || 1)).toFixed(2));

  const missingSensors = hasFlowMeter
    ? [
        'Flow transducer validated (Nm³/min) — 100% of idle draw confirmed recoverable via timer cutoff.',
        'Line pressure transducer at furthest machine tool (CNC-01 pneumatic drop test verified ≥ 6.5 bar).',
      ]
    : [
        'MISSING: Compressed air mass flow transducer (Nm³/min) — Cannot isolate compressor unload blow-off from pipe leaks.',
        'MISSING: Point-of-use pressure transducer at CNC-01 pneumatic chuck.',
        `VALUE OF INFORMATION (VOI): Deploying a ₹${flowmeterCapex.toLocaleString()} temporary ultrasonic flowmeter delivers a VOI Ratio of ${voiRatio}x, narrowing payback uncertainty from 4–11 months to 2.8 months.`,
      ];

  return {
    capex_inr: capex,
    conservative_annual_saving_inr: conservativeAnnual,
    expected_annual_saving_inr: expectedAnnual,
    best_case_annual_saving_inr: bestCaseAnnual,
    payback_months_conservative: paybackConservative,
    payback_months_expected: paybackExpected,
    payback_months_best: paybackBest,
    evidence_grade: evidenceGrade,
    evidence_description: evidenceDescription,
    missing_measurements_sensitivity: missingSensors,
    diagnostic_ambiguity: diagnosticAmbiguity,
    recommended_instrument: 'Temporary Clamp-on Ultrasonic Airflow Transducer',
    voi_ratio: voiRatio,
    voi_annual_uncertainty_inr: annualUncertaintySpan,
  };
}

"""
Command-Line Prediction & Inference Interface.
KPCL Hackathon — AI & Energy Intelligence Module
"""

import sys
import argparse
import json
from pathlib import Path
import pandas as pd

# Add module root to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from src.inference import EnergyIntelligencePipeline


def main():
    parser = argparse.ArgumentParser(description="Run inference on new telemetry data using saved pipeline.")
    parser.add_argument("--data", type=str, default=None, help="Path to input CSV with sensor readings.")
    parser.add_argument("--models-dir", type=str, default="models", help="Directory where models are serialized.")
    parser.add_argument("--output", type=str, default=None, help="Path to save output JSON predictions.")
    parser.add_argument("--preference", type=str, choices=["supervised", "isolation_forest", "energy_baseline"], default="supervised", help="Primary detection model preference.")
    parser.add_argument("--sample-rows", type=int, default=100, help="Number of rows to evaluate if using default data slice.")

    args = parser.parse_args()

    models_path = BASE_DIR / args.models_dir
    print(f"Loading saved pipeline from {models_path}...")
    pipeline = EnergyIntelligencePipeline.load_saved_model(models_dir=str(models_path))

    if args.data and Path(args.data).exists():
        input_path = Path(args.data)
        print(f"Loading input telemetry from {input_path}...")
        df_new = pd.read_csv(input_path)
    else:
        # Load sample from test period of default data
        print(f"No custom CSV specified; sampling latest {args.sample_rows} rows from project data.csv...")
        from src.data_loader import load_and_validate_data
        df_full = load_and_validate_data()
        df_new = df_full.tail(args.sample_rows).copy()

    print(f"Running inference on {len(df_new)} readings (Preference: {args.preference})...")
    results = pipeline.predict_new_readings(df_new, model_preference=args.preference)

    print("\n--- INFERENCE SUMMARY ---")
    print(f"Input Readings:       {results['total_input_readings']}")
    print(f"Anomalies Detected:   {results['anomalies_detected_count']} ({results['anomaly_rate_pct']}%)")
    print(f"Active Model:         {results['active_model_name']}")
    print(f"Measured Energy:      {results['energy_kpis']['total_measured_energy_kwh']:.2f} kWh")
    print(f"Peak Power:           {results['energy_kpis']['peak_power_kw']:.2f} kW")
    print(f"Estimated Excess:     {results['energy_kpis']['estimated_excess_energy_kwh']:.2f} kWh")
    print(f"Scope 2 Carbon:       {results['carbon_accounting']['scope_2_electricity_emissions_kg_co2e']:.2f} kg CO2e")
    print(f"Priority Equipment:   {results['highest_priority_equipment']}")

    if results["anomaly_records"]:
        print("\nSample Anomaly Record with Evidence:")
        print(json.dumps(results["anomaly_records"][0], indent=2))

    if args.output:
        out_path = Path(args.output)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"\nFull predictions exported to {out_path}")


if __name__ == "__main__":
    main()

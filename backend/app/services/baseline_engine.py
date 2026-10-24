import csv
import os
from copy import deepcopy
from typing import List, Dict, Any, Optional
from datetime import datetime

class BaselineEngine:
    def __init__(self, csv_path: Optional[str] = None):
        if csv_path is None:
            candidates = [
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "machine_energy.csv"),
                os.path.join(os.getcwd(), "data", "machine_energy.csv"),
                os.path.join(os.getcwd(), "Carbon-Accounting-and-smart-Manufacturing", "data", "machine_energy.csv")
            ]
            for c in candidates:
                if os.path.exists(c):
                    csv_path = os.path.abspath(c)
                    break
        
        self.raw_records: List[Dict[str, Any]] = []
        if csv_path and os.path.exists(csv_path):
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    self.raw_records.append({
                        "timestamp": row["timestamp"],
                        "machine_id": row["machine_id"],
                        "process": row["process"],
                        "power_kw": float(row["power_kw"]),
                        "energy_kwh": float(row["energy_kwh"]),
                        "machine_state": row["machine_state"],
                        "production_units": float(row["production_units"]),
                        "shift": row["shift"],
                        "data_source": row["data_source"]
                    })

    def get_records(
        self,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        machine_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        # Always return deepcopy to protect immutability
        filtered = []
        for r in self.raw_records:
            if start_time and r["timestamp"] < start_time:
                continue
            if end_time and r["timestamp"] > end_time:
                continue
            if machine_id and r["machine_id"] != machine_id:
                continue
            filtered.append(deepcopy(r))
        return filtered

    def get_available_window(self) -> Dict[str, str]:
        if not self.raw_records:
            return {"start": "", "end": ""}
        timestamps = sorted(list(set(r["timestamp"] for r in self.raw_records)))
        return {
            "start": timestamps[0],
            "end": timestamps[-1],
            "total_slots": len(timestamps)
        }

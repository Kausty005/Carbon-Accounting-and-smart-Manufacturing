import json
import os
from typing import Dict, Any, Optional

class ProfileStore:
    def __init__(self, profiles_path: Optional[str] = None):
        if profiles_path is None:
            # Default lookup
            candidates = [
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "machine_profiles.json"),
                os.path.join(os.getcwd(), "data", "machine_profiles.json"),
                os.path.join(os.getcwd(), "Carbon-Accounting-and-smart-Manufacturing", "data", "machine_profiles.json")
            ]
            for c in candidates:
                if os.path.exists(c):
                    profiles_path = os.path.abspath(c)
                    break
        
        self.profiles: Dict[str, Any] = {}
        if profiles_path and os.path.exists(profiles_path):
            with open(profiles_path, "r", encoding="utf-8") as f:
                self.profiles = json.load(f)

    def get_profile(self, machine_id: str) -> Optional[Dict[str, Any]]:
        return self.profiles.get(machine_id)

    def list_machines(self) -> Dict[str, Any]:
        return self.profiles

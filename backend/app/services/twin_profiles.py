import json
import os
from typing import Dict, Any, Optional
from .canonical_assets import normalize_to_canonical_asset_id, resolve_legacy_twin_archetype

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
        if not machine_id:
            return None
        if machine_id in self.profiles:
            return self.profiles[machine_id]
        
        # Try resolving via archetype
        archetype = resolve_legacy_twin_archetype(machine_id)
        if archetype in self.profiles:
            return self.profiles[archetype]

        # Try resolving via canonical asset id
        canon_id = normalize_to_canonical_asset_id(machine_id)
        if canon_id and canon_id in self.profiles:
            return self.profiles[canon_id]

        return None

    def list_machines(self) -> Dict[str, Any]:
        return self.profiles


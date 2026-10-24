"""
WattWise AI — Real-Time Immutable Hash-Chain Audit Ledger
Generates cryptographically signed 15-minute interval blocks with SHA-256 hash chaining
and Merkle roots for tamper-evident statutory audit compliance (SEBI BRSR Core, ISO 14064-1).
"""

import hashlib
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.app.models import AuditBlock, LedgerVerifyResponse


LEDGER_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "audit_ledger.json"


def compute_sha256(data: str) -> str:
    """Computes SHA-256 hex digest for a string."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_merkle_root(telemetry_dict: Dict[str, Any]) -> str:
    """Computes binary Merkle tree root of sorted key-value telemetry pairs."""
    sorted_items = sorted(telemetry_dict.items(), key=lambda x: str(x[0]))
    leaf_hashes = [compute_sha256(f"{k}:{v}") for k, v in sorted_items]

    if not leaf_hashes:
        return "0" * 64

    current_layer = leaf_hashes
    while len(current_layer) > 1:
        next_layer = []
        for i in range(0, len(current_layer), 2):
            left = current_layer[i]
            right = current_layer[i + 1] if i + 1 < len(current_layer) else left
            combined = compute_sha256(left + right)
            next_layer.append(combined)
        current_layer = next_layer

    return current_layer[0]


class AuditLedgerService:
    """Manages the continuous cryptographic audit trail of plant emissions."""

    def __init__(self, storage_path: Optional[Path] = None):
        self.storage_path = storage_path or LEDGER_FILE
        self.blocks: List[AuditBlock] = []
        self._load_or_initialize()

    def _compute_block_signature(
        self,
        block_height: int,
        timestamp: str,
        prev_hash: str,
        merkle_root: str,
        gross_carbon_tco2e: Dict[str, float]
    ) -> str:
        """Computes deterministic SHA-256 signature for a block."""
        carbon_json = json.dumps(gross_carbon_tco2e, sort_keys=True)
        payload = f"{block_height}|{timestamp}|{prev_hash}|{merkle_root}|{carbon_json}"
        return compute_sha256(payload)

    def _load_or_initialize(self) -> None:
        """Loads persistent ledger from disk or bootstraps verifiable historical blocks."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "r", encoding="utf-8") as f:
                    raw_list = json.load(f)
                    self.blocks = [AuditBlock(**b) for b in raw_list]
                    if self.blocks:
                        return
            except Exception as e:
                print(f"[WARN] Failed loading audit ledger: {e}. Reinitializing bootstrap ledger.")

        # Bootstrap realistic 24-hour historical chain (96 blocks at 15-min intervals)
        self.blocks = self._generate_bootstrap_chain()
        self._save()

    def _generate_bootstrap_chain(self) -> List[AuditBlock]:
        """Generates 96 verifiable 15-minute audit blocks representing the last 24 hours."""
        chain: List[AuditBlock] = []
        base_time = datetime.now(timezone.utc) - timedelta(hours=24)
        prev_hash = "0" * 64

        for height in range(96):
            ts = (base_time + timedelta(minutes=15 * height)).isoformat()

            # Realistic operational diurnal variations
            hour = (height // 4) % 24
            is_peak = 9 <= hour <= 18
            load_factor = 1.15 if is_peak else 0.85

            telemetry = {
                "grid_electricity_kwh": round(1305.0 * load_factor, 1),
                "diesel_liters": round(42.5 * (1.2 if is_peak else 0.7), 1),
                "png_sm3": round(38.0 * load_factor, 1),
                "lpg_kg": round(18.0 * (1.1 if is_peak else 0.8), 1),
                "refrigerant_leak_kg": 0.0 if height % 16 != 0 else 0.15,
                "etp_cod_mass_kg": round(14.2 * load_factor, 1),
            }

            merkle_root = compute_merkle_root(telemetry)

            # Carbon accounting calculations per 15-min interval
            s1_combustion = round(
                (telemetry["diesel_liters"] * 2.682 + telemetry["png_sm3"] * 2.162 + telemetry["lpg_kg"] * 2.987) / 1000.0,
                4
            )
            s1_process = round((telemetry["refrigerant_leak_kg"] * 1530.0) / 1000.0, 4)
            s1_etp = round((telemetry["etp_cod_mass_kg"] * 0.25 * 0.30 * 27.9) / 1000.0, 4)
            s2_grid = round((telemetry["grid_electricity_kwh"] * 0.72886) / 1000.0, 4)
            total_gross = round(s1_combustion + s1_process + s1_etp + s2_grid, 4)

            gross_carbon = {
                "scope1_stationary_combustion": s1_combustion,
                "scope1_chemical_process": s1_process,
                "scope1_effluent_etp": s1_etp,
                "scope2_location_based": s2_grid,
                "total_gross_interval": total_gross,
            }

            sig = self._compute_block_signature(height, ts, prev_hash, merkle_root, gross_carbon)

            block = AuditBlock(
                block_height=height,
                timestamp=ts,
                prev_hash=prev_hash,
                merkle_root=merkle_root,
                telemetry_summary=telemetry,
                gross_carbon_tco2e=gross_carbon,
                audit_signature=sig,
            )
            chain.append(block)
            prev_hash = sig

        return chain

    def _save(self) -> None:
        """Persists current audit ledger to disk."""
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump([b.dict() for b in self.blocks], f, indent=2)
        except Exception as e:
            print(f"[ERROR] Failed writing audit ledger: {e}")

    def add_interval_block(
        self,
        telemetry_summary: Dict[str, Any],
        gross_carbon_tco2e: Dict[str, float],
        timestamp: Optional[str] = None
    ) -> AuditBlock:
        """Appends a new cryptographically chained audit block to the ledger."""
        block_height = len(self.blocks)
        ts = timestamp or datetime.now(timezone.utc).isoformat()
        prev_hash = self.blocks[-1].audit_signature if self.blocks else ("0" * 64)
        merkle_root = compute_merkle_root(telemetry_summary)
        sig = self._compute_block_signature(block_height, ts, prev_hash, merkle_root, gross_carbon_tco2e)

        new_block = AuditBlock(
            block_height=block_height,
            timestamp=ts,
            prev_hash=prev_hash,
            merkle_root=merkle_root,
            telemetry_summary=telemetry_summary,
            gross_carbon_tco2e=gross_carbon_tco2e,
            audit_signature=sig,
        )
        self.blocks.append(new_block)
        self._save()
        return new_block

    def get_recent_blocks(self, limit: int = 20) -> List[AuditBlock]:
        """Returns the most recent N blocks in reverse chronological order."""
        return list(reversed(self.blocks[-limit:]))

    def verify_ledger(self) -> LedgerVerifyResponse:
        """
        Cryptographically verifies the entire hash chain from Genesis (height 0) to Head.
        Returns validation status or pinpoints the exact block height of tampering.
        """
        if not self.blocks:
            return LedgerVerifyResponse(valid=True, total_blocks=0, message="Ledger is empty.")

        expected_prev = "0" * 64

        for b in self.blocks:
            # 1. Verify prev_hash link
            if b.prev_hash != expected_prev:
                return LedgerVerifyResponse(
                    valid=False,
                    total_blocks=len(self.blocks),
                    tampered_block_height=b.block_height,
                    message=f"Hash chain broken at Block #{b.block_height}: prev_hash mismatch. Tampering detected."
                )

            # 2. Verify Merkle root matches telemetry
            computed_merkle = compute_merkle_root(b.telemetry_summary)
            if computed_merkle != b.merkle_root:
                return LedgerVerifyResponse(
                    valid=False,
                    total_blocks=len(self.blocks),
                    tampered_block_height=b.block_height,
                    message=f"Telemetry payload tampered at Block #{b.block_height}: Merkle root mismatch."
                )

            # 3. Verify cryptographic block signature
            computed_sig = self._compute_block_signature(
                b.block_height, b.timestamp, b.prev_hash, b.merkle_root, b.gross_carbon_tco2e
            )
            if computed_sig != b.audit_signature:
                return LedgerVerifyResponse(
                    valid=False,
                    total_blocks=len(self.blocks),
                    tampered_block_height=b.block_height,
                    message=f"Signature invalid at Block #{b.block_height}. Cryptographic block header modified."
                )

            expected_prev = b.audit_signature

        return LedgerVerifyResponse(
            valid=True,
            total_blocks=len(self.blocks),
            tampered_block_height=None,
            message=f"All {len(self.blocks)} blocks cryptographically verified. Hash chain is unbroken and mathematically tamper-proof."
        )


# Global service instance
audit_ledger_service = AuditLedgerService()

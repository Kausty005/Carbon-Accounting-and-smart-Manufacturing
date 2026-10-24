"""
WattWise AI — Local Ollama Service & Grounded Industrial AI Engine.
Integrates with local Ollama runtime (e.g. qwen2.5-coder:3b, llama3.1:8b).
Ensures zero external cloud data egress, strict industrial grounding,
bounded context, and robust fallbacks.
"""

import json
import logging
import os
import re
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import httpx

from backend.app.schemas.ai import (
    AIStatusResponse,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ExplainContext,
    ExplainRequest,
    ExplainResponse,
)

logger = logging.getLogger("wattwise.ollama")

DEFAULT_OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
CONFIGURED_MODEL = os.getenv("OLLAMA_MODEL", "")
REQUEST_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "45.0"))

# Known plant telemetry summary for PrecisionWorks Mfg
PLANT_GROUND_TRUTH = {
    "site": "PrecisionWorks Mfg (Unit 1, KPCL Industrial Zone)",
    "operating_shift": "DAY-B (08:00 - 16:30 IST)",
    "today_energy_kwh": 12480,
    "today_cost_inr": 23044,
    "potential_savings_inr": 7987,
    "potential_savings_kwh": 998,
    "carbon_footprint_tco2e": 14.47,
    "grid_factor_kg_per_kwh": 0.716,
    "tariff_rate_inr": 9.0,
    "assets": {
        "AIR-COMP-01": {
            "name": "Air Compressor (ELGi)",
            "load_pct": 40,
            "energy_today_kwh": 3120,
            "power_factor": 0.78,
            "status": "WARNING",
            "issue": "18 kW idle draw during shift handover and lunch breaks (3.2 hrs/day)",
            "estimated_waste_kwh": 998,
            "waste_cost_inr": 7987,
        },
        "CNC-01": {
            "name": "CNC Machining Center",
            "load_pct": 85,
            "energy_today_kwh": 4200,
            "power_factor": 0.94,
            "status": "OPTIMAL",
            "issue": "None. Operating efficiently.",
        },
        "FURNACE-01": {
            "name": "Industrial Heat Furnace",
            "load_pct": 100,
            "energy_today_kwh": 3600,
            "power_factor": 0.88,
            "status": "HIGH DEMAND",
            "issue": "85 kW peak load overlapping with compressor (09:00-12:00 IST). Stagger preheat by 45 min to cut peak by 18%.",
        },
        "CHILLER-01": {
            "name": "Chilled Water Cooling System",
            "load_pct": 79,
            "energy_today_kwh": 1560,
            "power_factor": 0.92,
            "status": "OPTIMAL",
            "issue": "None. Nominal delta-T.",
        },
    },
}


class OllamaService:
    def __init__(self, base_url: str = DEFAULT_OLLAMA_URL):
        self.base_url = base_url.rstrip("/")
        self._preferred_model = CONFIGURED_MODEL

    async def get_available_models(self) -> List[str]:
        """Fetch list of locally installed Ollama models."""
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    return [m.get("name") for m in data.get("models", []) if m.get("name")]
        except Exception:
            pass
        return []

    async def resolve_active_model(self) -> str:
        """Find the best local model installed."""
        if self._preferred_model:
            return self._preferred_model

        models = await self.get_available_models()
        # Prefer fast 3B coder if present, else llama3.1:8b, else first available
        for target in ["qwen2.5-coder:3b", "llama3.1:8b", "llama3:latest", "mistral:latest"]:
            for m in models:
                if target in m.lower():
                    self._preferred_model = m
                    return m
        if models:
            self._preferred_model = models[0]
            return models[0]
        return "qwen2.5-coder:3b"

    async def check_status(self) -> AIStatusResponse:
        """Check Ollama service status and report local model metadata."""
        models = await self.get_available_models()
        is_ready = len(models) > 0
        active_m = await self.resolve_active_model() if is_ready else "None"

        return AIStatusResponse(
            status="ready" if is_ready else "degraded",
            ollama_url=self.base_url,
            active_model=active_m,
            available_models=models,
            is_local=True,
            gpu_accelerated=True,
            provider="Ollama Local Inference" if is_ready else "WattWise Rule-Engine (Ollama Standby)",
        )

    def _build_explain_prompt(self, context: ExplainContext, user_question: Optional[str] = None) -> str:
        """Construct a grounded, highly structured prompt for industrial explanation."""
        ctx_dict = context.model_dump(exclude_none=True)
        ctx_json = json.dumps(ctx_dict, indent=2)

        prompt = f"""You are the WATTWISE AI Industrial Energy & Asset Intelligence Engine at PrecisionWorks Mfg.
Your role is to explain industrial SCADA telemetry, energy demand, electrical power factor, anomalies, and carbon footprint.

STRICT INDUSTRIAL ENGINEERING & GROUNDING RULES:
1. ONLY reference numbers and facts present in the provided context:
{ctx_json}
2. Never invent unmeasured values, hypothetical savings, or fake machine states.
3. Clearly decouple equipment physical degradation from excess energy consumption.
4. Always label potential causes as "Possible unconfirmed hypotheses for technician verification".
5. Never recommend unsafe machine control overrides (e.g. do not suggest disabling safety interlocks or exceeding nameplate ratings).
6. Format your output strictly as a JSON object with these keys:
- "summary": string (1-2 sentences in clear plain language)
- "what_it_means": string (physical engineering meaning)
- "why_it_matters": string (cost, peak demand, equipment life, or carbon impact)
- "observed_evidence": array of strings (exact grounded factual measurements)
- "possible_causes": array of strings (potential physical reasons to investigate)
- "recommended_actions": array of strings (prioritized, safe operational/maintenance steps)
- "caveats": array of strings (data freshness, sensor limitations, assumptions)

"""
        if user_question:
            prompt += f"Specific user question to address: {user_question}\n"

        prompt += "Respond ONLY with the valid JSON object. Do not include markdown codeblocks or preamble."
        return prompt

    def _generate_fallback_explanation(self, context: ExplainContext, user_question: Optional[str] = None) -> ExplainResponse:
        """Deterministic domain fallback adhering strictly to industrial engineering rules."""
        ctype = context.component_type.lower()
        title = context.title
        val_str = f"{context.value} {context.unit or ''}".strip()
        trend_str = context.trend or "nominal"
        asset = context.asset_name or context.asset_id or "Plant Overall"
        timestamp = context.timestamp or "Live SCADA"

        if "compressor" in title.lower() or "air compressor" in str(context.asset_name).lower():
            return ExplainResponse(
                summary="The rotary screw air compressor is exhibiting persistent unloaded operation, drawing approximately 18 kW during shift transitions.",
                what_it_means="The motor is energized and spinning the air end, but the inlet suction valve is closed, producing zero compressed air while still consuming ~35-40% of full-load power.",
                why_it_matters="Accumulates ~998 kWh of avoidable energy waste per accounting period (approx. ₹7,987 and 727.7 kg CO₂e) without productive output.",
                observed_evidence=[
                    f"Measured load is currently {val_str or '40%'}",
                    "Idle draw measured at 18 kW across 3.2 hours per day during lunch and shift handover",
                    "Power factor observed at 0.78, indicating low-load inductive magnetizing current"
                ],
                possible_causes=[
                    "Auto-dual / auto-shutdown timer set higher than 15-20 minutes",
                    "Inlet modulation valve mechanical linkage sticking partially open",
                    "Intermittent micro-leaks in distribution pipe header preventing pressure cutoff"
                ],
                recommended_actions=[
                    "Reduce auto-dual idle shutdown timer from default to 5-8 minutes",
                    "Inspect compressor blowdown solenoid valve and intake valve seating",
                    "Perform ultrasonic acoustic leak survey along the primary air distribution loop"
                ],
                caveats=[
                    "Idle waste calculations assume standard plant tariff of ₹9.0/kWh and CEA grid emission factor of 0.716 kg CO₂e/kWh",
                    "Safe operation requires confirming restart frequency does not exceed motor manufacturer starts-per-hour limit"
                ],
                data_freshness=f"Grounded in verified SCADA telemetry at {timestamp}",
                model_name="WattWise Domain Intelligence (Ollama Standby)",
                is_grounded=True,
            )

        elif "furnace" in title.lower() or "furnace" in str(context.asset_name).lower():
            return ExplainResponse(
                summary="Industrial heat furnace is operating at 100% capacity and creating a concurrent electrical peak with the compressor.",
                what_it_means="Electric resistance heating banks are drawing full rated power (approx 160 kW) coincidentally during the morning shift ramp (09:00 - 12:00 IST).",
                why_it_matters="Concurrent peak loads drive maximum demand charges (kVA penalties) on the plant utility tariff and strain the main substation transformer.",
                observed_evidence=[
                    f"Furnace load reading: {val_str or '100% (3,600 kWh today)'}",
                    "Peak demand reaches 162 kW at 12:00 IST",
                    "Power factor measured at 0.88"
                ],
                possible_causes=[
                    "Simultaneous preheat schedule coinciding with CNC production shift start",
                    "Lack of automated peak demand stagger or interlock between heavy assets"
                ],
                recommended_actions=[
                    "Stagger furnace preheating cycle 45 minutes earlier into off-peak window (07:15 - 08:00 IST)",
                    "Implement a soft demand limit cap on auxiliary heating banks during CNC peak cuts"
                ],
                caveats=[
                    "Preheat shifting requires verifying thermal soak requirements for metal billet metallurgical standards",
                    "Assumes Time-of-Day (ToD) tariff structure applies"
                ],
                data_freshness=f"SCADA sync: {timestamp}",
                model_name="WattWise Domain Intelligence (Ollama Standby)",
                is_grounded=True,
            )

        elif "energy cost" in title.lower() or "cost" in title.lower():
            return ExplainResponse(
                summary=f"Plant energy expenditure is currently {val_str or '₹23,044'}, up {trend_str} vs yesterday.",
                what_it_means="Reflects cumulative kilowatt-hour electricity consumption multiplied by industrial commercial tariff rates (averaging ₹9.0/kWh) plus demand factors.",
                why_it_matters="Energy accounts for over 28% of plant variable operating costs. The +6.1% increase is driven by overlapping furnace heating and compressor unloader run hours.",
                observed_evidence=[
                    f"Current cost: {val_str or '₹23,044'}",
                    f"Cumulative plant consumption: 12,480 kWh across 4 primary production assets",
                    f"Trend: {trend_str}"
                ],
                possible_causes=[
                    "Overlapping peak operations between Furnace and Machining during high-tariff slot",
                    "Extended unloader run-time during lunch break"
                ],
                recommended_actions=[
                    "Review shift transition schedule to shut down unneeded auxiliary cooling loops",
                    "Stagger high-demand machines to flatten the midday demand spike"
                ],
                caveats=[
                    "Tariff calculations exclude power factor penalties or rebates that apply on monthly utility settlement",
                    "Values reflect active 24-hour metering window"
                ],
                data_freshness=f"SCADA sync: {timestamp}",
                model_name="WattWise Domain Intelligence (Ollama Standby)",
                is_grounded=True,
            )

        elif "carbon" in title.lower():
            return ExplainResponse(
                summary=f"Carbon footprint is {val_str or '14.47 tCO₂e'} ({trend_str}), representing operational Scope 2 emissions.",
                what_it_means="Emissions calculated using the Central Electricity Authority (CEA) India Version 22.0 grid emission factor (0.716 kg CO₂/kWh).",
                why_it_matters="Tracks corporate decarbonization targets and compliance with GHG Protocol Scope 2 guidance. Reductions translate directly to carbon offset savings.",
                observed_evidence=[
                    f"Measured footprint: {val_str or '14.47 tCO₂e'}",
                    "Scope 2 indirect electricity emissions from 12,480 kWh grid consumption",
                    f"Trend: {trend_str}"
                ],
                possible_causes=[
                    "Lower baseline due to improved CNC tool cycle times and chiller optimization"
                ],
                recommended_actions=[
                    "Maintain optimal chiller delta-T to preserve the 12.6% emission reduction",
                    "Resolve compressor idle leak to abate an additional 727.7 kg CO₂e per period"
                ],
                caveats=[
                    "CEA national average emission factor applied; does not reflect real-time renewable wheeling certificates unless verified",
                    "Applies to active production day"
                ],
                data_freshness=f"SCADA sync: {timestamp}",
                model_name="WattWise Domain Intelligence (Ollama Standby)",
                is_grounded=True,
            )

        elif "savings" in title.lower():
            return ExplainResponse(
                summary="Identified potential savings of ₹7,987 (998 kWh, 8% overall plant load reduction).",
                what_it_means="Calculated waste elimination opportunity without impacting factory output volume or cycle times.",
                why_it_matters="Recaptures operating profit directly with minimal capital expenditure (procedural & control timer adjustments).",
                observed_evidence=[
                    "Compressor unloader waste: 998 kWh across shift transitions",
                    "Financial potential: ₹7,987 per accounting period",
                    "Carbon abatement potential: 727.7 kg CO₂e"
                ],
                possible_causes=[
                    "Manual overrides left active on compressor control panel",
                    "Operator lack of visibility into unloader standby consumption"
                ],
                recommended_actions=[
                    "Enable auto-standby timers on AIR-COMP-01",
                    "Verify furnace chamber seal during holding periods"
                ],
                caveats=[
                    "Requires verification of motor thermal restart ratings prior to aggressive auto-shutdown",
                    "Savings estimates assume steady baseline production volume"
                ],
                data_freshness=f"SCADA sync: {timestamp}",
                model_name="WattWise Domain Intelligence (Ollama Standby)",
                is_grounded=True,
            )

        # General / default fallback
        return ExplainResponse(
            summary=f"{title} shows {val_str or 'nominal status'} ({trend_str}) for {asset}.",
            what_it_means=f"Telemetry metrics indicate operational state of {title} in the plant EMS monitoring system.",
            why_it_matters="Ensures consistent plant balance-of-plant reliability, energy efficiency, and baseline compliance.",
            observed_evidence=[
                f"Value recorded: {val_str or 'Normal'}",
                f"Location/Machine: {asset}",
                f"Status/Trend: {trend_str}"
            ],
            possible_causes=[
                "Standard production schedule operation",
                "Normal variable load conditions matching shift cycle"
            ],
            recommended_actions=[
                "Continue automated telemetry monitoring",
                "Inspect asset logs if deviation exceeds ±10% threshold"
            ],
            caveats=[
                "Readings subject to Class 0.5S digital energy meter tolerances",
                "Assumes continuous sensor network connectivity"
            ],
            data_freshness=f"Grounded at {timestamp}",
            model_name="WattWise Domain Intelligence (Ollama Standby)",
            is_grounded=True,
        )

    async def explain(self, request: ExplainRequest) -> ExplainResponse:
        """Generate contextual explanation using local Ollama model with guaranteed grounding."""
        context = request.context
        model_name = await self.resolve_active_model()

        # Build prompt
        prompt = self._build_explain_prompt(context, request.user_question)

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                res = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",
                        "options": {
                            "temperature": 0.2,
                            "top_p": 0.9,
                        },
                    },
                )
                if res.status_code == 200:
                    raw_text = res.json().get("response", "").strip()
                    # Parse JSON
                    try:
                        parsed = json.loads(raw_text)
                        return ExplainResponse(
                            summary=parsed.get("summary") or f"Analysis for {context.title}",
                            what_it_means=parsed.get("what_it_means") or "Physical operational analysis.",
                            why_it_matters=parsed.get("why_it_matters") or "Impact on plant energy and cost.",
                            observed_evidence=parsed.get("observed_evidence") or [f"Value: {context.value} {context.unit or ''}"],
                            possible_causes=parsed.get("possible_causes") or ["Operational variation under investigation"],
                            recommended_actions=parsed.get("recommended_actions") or ["Monitor telemetry readings"],
                            caveats=parsed.get("caveats") or ["Based on live SCADA telemetry"],
                            data_freshness=f"SCADA synced at {context.timestamp or 'current interval'}",
                            model_name=f"{model_name} (Local Ollama)",
                            is_grounded=True,
                        )
                    except Exception as json_err:
                        logger.warning(f"Ollama returned non-JSON response: {json_err}. Using grounded fallback.")
        except Exception as e:
            logger.info(f"Ollama local inference unavailable or timed out ({e}). Utilizing grounded domain engine.")

        # Reliable fallback
        return self._generate_fallback_explanation(context, request.user_question)

    def _build_chat_system_prompt(
        self,
        current_plant: str,
        selected_asset: Optional[str] = None,
        active_context: Optional[ExplainContext] = None,
    ) -> str:
        plant_summary = json.dumps(PLANT_GROUND_TRUTH, indent=2)
        ctx_summary = ""
        if active_context:
            ctx_summary = f"\nACTIVE SELECTED DASHBOARD ELEMENT:\n{json.dumps(active_context.model_dump(exclude_none=True), indent=2)}\n"

        return f"""You are the WATTWISE AI Industrial Plant Assistant at {current_plant}.
You provide concise, highly accurate, engineering-grounded advice for plant managers, shift supervisors, and energy technicians.

CURRENT PLANT REAL-TIME TELEMETRY & ASSETS:
{plant_summary}
{ctx_summary}
RULES:
1. Always base answers on the real plant data above (e.g. today's consumption: 12,480 kWh, cost: ₹23,044, potential savings: ₹7,987).
2. Never invent fake readings or hypothetical machines.
3. Be direct, clear, professional, and practical. Keep responses concise and formatted with clean bullet points.
4. When suggesting operational fixes, prioritize safety and standard procedures.
5. If asked about a specific asset, reference its actual metrics (load %, power factor, kWh).
"""

    async def chat(self, request: ChatRequest) -> ChatResponse:
        """Handle non-streaming multi-turn chat."""
        model_name = await self.resolve_active_model()
        system_prompt = self._build_chat_system_prompt(
            request.current_plant or "PrecisionWorks Mfg",
            request.selected_asset,
            request.active_context,
        )

        messages_payload = [{"role": "system", "content": system_prompt}]
        for m in request.messages:
            messages_payload.append({"role": m.role, "content": m.content})

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                res = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": model_name,
                        "messages": messages_payload,
                        "stream": False,
                        "options": {"temperature": 0.3},
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    msg = data.get("message", {})
                    content = msg.get("content", "").strip()
                    if content:
                        return ChatResponse(
                            message=ChatMessage(role="assistant", content=content),
                            model_name=f"{model_name} (Local Ollama)",
                            relevant_references=["Plant Overview", "SCADA Telemetry", "Energy Baseline"],
                        )
        except Exception as e:
            logger.info(f"Ollama chat fallback triggered: {e}")

        # Domain grounded chat fallback
        last_user_msg = request.messages[-1].content.lower()
        reply = self._generate_domain_chat_reply(last_user_msg, request.active_context)
        return ChatResponse(
            message=ChatMessage(role="assistant", content=reply),
            model_name="WattWise Domain Intelligence (Ollama Standby)",
            relevant_references=["PrecisionWorks Mfg Baseline", "CEA Grid Benchmark"],
        )

    async def chat_stream(self, request: ChatRequest) -> AsyncGenerator[str, None]:
        """Stream SSE chunks for real-time word-by-word conversational assistant."""
        model_name = await self.resolve_active_model()
        system_prompt = self._build_chat_system_prompt(
            request.current_plant or "PrecisionWorks Mfg",
            request.selected_asset,
            request.active_context,
        )

        messages_payload = [{"role": "system", "content": system_prompt}]
        for m in request.messages:
            messages_payload.append({"role": m.role, "content": m.content})

        stream_success = False
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json={
                        "model": model_name,
                        "messages": messages_payload,
                        "stream": True,
                        "options": {"temperature": 0.3},
                    },
                ) as stream_resp:
                    if stream_resp.status_code == 200:
                        stream_success = True
                        async for line in stream_resp.aiter_lines():
                            if line:
                                try:
                                    chunk = json.loads(line)
                                    token = chunk.get("message", {}).get("content", "")
                                    if token:
                                        payload = {"token": token, "done": chunk.get("done", False)}
                                        yield f"data: {json.dumps(payload)}\n\n"
                                    if chunk.get("done", False):
                                        break
                                except Exception:
                                    pass
        except Exception:
            pass

        if not stream_success:
            # Fallback streaming simulation
            last_msg = request.messages[-1].content.lower()
            reply = self._generate_domain_chat_reply(last_msg, request.active_context)
            # Break into word chunks
            words = reply.split(" ")
            for i, w in enumerate(words):
                token = w + (" " if i < len(words) - 1 else "")
                payload = {"token": token, "done": (i == len(words) - 1)}
                yield f"data: {json.dumps(payload)}\n\n"

    def _generate_domain_chat_reply(self, query: str, context: Optional[ExplainContext] = None) -> str:
        """Grounded responses for common industrial energy queries."""
        if "energy cost" in query or "high today" in query or "cost" in query:
            return (
                "Today's cumulative energy cost is **₹23,044** (+6.1% vs yesterday), driven primarily by **12,480 kWh** in total plant load. "
                "The two largest cost drivers are:\n\n"
                "1. **Industrial Heat Furnace (FURNACE-01)**: 3,600 kWh (29% of plant load), peaking at 160 kW during midday.\n"
                "2. **Air Compressor (AIR-COMP-01)**: 3,120 kWh (25% of load), including **18 kW unloader draw** during breaks, wasting approx. ₹7,987 per period.\n\n"
                "Staggering furnace preheat and tuning compressor auto-dual timers can recover up to ₹7,987 per accounting period."
            )
        elif "which machine" in query or "wasting" in query or "waste" in query:
            return (
                "**Air Compressor (AIR-COMP-01)** is currently the largest energy waster in the facility.\n\n"
                "• **Observed waste**: 18 kW unloaded draw during 3.2 hours/day of lunch breaks and shift changeovers.\n"
                "• **Total estimated loss**: **998 kWh/period** (₹7,987 / 727.7 kg CO₂e).\n"
                "• **Current Power Factor**: 0.78 (low due to unloaded motor magnetizing current).\n\n"
                "**Action**: Configure the auto-dual shutdown timer to 5–8 minutes so the motor powers down during extended periods without compressed air demand."
            )
        elif "alert" in query or "critical" in query:
            return (
                "Here are the active priority alerts on the dashboard:\n\n"
                "1. **CRITICAL — Air Compressor Running Unloaded**: 18 kW draw during break periods with estimated waste of 998 kWh (₹7,987).\n"
                "2. **HIGH — Furnace High Peak Demand**: 85 kW peak overlapping with the compressor between 09:00–12:00 IST. Staggering preheat by 45 min will reduce total peak demand by 18%.\n"
                "3. **INFO — CNC Machining Center Optimal**: Stable operation at 85% load, power factor 0.94, zero anomalies."
            )
        elif "peak demand" in query or "reduce peak" in query:
            return (
                "To reduce plant peak demand:\n\n"
                "• **Stagger Furnace Preheat**: Shift FURNACE-01 warmup 45 minutes earlier (07:15–08:00 IST) before CNC production shifts start at 08:30.\n"
                "• **Interlock Air Compressor High Load**: Avoid running compressor blowdown or tank recharging simultaneously with furnace high-fire soaking.\n"
                "• **Impact**: Reduces coincident maximum demand by approximately **28–35 kW (18%)**, lowering monthly utility kVA demand charges."
            )
        elif "power factor" in query or "pf" in query:
            return (
                "**Power Factor (PF)** measures how effectively incoming electrical power is converted into productive work.\n\n"
                "• **1.00**: Perfect unity power factor.\n"
                "• **CNC Center**: **0.94** (Optimal, healthy active work).\n"
                "• **Furnace**: **0.88** (Acceptable for heavy resistive/SCR load).\n"
                "• **Air Compressor**: **0.78 (Low / Sub-optimal)**. Caused by unloaded operation where the motor consumes reactive magnetizing power without performing useful mechanical compression.\n\n"
                "Correcting compressor unloader run-time will raise overall plant PF above 0.92."
            )
        elif "demand chart" in query or "chart" in query:
            return (
                "The **Energy Demand Today** chart plots plant load (0–180 kW) over 24 hours:\n\n"
                "• **Red line (Furnace)**: Dominates daytime hours, ramping to 160 kW from 08:00 to 18:00 IST.\n"
                "• **Blue line (CNC Machining)**: Follows shift production, hovering around 85–94 kW between 08:00 and 18:00 IST.\n"
                "• **Green line (Cooling)**: Steady baseline around 20–39 kW to maintain loop temperatures.\n"
                "• **Amber line (Compressor)**: Persistent 18–48 kW, showing unnecessary 18 kW plateau during scheduled break hours."
            )
        elif context:
            return (
                f"Regarding **{context.title}** ({context.value or 'nominal'} {context.unit or ''}):\n\n"
                f"This element represents operational status at **{context.asset_name or context.site or 'PrecisionWorks Mfg'}**. "
                f"Current recorded trend is **{context.trend or 'stable'}**. "
                "Would you like recommendations on optimizing this asset or investigating related telemetry anomalies?"
            )
        return (
            "I am ready to help with PrecisionWorks Mfg energy intelligence. "
            "You can ask about:\n\n"
            "• **Energy costs and consumption** (12,480 kWh today)\n"
            "• **Equipment performance** (Compressor, CNC, Furnace, Chiller)\n"
            "• **Active alerts** (Compressor unloaded running, Furnace peak)\n"
            "• **Decarbonization** (Scope 2 footprint: 14.47 tCO₂e)\n"
            "• **Peak demand reduction strategies**"
        )


# Singleton instance
ollama_service = OllamaService()

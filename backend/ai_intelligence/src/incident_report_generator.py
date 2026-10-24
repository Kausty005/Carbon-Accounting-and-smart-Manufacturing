"""
Incident Report Generator (PDF & Word DOCX).
Produces professional, audit-compliant engineering incident reports
for industrial equipment anomalies and energy intelligence.
"""

import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional
import io

# Word DOCX generation
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# PDF generation using PyMuPDF (native vector rendering)
import pymupdf

# Chart rendering for report attachment
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .incident_store import SENSOR_METADATA
from .config import GRID_EMISSION_FACTOR_KG_PER_KWH, INDUSTRIAL_TARIFF_INR_PER_KWH, ESTIMATE_DISCLAIMER


def _set_cell_background(cell, hex_color: str):
    """Set background color of a docx table cell."""
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color.replace("#", ""))
    tcPr.append(shd)


def _render_incident_trend_chart(
    incident: Dict[str, Any],
    telemetry_points: List[Dict[str, Any]],
) -> Optional[bytes]:
    """Render a clean matplotlib sensor trend chart as PNG bytes for report embedding."""
    if not telemetry_points or len(telemetry_points) < 3:
        return None

    try:
        times = [p["timestamp"][-8:] for p in telemetry_points]
        powers = [p.get("power_consumption_kw") or 0 for p in telemetry_points]
        eq_id = str(incident.get("equipment_id", "")).upper()
        eq_type = str(incident.get("equipment_type", "")).lower()

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7.5, 3.8), sharex=True)
        fig.patch.set_facecolor("#ffffff")

        # AX1: Power
        ax1.plot(times, powers, color="#2563eb", lw=1.5, label="Power (kW)")
        ax1.set_ylabel("Power (kW)", color="#2563eb", fontsize=8)
        ax1.grid(True, alpha=0.25)
        ax1.tick_params(labelsize=7)

        # Machine-specific secondary & tertiary signals
        if "FURNACE" in eq_id or eq_type == "furnace":
            temps = [p.get("temperature_c") or 0 for p in telemetry_points]
            setpoints = [p.get("temp_setpoint_c") or 0 for p in telemetry_points]
            ax1_twin = ax1.twinx()
            ax1_twin.plot(times, temps, color="#dc2626", lw=1.5, label="Temp (°C)")
            ax1_twin.plot(times, setpoints, color="#f59e0b", lw=1.2, linestyle="--", label="Setpoint (°C)")
            ax1_twin.set_ylabel("Temp (°C)", color="#dc2626", fontsize=8)
            ax1_twin.tick_params(labelsize=7)
            doors = [p.get("door_open") or 0 for p in telemetry_points]
            ax2.step(times, doors, color="#7c3aed", lw=1.5, where="post", label="Door Open")
            ax2.set_ylabel("Door Open (0/1)", color="#7c3aed", fontsize=8)
        elif "COMP" in eq_id or eq_type == "air_compressor":
            press = [p.get("discharge_pressure_bar") or 0 for p in telemetry_points]
            flows = [p.get("airflow_cfm") or 0 for p in telemetry_points]
            ax1_twin = ax1.twinx()
            ax1_twin.plot(times, press, color="#059669", lw=1.5, label="Pressure (bar)")
            ax1_twin.set_ylabel("Pressure (bar)", color="#059669", fontsize=8)
            ax1_twin.tick_params(labelsize=7)
            ax2.plot(times, flows, color="#0284c7", lw=1.5, label="Airflow (CFM)")
            ax2.set_ylabel("Airflow (CFM)", color="#0284c7", fontsize=8)
        elif "CNC" in eq_id or eq_type == "cnc_machine":
            rpm = [p.get("spindle_rpm") or 0 for p in telemetry_points]
            vibs = [p.get("vibration_mm_s") or 0 for p in telemetry_points]
            ax1_twin = ax1.twinx()
            ax1_twin.plot(times, rpm, color="#7c3aed", lw=1.5, label="Spindle RPM")
            ax1_twin.set_ylabel("Spindle RPM", color="#7c3aed", fontsize=8)
            ax1_twin.tick_params(labelsize=7)
            ax2.plot(times, vibs, color="#dc2626", lw=1.5, label="Vibration (mm/s)")
            ax2.set_ylabel("Vibration (mm/s)", color="#dc2626", fontsize=8)
        elif "CHILLER" in eq_id or eq_type == "chiller":
            supply = [p.get("supply_temp_c") or 0 for p in telemetry_points]
            ret = [p.get("return_temp_c") or 0 for p in telemetry_points]
            ax1_twin = ax1.twinx()
            ax1_twin.plot(times, supply, color="#0284c7", lw=1.5, label="Supply Temp (°C)")
            ax1_twin.plot(times, ret, color="#dc2626", lw=1.5, linestyle="--", label="Return Temp (°C)")
            ax1_twin.set_ylabel("Water Temp (°C)", color="#0284c7", fontsize=8)
            ax1_twin.tick_params(labelsize=7)
            flows = [p.get("water_flow_m3h") or 0 for p in telemetry_points]
            ax2.plot(times, flows, color="#059669", lw=1.5, label="Water Flow (m³/h)")
            ax2.set_ylabel("Flow (m³/h)", color="#059669", fontsize=8)
        else:
            temps = [p.get("temperature_c") or 0 for p in telemetry_points]
            vibs = [p.get("vibration_mm_s") or 0 for p in telemetry_points]
            ax1_twin = ax1.twinx()
            ax1_twin.plot(times, temps, color="#dc2626", lw=1.5, linestyle="--", label="Temp (°C)")
            ax1_twin.set_ylabel("Temp (°C)", color="#dc2626", fontsize=8)
            ax1_twin.tick_params(labelsize=7)
            ax2.plot(times, vibs, color="#7c3aed", lw=1.5, label="Vibration (mm/s)")
            ax2.set_ylabel("Vibration (mm/s)", color="#7c3aed", fontsize=8)

        ax2.set_xlabel("Time (HH:MM:SS)", fontsize=8)
        ax2.grid(True, alpha=0.25)
        ax2.tick_params(labelsize=7)

        # Highlight incident timestamp
        inc_ts_short = str(incident.get("timestamp", ""))[-8:]
        if inc_ts_short in times:
            idx = times.index(inc_ts_short)
            ax1.axvline(idx, color="#ef4444", linestyle=":", lw=1.8, label="Incident")
            ax2.axvline(idx, color="#ef4444", linestyle=":", lw=1.8, label="Incident")

        step = max(1, len(times) // 8)
        ax2.set_xticks(range(0, len(times), step))
        ax2.set_xticklabels(times[::step], rotation=20, ha="right")

        plt.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=200, bbox_inches="tight")
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()
    except Exception:
        return None


def generate_docx_incident_report(
    incident: Dict[str, Any],
    telemetry_points: List[Dict[str, Any]],
    output_path: Path,
) -> Path:
    """
    Generate professional Microsoft Word (.docx) incident report.
    Adheres strictly to the 15 required report sections.
    """
    doc = docx.Document()

    # Page Margins
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Styles & Colors
    c_primary = RGBColor(15, 23, 42)      # Slate 900
    c_accent = RGBColor(37, 99, 235)      # Blue 600
    c_critical = RGBColor(220, 38, 38)    # Red 600
    c_muted = RGBColor(100, 116, 139)     # Slate 500

    # 1. Header Banner / Title
    p_header = doc.add_paragraph()
    p_header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run_brand = p_header.add_run("PRECISIONWORKS MANUFACTURING — SCADA INTELLIGENCE\n")
    run_brand.font.size = Pt(8.5)
    run_brand.font.bold = True
    run_brand.font.color.rgb = c_muted

    title_p = doc.add_paragraph()
    title_run = title_p.add_run("EQUIPMENT ANOMALY INCIDENT REPORT")
    title_run.font.size = Pt(20)
    title_run.font.bold = True
    title_run.font.color.rgb = c_primary

    # Metadata Bar
    inc_id = incident.get("incident_id", "INC-UNKNOWN")
    gen_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    
    p_meta = doc.add_paragraph()
    r_id = p_meta.add_run(f"Incident ID: {inc_id}   |   Report Generated: {gen_time}\n")
    r_id.font.size = Pt(9.5)
    r_id.font.bold = True
    r_id.font.color.rgb = c_accent

    # Safety Warning Box
    tbl_warn = doc.add_table(rows=1, cols=1)
    tbl_warn.alignment = WD_TABLE_ALIGNMENT.CENTER
    c_warn = tbl_warn.rows[0].cells[0]
    _set_cell_background(c_warn, "FEF2F2")
    p_w = c_warn.paragraphs[0]
    rw = p_w.add_run("WARNING — OPERATIONAL SAFETY NOTICE\n")
    rw.font.bold = True
    rw.font.size = Pt(9)
    rw.font.color.rgb = c_critical
    rw_desc = p_w.add_run(
        "Model alerts and evidence are algorithmic decision-support outputs and require physical verification by "
        "certified maintenance engineers. For high or critical severity events, follow standard plant emergency shutoff "
        "and lockout/tagout (LOTO) procedures rather than relying on automated scores alone."
    )
    rw_desc.font.size = Pt(8.5)

    doc.add_paragraph()  # Spacing

    # 2. Executive Incident Summary
    h2 = doc.add_heading("1. Executive Incident Summary", level=2)
    h2.runs[0].font.color.rgb = c_primary

    sev = incident.get("severity", "medium").upper()
    atype = incident.get("anomaly_type", "unusual_telemetry").replace("_", " ").title()
    eq = incident.get("equipment_id", "UNKNOWN")
    eq_type = incident.get("equipment_type", "").replace("_", " ").title()
    ts = incident.get("timestamp", "UNKNOWN")
    is_waste = incident.get("is_energy_waste", False)
    provenance = incident.get("data_provenance", "synthetic_simulation")
    
    summary_text = (
        f"On {ts}, supervisory telemetry detected a {sev} severity {atype} event on machine {eq} ({eq_type or 'Industrial Asset'}). "
        f"The incident was identified using the {incident.get('model_name', 'Supervised Random Forest')} pipeline "
        f"(confidence score: {incident.get('model_score', 'N/A')}). "
        f"Energy waste classification: {'CONFIRMED EXCESS ENERGY WASTE' if is_waste else 'EQUIPMENT HEALTH ONLY (No Excess Energy Waste)'}. "
        f"Data provenance: {provenance.upper()} (Simulated telemetry benchmark, not real KPCL proprietary measurements). "
        f"Investigation status is currently: {incident.get('status', 'New')}."
    )
    doc.add_paragraph(summary_text)

    # 3. Equipment & Incident Specification Table
    h3 = doc.add_heading("2. Incident Specification", level=2)
    h3.runs[0].font.color.rgb = c_primary

    spec_table = doc.add_table(rows=7, cols=2)
    spec_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    spec_data = [
        ("Equipment Asset ID", eq),
        ("Equipment Category", eq_type or "General Manufacturing Asset"),
        ("Data Provenance", "SIMULATED TELEMETRY BENCHMARK (Simulated for Hackathon Demonstrator)"),
        ("Incident Timestamp", ts),
        ("Anomaly Classification", atype),
        ("Assigned Severity Level", sev),
        ("Energy Waste Status", "Excess Energy Waste Flagged" if is_waste else "Equipment Health Only (Decoupled from Energy Waste)"),
    ]
    for row_idx, (k, v) in enumerate(spec_data):
        cell_k, cell_v = spec_table.rows[row_idx].cells
        cell_k.text = k
        cell_k.paragraphs[0].runs[0].font.bold = True
        cell_k.paragraphs[0].runs[0].font.size = Pt(9)
        _set_cell_background(cell_k, "F8FAFC")
        cell_v.text = str(v)
        cell_v.paragraphs[0].runs[0].font.size = Pt(9)

    doc.add_paragraph()

    # 4. Sensor Evidence Table
    h4 = doc.add_heading("3. Sensor Telemetry & Evidence Matrix", level=2)
    h4.runs[0].font.color.rgb = c_primary

    sensor_readings = incident.get("sensor_readings", {})
    ev_table = doc.add_table(rows=1, cols=4)
    ev_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = ev_table.rows[0].cells
    hdr[0].text = "Sensor Parameter"
    hdr[1].text = "Measured Value"
    hdr[2].text = "Unit"
    hdr[3].text = "Nominal / Expected Range"
    for cell in hdr:
        _set_cell_background(cell, "1E293B")
        cell.paragraphs[0].runs[0].font.bold = True
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        cell.paragraphs[0].runs[0].font.size = Pt(8.5)

    for sensor_key, meta in SENSOR_METADATA.items():
        if sensor_key in sensor_readings:
            val = sensor_readings[sensor_key]
            row_cells = ev_table.add_row().cells
            row_cells[0].text = meta["name"]
            row_cells[1].text = str(val)
            row_cells[2].text = meta["unit"]
            row_cells[3].text = meta["nominal"]
            for c in row_cells:
                c.paragraphs[0].runs[0].font.size = Pt(8.5)

    doc.add_paragraph()

    # 5. Algorithmic Detection Evidence
    h5 = doc.add_heading("4. Algorithmic Evidence Trail", level=2)
    h5.runs[0].font.color.rgb = c_primary
    ev_list = incident.get("evidence", [])
    if ev_list:
        for ev_str in ev_list:
            doc.add_paragraph(ev_str, style="List Bullet")
    else:
        doc.add_paragraph("Multivariate sensor pattern deviated from historical baseline.")

    # 6. Possible Contributing Factors
    h6 = doc.add_heading("5. Possible Contributing Factors (Decision-Support Hypothesis)", level=2)
    h6.runs[0].font.color.rgb = c_primary
    doc.add_paragraph(
        "Note: The following factors represent statistical and engineering hypotheses and are NOT confirmed root causes:"
    )
    if "thermal" in atype.lower():
        doc.add_paragraph("Possible coolant valve blockage or inadequate fluid circulation rate.", style="List Bullet")
        doc.add_paragraph("Excessive friction or mechanical binding in continuous duty cycle.", style="List Bullet")
    elif "bearing" in atype.lower():
        doc.add_paragraph("Progressive raceway spalling, ball/roller defect, or lubricant starvation.", style="List Bullet")
        doc.add_paragraph("Shaft misalignment or dynamic mechanical unbalance under load.", style="List Bullet")
    elif "pressure" in atype.lower():
        doc.add_paragraph("Pneumatic fitting leak, damaged manifold seal, or regulator diaphragm tear.", style="List Bullet")
    else:
        doc.add_paragraph("Sensor communication drift, ADC calibration offset, or mechanical load fluctuation.", style="List Bullet")

    # 7. Recommended Actions
    h7 = doc.add_heading("6. Recommended Corrective & Inspection Actions", level=2)
    h7.runs[0].font.color.rgb = c_primary
    action = incident.get("recommended_action", "Perform visual inspection of machine subsystem.")
    doc.add_paragraph(action, style="List Bullet")
    doc.add_paragraph("Verify telemetry after restart and observe sensor readings for 15 minutes of continuous operation.", style="List Bullet")

    # 8. Energy Impact
    h8 = doc.add_heading("7. Energy & Carbon Emissions Impact", level=2)
    h8.runs[0].font.color.rgb = c_primary
    excess_kwh = incident.get("estimated_excess_energy_kwh")
    if excess_kwh is not None and excess_kwh > 0:
        cost_inr = round(excess_kwh * INDUSTRIAL_TARIFF_INR_PER_KWH, 2)
        co2_kg = round(excess_kwh * GRID_EMISSION_FACTOR_KG_PER_KWH, 2)
        doc.add_paragraph(f"Estimated Excess Energy Waste: {excess_kwh:.4f} kWh (Model estimate)")
        doc.add_paragraph(f"Avoidable Financial Cost: INR {cost_inr:.2f} (Tariff: INR {INDUSTRIAL_TARIFF_INR_PER_KWH}/kWh)")
        doc.add_paragraph(f"Scope 2 Carbon Impact: {co2_kg:.4f} kg CO2e (CEA India Grid Factor: {GRID_EMISSION_FACTOR_KG_PER_KWH} kg CO2e/kWh)")
    else:
        doc.add_paragraph(
            "This event represents a mechanical/sensor equipment health alert. "
            "Power consumption remained within nominal operating boundaries; zero excess energy waste was detected."
        )

    # 9. Supporting Sensor Trend Chart
    chart_png = _render_incident_trend_chart(incident, telemetry_points)
    if chart_png:
        doc.add_heading("8. Telemetry Trend Analysis (Pre- & Post-Incident Window)", level=2)
        chart_stream = io.BytesIO(chart_png)
        doc.add_picture(chart_stream, width=Inches(6.2))
        doc.add_paragraph()

    # 10. Technician Investigation & Sign-Off Section
    h10 = doc.add_heading("9. Technician Observations & Resolution Sign-Off", level=2)
    h10.runs[0].font.color.rgb = c_primary

    doc.add_paragraph(f"Current Status: {incident.get('status', 'New')}")
    doc.add_paragraph(f"Technician Notes: {incident.get('technician_notes') or 'None entered.'}")
    doc.add_paragraph(f"Resolution Notes: {incident.get('resolution_notes') or 'Pending investigation.'}")

    sign_table = doc.add_table(rows=3, cols=2)
    sign_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    sign_table.rows[0].cells[0].text = "Investigating Engineer: _________________________"
    sign_table.rows[0].cells[1].text = "Badge / Employee ID: _________________________"
    sign_table.rows[1].cells[0].text = "Action Taken: [  ] Repaired   [  ] Recalibrated   [  ] False Positive"
    sign_table.rows[1].cells[1].text = "Date Resolved: _______________________________"
    sign_table.rows[2].cells[0].text = "Plant Supervisor Sign-Off: ____________________"
    sign_table.rows[2].cells[1].text = "Signature: ___________________________________"
    for row in sign_table.rows:
        for c in row.cells:
            c.paragraphs[0].runs[0].font.size = Pt(8.5)

    doc.add_paragraph()

    # 11. Disclaimer & Methodology
    h11 = doc.add_heading("10. Methodology & Limitations", level=2)
    h11.runs[0].font.color.rgb = c_primary
    p_disc = doc.add_paragraph(ESTIMATE_DISCLAIMER)
    p_disc.runs[0].font.size = Pt(8)
    p_disc.runs[0].font.color.rgb = c_muted

    doc.save(str(output_path))
    return output_path


def generate_pdf_incident_report(
    incident: Dict[str, Any],
    telemetry_points: List[Dict[str, Any]],
    output_path: Path,
) -> Path:
    """
    Generate professional vector PDF incident report using PyMuPDF.
    Adheres strictly to the 15 required report sections with native styling.
    """
    doc = pymupdf.open()
    # A4 dimensions: 595.3 x 841.9 pt
    page_w, page_h = 595.3, 841.9
    page1 = doc.new_page(width=page_w, height=page_h)

    # Color Palette
    col_dark = (0.06, 0.09, 0.15)      # #0F172A
    col_blue = (0.15, 0.39, 0.92)      # #2563EB
    col_red = (0.86, 0.15, 0.15)       # #DC2626
    col_muted = (0.39, 0.45, 0.55)     # #64748B
    col_gray_bg = (0.95, 0.96, 0.98)   # #F1F5F9
    col_warn_bg = (0.99, 0.95, 0.95)   # #FEF2F2

    # Top Header Band
    page1.draw_rect(pymupdf.Rect(0, 0, page_w, 40), fill=col_dark, color=None)
    page1.insert_text(
        pymupdf.Point(36, 25),
        "PRECISIONWORKS MANUFACTURING  |  SCADA AI ENERGY INTELLIGENCE",
        fontsize=9,
        color=(1, 1, 1),
    )

    y = 65
    # Title
    page1.insert_text(
        pymupdf.Point(36, y),
        "EQUIPMENT ANOMALY INCIDENT REPORT",
        fontsize=18,
        color=col_dark,
    )
    y += 18
    inc_id = incident.get("incident_id", "INC-UNKNOWN")
    gen_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    page1.insert_text(
        pymupdf.Point(36, y),
        f"Incident ID: {inc_id}   |   Report Generated: {gen_time}",
        fontsize=8.5,
        color=col_blue,
    )
    y += 20

    # Safety Notice Box
    warn_rect = pymupdf.Rect(36, y, page_w - 36, y + 42)
    page1.draw_rect(warn_rect, fill=col_warn_bg, color=col_red, width=0.8)
    page1.insert_text(
        pymupdf.Point(44, y + 14),
        "OPERATIONAL SAFETY WARNING — DECISION-SUPPORT TELEMETRY ONLY",
        fontsize=8,
        color=col_red,
    )
    page1.insert_text(
        pymupdf.Point(44, y + 26),
        "Algorithmic detections require verification by plant personnel. For critical events, initiate site safety / LOTO procedures.",
        fontsize=7.5,
        color=col_dark,
    )
    page1.insert_text(
        pymupdf.Point(44, y + 36),
        "Do not rely solely on automated model inferences for physical human safety decisions.",
        fontsize=7.5,
        color=col_dark,
    )
    y += 55

    # Section 1: Executive Incident Summary
    page1.insert_text(pymupdf.Point(36, y), "1. Executive Summary & Specification", fontsize=11, color=col_blue)
    y += 15

    eq = incident.get("equipment_id", "UNKNOWN")
    eq_type = incident.get("equipment_type", "").replace("_", " ").title()
    ts = incident.get("timestamp", "UNKNOWN")
    sev = incident.get("severity", "medium").upper()
    atype = incident.get("anomaly_type", "unusual_telemetry").replace("_", " ").title()
    status = incident.get("status", "New")
    is_waste = incident.get("is_energy_waste", False)
    waste_text = "Excess Energy Waste Flagged" if is_waste else "Equipment Health Only (Decoupled)"

    spec_lines = [
        f"• Machine ID: {eq} ({eq_type or 'Asset'})        • Timestamp: {ts}        • Severity: {sev}",
        f"• Classification: {atype}        • Status: {status}        • Energy: {waste_text}",
        f"• Model: {incident.get('model_name', 'Random Forest')} (Confidence: {incident.get('model_score', 'N/A')})",
        "• Provenance: SIMULATED TELEMETRY (Benchmarking synthetic data; not real KPCL measurements)",
    ]
    for line in spec_lines:
        page1.insert_text(pymupdf.Point(42, y), line, fontsize=8.2, color=col_dark)
        y += 13
    y += 8

    # Section 2: Sensor Telemetry Table
    page1.insert_text(pymupdf.Point(36, y), "2. Measured Sensor Telemetry vs Nominal Baseline", fontsize=11, color=col_blue)
    y += 12

    # Table Header
    th_rect = pymupdf.Rect(36, y, page_w - 36, y + 15)
    page1.draw_rect(th_rect, fill=col_dark, color=None)
    page1.insert_text(pymupdf.Point(42, y + 11), "Parameter", fontsize=8, color=(1, 1, 1))
    page1.insert_text(pymupdf.Point(190, y + 11), "Measured", fontsize=8, color=(1, 1, 1))
    page1.insert_text(pymupdf.Point(260, y + 11), "Unit", fontsize=8, color=(1, 1, 1))
    page1.insert_text(pymupdf.Point(340, y + 11), "Nominal Baseline", fontsize=8, color=(1, 1, 1))
    y += 15

    sensor_readings = incident.get("sensor_readings", {})
    row_i = 0
    for skey, smeta in SENSOR_METADATA.items():
        if skey in sensor_readings:
            val = sensor_readings[skey]
            bg = col_gray_bg if row_i % 2 == 0 else (1, 1, 1)
            r_rect = pymupdf.Rect(36, y, page_w - 36, y + 13)
            page1.draw_rect(r_rect, fill=bg, color=None)
            page1.insert_text(pymupdf.Point(42, y + 9.5), smeta["name"], fontsize=7.5, color=col_dark)
            page1.insert_text(pymupdf.Point(190, y + 9.5), str(val), fontsize=7.5, color=col_blue)
            page1.insert_text(pymupdf.Point(260, y + 9.5), smeta["unit"], fontsize=7.5, color=col_muted)
            page1.insert_text(pymupdf.Point(340, y + 9.5), smeta["nominal"], fontsize=7.5, color=col_dark)
            y += 13
            row_i += 1
    y += 12

    # Section 3: Evidence & Recommended Actions
    page1.insert_text(pymupdf.Point(36, y), "3. Algorithmic Evidence & Recommended Maintenance", fontsize=11, color=col_blue)
    y += 14

    ev_list = incident.get("evidence", [])
    for ev in ev_list[:3]:
        page1.insert_text(pymupdf.Point(42, y), f"• {ev}", fontsize=8, color=col_dark)
        y += 12

    action = incident.get("recommended_action", "Perform visual inspection of machine subsystem.")
    page1.insert_text(pymupdf.Point(42, y), f"• Action: {action}", fontsize=8, color=col_red)
    y += 16

    # Section 4: Energy & Financial Waste
    page1.insert_text(pymupdf.Point(36, y), "4. Energy Waste & Scope 2 Carbon Impact", fontsize=11, color=col_blue)
    y += 14
    excess_kwh = incident.get("estimated_excess_energy_kwh")
    if excess_kwh is not None and excess_kwh > 0:
        cost_inr = round(excess_kwh * INDUSTRIAL_TARIFF_INR_PER_KWH, 2)
        co2_kg = round(excess_kwh * GRID_EMISSION_FACTOR_KG_PER_KWH, 2)
        energy_str = f"Estimated Excess Energy: {excess_kwh:.4f} kWh  |  Cost Loss: INR {cost_inr:.2f}  |  Avoidable CO2: {co2_kg:.4f} kg CO2e"
    else:
        energy_str = "Zero Excess Energy: Mechanical health anomaly only. Power consumption is within normal limits."
    page1.insert_text(pymupdf.Point(42, y), energy_str, fontsize=8, color=col_dark)
    y += 18

    # Section 5: Telemetry Chart
    chart_png = _render_incident_trend_chart(incident, telemetry_points)
    if chart_png and y < 620:
        page1.insert_text(pymupdf.Point(36, y), "5. Pre- and Post-Incident Telemetry Trends (±30 min)", fontsize=11, color=col_blue)
        y += 10
        chart_rect = pymupdf.Rect(36, y, page_w - 36, y + 120)
        page1.insert_image(chart_rect, stream=chart_png)
        y += 128

    # Sign-off Box
    sign_rect = pymupdf.Rect(36, y, page_w - 36, y + 48)
    page1.draw_rect(sign_rect, fill=col_gray_bg, color=col_muted, width=0.5)
    page1.insert_text(pymupdf.Point(44, y + 14), "Technician Observation / Action: [  ] Repaired   [  ] Recalibrated   [  ] False Positive", fontsize=7.5, color=col_dark)
    page1.insert_text(pymupdf.Point(44, y + 28), "Investigating Engineer: _________________________    Date: _________________________", fontsize=7.5, color=col_dark)
    page1.insert_text(pymupdf.Point(44, y + 40), "Supervisor Sign-Off:    _________________________    Status: _______________________", fontsize=7.5, color=col_dark)

    # Footer Disclaimer
    page1.insert_text(
        pymupdf.Point(36, page_h - 20),
        "PrecisionWorks Manufacturing — Confidential Engineering Record  |  Model outputs are decision-support estimates.",
        fontsize=7,
        color=col_muted,
    )

    doc.save(str(output_path))
    doc.close()
    return output_path

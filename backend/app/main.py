"""
WattWise AI — Industrial Energy Intelligence & Carbon Accounting Backend
FastAPI Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routers.carbon import router as carbon_router
from backend.app.routers.anomalies import router as anomalies_router, get_incident_store, get_pipeline
from backend.app.routers.ai import router as ai_router, legacy_router as ai_legacy_router

app = FastAPI(
    title="WattWise AI — Industrial Energy Intelligence & Carbon Accounting API",
    description=(
        "Production-grade backend implementing ISO 14064-1 & GHG Protocol Scope 2 Guidance. "
        "Integrates empirical CEA India Baseline factors, IPCC stationary combustion defaults, "
        "and industrial ML anomaly intelligence with condition-aware baselines."
    ),
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS for the Vite development server and API consumers
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register health check endpoint
@app.get("/health", tags=["Health"])
def health_check():
    """Service health and readiness check."""
    try:
        pipeline = get_pipeline()
        models_loaded = pipeline.supervised_model is not None
        incidents_count = len(get_incident_store().incidents)
    except Exception:
        models_loaded = False
        incidents_count = 0

    return {
        "status": "healthy",
        "service": "wattwise-carbon-accounting-backend",
        "modules": {
            "carbon_accounting": "ready",
            "ai_energy_intelligence": "ready" if models_loaded else "initialization",
            "digital_twin_simulation": "ready",
        },
        "models_loaded": models_loaded,
        "total_incidents_tracked": incidents_count,
        "version": "1.2.0"
    }

# Register Carbon Accounting, AI Anomaly Intelligence & Local LLM AI routes
app.include_router(carbon_router)
app.include_router(anomalies_router)
app.include_router(ai_router)
app.include_router(ai_legacy_router)

# Mount Digital Twin Simulation Engine
try:
    from backend.app.routes.simulation import app as simulation_subapp
    # Mount directly at /simulation and expose api endpoints on root
    app.mount("/simulation", simulation_subapp)
    for route in simulation_subapp.routes:
        if hasattr(route, "path") and route.path.startswith("/api/"):
            app.routes.append(route)
except Exception as e:
    pass

# Static Frontend Mount (Serves prebuilt unified SPA if present)
from pathlib import Path
from fastapi.staticfiles import StaticFiles

frontend_dist = Path(__file__).resolve().parent.parent.parent / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

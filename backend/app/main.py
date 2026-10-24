"""
WattWise AI — Industrial Energy Intelligence & Carbon Accounting Backend
FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.routers.carbon import router as carbon_router
from backend.app.routers.forecast import router as forecast_router
from backend.app.routers.anomalies import router as anomalies_router, get_incident_store, get_pipeline
from backend.app.services.energy_forecasting_service import energy_forecasting_service
from backend.app.services.reference_data import reference_data_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup & shutdown lifespan.
    Preloads reference datasets and the trained ML forecasting pipeline into memory
    to avoid per-request disk reads or redundant deserialization.
    """
    try:
        reference_data_service._ensure_cea_loaded()
    except Exception as e:
        print(f"[WARN] Startup reference data load encountered an issue: {e}")

    try:
        energy_forecasting_service.load_model()
    except Exception as e:
        print(f"[WARN] Startup energy forecasting model load encountered an issue: {e}")

    yield


app = FastAPI(
    title="WattWise AI — Industrial Energy Intelligence & Carbon Accounting API",
    description=(
        "Production-grade backend implementing ISO 14064-1 & GHG Protocol Scope 2 Guidance, "
        "industrial ML anomaly intelligence with condition-aware baselines, "
        "and machine-level energy consumption forecasting. "
        "Integrates empirical CEA India Baseline factors, IPCC stationary combustion defaults, "
        "and machine-aware machine learning models."
    ),
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
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
        },
        "models_loaded": models_loaded,
        "total_incidents_tracked": incidents_count,
        "version": "1.2.0"
    }

# Register Carbon Accounting, AI Anomaly Intelligence & Energy Forecasting routes
app.include_router(carbon_router)
app.include_router(anomalies_router)
app.include_router(forecast_router)

# Static Frontend Mount (Serves prebuilt unified SPA if present)
frontend_dist = Path(__file__).resolve().parent.parent.parent / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

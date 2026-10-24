"""
WattWise AI — Industrial Energy Intelligence & Carbon Accounting Backend
FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routers.carbon import router as carbon_router
from backend.app.routers.forecast import router as forecast_router
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
        "and machine-level energy consumption forecasting. "
        "Integrates empirical CEA India Baseline factors, IPCC stationary combustion defaults, "
        "and machine-aware machine learning models."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Configure CORS for the Vite development server
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register health check endpoint
@app.get("/health", tags=["Health"])
def health_check():
    """Service health and readiness check."""
    return {
        "status": "healthy",
        "service": "wattwise-carbon-accounting-backend",
        "version": "1.0.0"
    }

# Register Carbon Accounting routes
app.include_router(carbon_router)

# Register Energy Forecasting routes
app.include_router(forecast_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

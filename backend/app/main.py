"""
WattWise AI — Industrial Energy Intelligence & Carbon Accounting Backend
FastAPI Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routers.carbon import router as carbon_router

app = FastAPI(
    title="WattWise AI — Industrial Energy Intelligence & Carbon Accounting API",
    description=(
        "Production-grade backend implementing ISO 14064-1 & GHG Protocol Scope 2 Guidance. "
        "Integrates empirical CEA India Baseline factors and IPCC stationary combustion defaults."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

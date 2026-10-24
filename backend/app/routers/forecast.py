"""
WattWise AI — Energy Forecasting API Router
Provides REST endpoints for next-interval machine energy consumption forecasts
and model inspection metadata.
"""

from fastapi import APIRouter, HTTPException, status

from backend.app.models import EnergyForecastInput, EnergyForecastResponse
from backend.app.services.energy_forecasting_service import (
    EnergyForecastingServiceError,
    ModelNotReadyError,
    energy_forecasting_service,
)

router = APIRouter(prefix="/api/v1/forecast", tags=["Machine Energy Forecasting"])


@router.post(
    "/next-15min",
    response_model=EnergyForecastResponse,
    summary="Forecast Machine Energy Consumption for Next 15-Minute Interval",
    description=(
        "Applies the machine-aware gradient boosting forecasting model to predict "
        "energy consumption (kWh) and equivalent average power (kW) for the next 15-minute interval. "
        "Operates on synthetic benchmark model metadata without claiming real factory measurements."
    ),
)
def forecast_machine_energy(input_payload: EnergyForecastInput):
    """Generates next 15-minute energy forecast for a specific machine asset."""
    try:
        response = energy_forecasting_service.predict_next_15min(input_payload)
        return response
    except ModelNotReadyError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )
    except EnergyForecastingServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecasting calculation failed: {str(e)}",
        )


@router.get(
    "/metadata",
    summary="Get Energy Forecasting Model Metadata & Benchmark Metrics",
    description="Returns serialized model version, training dates, validation and test set metrics.",
)
def get_forecasting_metadata():
    """Returns metadata, hyperparameter configuration, and test benchmarks for the forecasting model."""
    return energy_forecasting_service.get_metadata()

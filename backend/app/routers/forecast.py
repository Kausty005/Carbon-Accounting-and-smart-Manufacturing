"""
WattWise AI — Energy Forecasting API Router
Provides REST endpoints for:
1. Next 15-Minute Machine Energy Forecast (POST /api/v1/forecast/next-15min)
2. Next 1-Day Machine Hourly Energy Forecast (POST /api/v1/forecast/next-day)
3. Next 1-Week Machine Daily Energy Forecast (POST /api/v1/forecast/next-week)
4. Multi-Horizon Plant Fleet Aggregated Forecast (POST /api/v1/forecast/plant)
5. Multi-Horizon Model Metadata & Benchmark Metrics (GET /api/v1/forecast/metadata)
"""

from fastapi import APIRouter, HTTPException, status

from backend.app.models import (
    EnergyForecastInput,
    EnergyForecastResponse,
    FleetForecastRequest,
    ForecastHorizon,
    HorizonForecastResponse,
)
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
def forecast_machine_energy_15min(input_payload: EnergyForecastInput):
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
            detail=f"15-minute forecasting calculation failed: {str(e)}",
        )


@router.post(
    "/next-day",
    response_model=HorizonForecastResponse,
    summary="Forecast Machine Energy Consumption for Next 1-Day (24-Hour Horizon)",
    description=(
        "Estimates machine energy consumption (kWh) and equivalent average power (kW) across the next 24 hours. "
        "Produces an hourly time-series profile accounting for shift patterns, operating states, and diurnal cycles."
    ),
)
def forecast_machine_energy_day(input_payload: EnergyForecastInput):
    """Generates next 1-day hourly energy forecast for a specific machine asset."""
    try:
        response = energy_forecasting_service.predict_next_day(input_payload)
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
            detail=f"Daily forecasting calculation failed: {str(e)}",
        )


@router.post(
    "/next-week",
    response_model=HorizonForecastResponse,
    summary="Forecast Machine Energy Consumption for Next 1-Week (7-Day Horizon)",
    description=(
        "Estimates machine energy consumption (kWh) and equivalent average power (kW) across the next 7 days. "
        "Produces a daily time-series profile accounting for weekday full-production vs weekend low-load variance."
    ),
)
def forecast_machine_energy_week(input_payload: EnergyForecastInput):
    """Generates next 1-week daily energy forecast for a specific machine asset."""
    try:
        response = energy_forecasting_service.predict_next_week(input_payload)
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
            detail=f"Weekly forecasting calculation failed: {str(e)}",
        )


@router.post(
    "/plant",
    response_model=HorizonForecastResponse,
    summary="Forecast Fleet Energy Consumption for Selected Horizon (15m, 1d, 1w)",
    description=(
        "Aggregates predictions for all plant machines across the chosen horizon (15 Minutes, 1 Day, or 1 Week). "
        "Returns total expected plant energy (kWh), average power (kW), synchronized time-series, and machine breakdowns. "
        "Explicitly tracks machine coverage without silently assuming missing machine data is zero."
    ),
)
def forecast_plant_fleet(input_payload: FleetForecastRequest):
    """Generates aggregated plant-wide energy forecast for the chosen horizon."""
    try:
        response = energy_forecasting_service.predict_fleet(
            horizon=input_payload.horizon,
            machines=input_payload.machines,
        )
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
            detail=f"Fleet forecasting aggregation failed: {str(e)}",
        )


@router.get(
    "/metadata",
    summary="Get Energy Forecasting Model Metadata & Benchmark Metrics",
    description="Returns serialized model version, training dates, validation and test benchmarks across all horizons.",
)
def get_forecasting_metadata():
    """Returns metadata, hyperparameter configuration, and test benchmarks for the forecasting models."""
    return energy_forecasting_service.get_metadata()

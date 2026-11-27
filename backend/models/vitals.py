from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


VITAL_SOURCE = Literal[
    "manual",
    "android_health_connect",
    "apple_healthkit",
    "fitbit",
    "garmin",
]


class VitalReadingCreate(BaseModel):
    heart_rate: Optional[int] = Field(None, ge=25, le=250, description="bpm")
    systolic: Optional[int] = Field(None, ge=50, le=260, description="mmHg")
    diastolic: Optional[int] = Field(None, ge=30, le=180, description="mmHg")
    blood_glucose: Optional[float] = Field(None, ge=20, le=700, description="mg/dL")
    glucose_context: Optional[Literal["fasting", "post_meal", "random"]] = "random"
    oxygen_saturation: Optional[float] = Field(None, ge=50, le=100, description="SpO2 %")
    temperature_f: Optional[float] = Field(None, ge=90.0, le=110.0, description="Body temp in Fahrenheit")
    temperature_unit: Optional[Literal["F", "C"]] = "F"
    weight_kg: Optional[float] = Field(None, ge=10.0, le=400.0, description="Weight in kg")
    height_cm: Optional[float] = Field(None, ge=40.0, le=260.0, description="Height in cm")
    sleep_hours: Optional[float] = Field(None, ge=0.0, le=24.0, description="Hours slept")
    steps: Optional[int] = Field(None, ge=0, le=200000, description="Daily step count")
    water_glasses: Optional[int] = Field(None, ge=0, le=50, description="250ml glasses")
    source: VITAL_SOURCE = "manual"
    recorded_at: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=400)

    @model_validator(mode="after")
    def validate_vitals(self):
        if (self.systolic is None) != (self.diastolic is None):
            raise ValueError("Provide both systolic and diastolic blood pressure values together.")
        if self.systolic is not None and self.diastolic is not None and self.systolic <= self.diastolic:
            raise ValueError("Systolic blood pressure must be higher than diastolic blood pressure.")
        has_any = any(
            getattr(self, field) is not None
            for field in (
                "heart_rate",
                "systolic",
                "blood_glucose",
                "oxygen_saturation",
                "temperature_f",
                "weight_kg",
                "height_cm",
                "sleep_hours",
                "steps",
                "water_glasses",
            )
        )
        if not has_any:
            raise ValueError("Enter at least one health vital reading.")
        return self


class VitalReadingUpdate(BaseModel):
    heart_rate: Optional[int] = Field(None, ge=25, le=250)
    systolic: Optional[int] = Field(None, ge=50, le=260)
    diastolic: Optional[int] = Field(None, ge=30, le=180)
    blood_glucose: Optional[float] = Field(None, ge=20, le=700)
    glucose_context: Optional[Literal["fasting", "post_meal", "random"]] = None
    oxygen_saturation: Optional[float] = Field(None, ge=50, le=100)
    temperature_f: Optional[float] = Field(None, ge=90.0, le=110.0)
    weight_kg: Optional[float] = Field(None, ge=10.0, le=400.0)
    height_cm: Optional[float] = Field(None, ge=40.0, le=260.0)
    sleep_hours: Optional[float] = Field(None, ge=0.0, le=24.0)
    steps: Optional[int] = Field(None, ge=0, le=200000)
    water_glasses: Optional[int] = Field(None, ge=0, le=50)
    recorded_at: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=400)

    @model_validator(mode="after")
    def validate_bp_pair(self):
        if (self.systolic is None) != (self.diastolic is None):
            raise ValueError("Provide both systolic and diastolic blood pressure values when updating blood pressure.")
        if self.systolic is not None and self.diastolic is not None and self.systolic <= self.diastolic:
            raise ValueError("Systolic blood pressure must be higher than diastolic blood pressure.")
        return self

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Async Thunks for API integrations
export const fetchHealthData = createAsyncThunk(
  'health/fetchHealthData',
  async (_, { rejectWithValue }) => {
    try {
      const [metricsRes, apptsRes, recordsRes, workoutsRes] = await Promise.all([
        api.get('/fitness/metrics'),
        api.get('/appointments'),
        api.get('/records'),
        api.get('/fitness/workouts')
      ]);
      return {
        metrics: metricsRes.data,
        appointments: apptsRes.data,
        records: recordsRes.data,
        workouts: workoutsRes.data
      };
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to load health statistics';
      return rejectWithValue(message);
    }
  }
);

export const bookAppointment = createAsyncThunk(
  'health/bookAppointment',
  async (apptData, { rejectWithValue }) => {
    try {
      const response = await api.post('/appointments', apptData);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to book appointment';
      return rejectWithValue(message);
    }
  }
);

export const cancelAppointment = createAsyncThunk(
  'health/cancelAppointment',
  async (apptId, { rejectWithValue }) => {
    try {
      await api.post(`/appointments/${apptId}/cancel`);
      return apptId;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to cancel appointment';
      return rejectWithValue(message);
    }
  }
);

export const uploadMedicalRecord = createAsyncThunk(
  'health/uploadMedicalRecord',
  async (recordData, { rejectWithValue }) => {
    try {
      let response;
      if (recordData instanceof FormData) {
        response = await api.post('/records/upload', recordData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        response = await api.post('/records', recordData);
      }
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to upload medical record';
      return rejectWithValue(message);
    }
  }
);

export const deleteMedicalRecord = createAsyncThunk(
  'health/deleteMedicalRecord',
  async (recordId, { rejectWithValue }) => {
    try {
      await api.delete(`/records/${recordId}`);
      return recordId;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to delete medical record';
      return rejectWithValue(message);
    }
  }
);

export const logFitnessWorkout = createAsyncThunk(
  'health/logFitnessWorkout',
  async (workoutData, { rejectWithValue }) => {
    try {
      const response = await api.post('/fitness/workouts', workoutData);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to log workout';
      return rejectWithValue(message);
    }
  }
);

export const updateHydration = createAsyncThunk(
  'health/updateHydration',
  async (glasses, { rejectWithValue }) => {
    try {
      await api.post('/fitness/water', { glasses });
      return glasses;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to update water intake';
      return rejectWithValue(message);
    }
  }
);

export const updateHealthMetric = createAsyncThunk(
  'health/updateHealthMetric',
  async ({ key, value }, { rejectWithValue }) => {
    try {
      await api.post('/fitness/metrics', { key, value });
      return { key, value };
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to sync metric';
      return rejectWithValue(message);
    }
  }
);

const initialState = {
  metrics: {
    heartRate: { current: 0, min: 60, max: 100, unit: 'bpm', status: 'normal' },
    bloodPressure: { systolic: 0, diastolic: 0, unit: 'mmHg', status: 'normal' },
    sleep: { hours: 0.0, quality: 'N/A', target: 8, unit: 'hrs' },
    calories: { burned: 0, intake: 0, target: 2000, unit: 'kcal' },
    steps: { count: 0, target: 10000, unit: 'steps' },
    water: { intake: 0, target: 8, unit: 'glasses' },
    weight: { current: 0.0, previous: 0.0, unit: 'kg' },
    bmi: { value: 0.0, category: 'Normal' },
    oxygen: { level: 0, unit: '%', status: 'normal' },
    temperature: { value: 0.0, unit: '°F', status: 'normal' },
  },
  appointments: [],
  records: [],
  workouts: [],
  medications: [],
  loading: false,
  error: null
};

const healthSlice = createSlice({
  name: 'health',
  initialState,
  reducers: {
    clearHealthError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Health Data
      .addCase(fetchHealthData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchHealthData.fulfilled, (state, action) => {
        state.loading = false;
        state.metrics = action.payload.metrics;
        state.appointments = action.payload.appointments;
        state.records = action.payload.records;
        state.workouts = action.payload.workouts;
      })
      .addCase(fetchHealthData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Book Appointment
      .addCase(bookAppointment.fulfilled, (state, action) => {
        state.appointments.unshift(action.payload);
      })
      
      // Cancel Appointment
      .addCase(cancelAppointment.fulfilled, (state, action) => {
        const idx = state.appointments.findIndex(a => a.id === action.payload);
        if (idx !== -1) {
          state.appointments[idx].status = 'cancelled';
        }
      })
      
      // Upload Record
      .addCase(uploadMedicalRecord.fulfilled, (state, action) => {
        state.records.unshift(action.payload);
      })
      
      // Delete Record
      .addCase(deleteMedicalRecord.fulfilled, (state, action) => {
        state.records = state.records.filter(r => r.id !== action.payload);
      })
      
      // Log Workout
      .addCase(logFitnessWorkout.fulfilled, (state, action) => {
        state.workouts.unshift(action.payload);
        // Add calories burned
        state.metrics.calories.burned += action.payload.calories;
      })
      
      // Update Hydration
      .addCase(updateHydration.fulfilled, (state, action) => {
        state.metrics.water.intake = action.payload;
      })
      
      // Update Health Metric
      .addCase(updateHealthMetric.fulfilled, (state, action) => {
        const { key, value } = action.payload;
        state.metrics[key] = { ...state.metrics[key], ...value };
      });
  }
});

export const { clearHealthError } = healthSlice.actions;
export default healthSlice.reducer;

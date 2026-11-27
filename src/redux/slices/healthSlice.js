import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Async Thunks for API integrations
export const fetchHealthData = createAsyncThunk(
  'health/fetchHealthData',
  async (_, { rejectWithValue }) => {
    try {
      const [metricsRes, recordsRes, workoutsRes] = await Promise.all([
        api.get('/fitness/metrics'),
        api.get('/records'),
        api.get('/fitness/workouts')
      ]);
      return {
        metrics: metricsRes.data,
        records: recordsRes.data,
        workouts: workoutsRes.data
      };
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to load health statistics';
      return rejectWithValue(message);
    }
  }
);

export const completeFitnessWorkout = createAsyncThunk(
  'health/completeFitnessWorkout',
  async ({ workoutId, completed = true }, { rejectWithValue }) => {
    try {
      const response = await api.put(`/fitness/workouts/${workoutId}`, { completed });
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to update workout status';
      return rejectWithValue(message);
    }
  }
);

export const deleteFitnessWorkout = createAsyncThunk(
  'health/deleteFitnessWorkout',
  async (workoutId, { rejectWithValue }) => {
    try {
      await api.delete(`/fitness/workouts/${workoutId}`);
      return workoutId;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to delete workout';
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
    heartRate: { current: null, min: 60, max: 100, unit: 'bpm', status: 'not_recorded' },
    bloodPressure: { systolic: null, diastolic: null, unit: 'mmHg', status: 'not_recorded' },
    sleep: { hours: null, quality: 'Not provided', target: 8, unit: 'hrs' },
    calories: { burned: null, intake: null, target: null, unit: 'kcal' },
    steps: { count: null, target: null, unit: 'steps' },
    water: { intake: null, target: null, unit: 'glasses' },
    weight: { current: null, previous: null, unit: 'kg' },
    bmi: { value: null, category: 'Not provided' },
    oxygen: { level: null, unit: '%', status: 'not_recorded' },
    temperature: { value: null, unit: '°F', status: 'not_recorded' },
    history: {},
  },
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
        state.records = action.payload.records;
        state.workouts = action.payload.workouts;
      })
      .addCase(fetchHealthData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Complete / Update Workout
      .addCase(completeFitnessWorkout.fulfilled, (state, action) => {
        const idx = state.workouts.findIndex(w => w.id === action.payload.id);
        if (idx !== -1) {
          state.workouts[idx] = action.payload;
        }
      })

      // Delete Workout
      .addCase(deleteFitnessWorkout.fulfilled, (state, action) => {
        state.workouts = state.workouts.filter(w => w.id !== action.payload);
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
        state.metrics.calories.burned = (state.metrics.calories.burned || 0) + (action.payload.calories || 0);
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

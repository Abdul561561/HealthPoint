import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { fetchAnalyticsDashboard } from '../../services/analyticsApi';

export const getAnalyticsDashboard = createAsyncThunk(
  'analytics/getDashboard',
  async (_, { rejectWithValue }) => {
    try {
      const data = await fetchAnalyticsDashboard();
      return data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to fetch health analytics';
      return rejectWithValue(message);
    }
  }
);

const initialState = {
  scoreBreakdown: null,
  riskPredictions: [],
  weeklyReport: null,
  loading: false,
  error: null
};

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    clearAnalyticsError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(getAnalyticsDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(getAnalyticsDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.scoreBreakdown = action.payload.scoreBreakdown;
        state.riskPredictions = action.payload.riskPredictions;
        state.weeklyReport = action.payload.weeklyReport;
      })
      .addCase(getAnalyticsDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { clearAnalyticsError } = analyticsSlice.actions;
export default analyticsSlice.reducer;

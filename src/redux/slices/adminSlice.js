import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as adminApi from '../../services/adminApi';

// Async Thunks for Admin Dashboard Stats
export const getAdminStats = createAsyncThunk(
  'admin/getStats',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.fetchAdminDashboardStats();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load admin metrics');
    }
  }
);

// Users Thunks
export const getAdminUsers = createAsyncThunk(
  'admin/getUsers',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.fetchAdminUsers();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load patients list');
    }
  }
);

export const editAdminUser = createAsyncThunk(
  'admin/editUser',
  async ({ userId, data }, { rejectWithValue }) => {
    try {
      return await adminApi.updateAdminUser(userId, data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to update user profile');
    }
  }
);

export const removeAdminUser = createAsyncThunk(
  'admin/removeUser',
  async (userId, { rejectWithValue }) => {
    try {
      await adminApi.deleteAdminUser(userId);
      return userId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to delete user profile');
    }
  }
);

// Doctors Thunks
export const getAdminDoctors = createAsyncThunk(
  'admin/getDoctors',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.fetchAdminDoctors();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load doctors list');
    }
  }
);

export const addAdminDoctor = createAsyncThunk(
  'admin/addDoctor',
  async (data, { rejectWithValue }) => {
    try {
      return await adminApi.createAdminDoctor(data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to add doctor profile');
    }
  }
);

export const editAdminDoctor = createAsyncThunk(
  'admin/editDoctor',
  async ({ doctorId, data }, { rejectWithValue }) => {
    try {
      return await adminApi.updateAdminDoctor(doctorId, data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to update doctor profile');
    }
  }
);

export const removeAdminDoctor = createAsyncThunk(
  'admin/removeDoctor',
  async (doctorId, { rejectWithValue }) => {
    try {
      await adminApi.deleteAdminDoctor(doctorId);
      return doctorId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to delete doctor profile');
    }
  }
);

// Medicines Thunks
export const getAdminMedicines = createAsyncThunk(
  'admin/getMedicines',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.fetchAdminMedicines();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load medicine list');
    }
  }
);

export const addAdminMedicine = createAsyncThunk(
  'admin/addMedicine',
  async (data, { rejectWithValue }) => {
    try {
      return await adminApi.createAdminMedicine(data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to add medicine');
    }
  }
);

export const editAdminMedicine = createAsyncThunk(
  'admin/editMedicine',
  async ({ medId, data }, { rejectWithValue }) => {
    try {
      return await adminApi.updateAdminMedicine(medId, data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to update medicine details');
    }
  }
);

export const removeAdminMedicine = createAsyncThunk(
  'admin/removeMedicine',
  async (medId, { rejectWithValue }) => {
    try {
      await adminApi.deleteAdminMedicine(medId);
      return medId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to delete medicine');
    }
  }
);

// Appointments Thunks
export const getAdminAppointments = createAsyncThunk(
  'admin/getAppointments',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.fetchAdminAppointments();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load appointments list');
    }
  }
);

export const editAdminAppointment = createAsyncThunk(
  'admin/editAppointment',
  async ({ apptId, data }, { rejectWithValue }) => {
    try {
      return await adminApi.updateAdminAppointment(apptId, data);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to update appointment details');
    }
  }
);

export const removeAdminAppointment = createAsyncThunk(
  'admin/removeAppointment',
  async (apptId, { rejectWithValue }) => {
    try {
      await adminApi.deleteAdminAppointment(apptId);
      return apptId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to cancel appointment');
    }
  }
);

// AI Monitoring Thunks
export const getAdminAIChats = createAsyncThunk(
  'admin/getAIChats',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.fetchAdminAIChats();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load AI conversations logs');
    }
  }
);

// Reports Thunks
export const getAdminReports = createAsyncThunk(
  'admin/getReports',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.fetchAdminReports();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load reports files list');
    }
  }
);

export const editAdminReportStatus = createAsyncThunk(
  'admin/editReportStatus',
  async ({ reportId, status }, { rejectWithValue }) => {
    try {
      return await adminApi.updateAdminReportStatus(reportId, status);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to change verification status');
    }
  }
);

const initialState = {
  dashboard: { stats: {}, revenueChart: [], recentActivities: [] },
  users: [],
  doctors: [],
  medicines: [],
  appointments: [],
  aiChats: [],
  reports: [],
  loading: false,
  error: null
};

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    clearAdminError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Stats
      .addCase(getAdminStats.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(getAdminStats.fulfilled, (state, action) => { state.loading = false; state.dashboard = action.payload; })
      .addCase(getAdminStats.rejected, (state, action) => { state.loading = false; state.error = action.payload; })
      
      // Users
      .addCase(getAdminUsers.fulfilled, (state, action) => { state.users = action.payload; })
      .addCase(editAdminUser.fulfilled, (state, action) => {
        const idx = state.users.findIndex(u => u.id === action.payload.id);
        if (idx !== -1) state.users[idx] = action.payload;
      })
      .addCase(removeAdminUser.fulfilled, (state, action) => {
        state.users = state.users.filter(u => u.id !== action.payload);
      })

      // Doctors
      .addCase(getAdminDoctors.fulfilled, (state, action) => { state.doctors = action.payload; })
      .addCase(addAdminDoctor.fulfilled, (state, action) => {
        state.doctors.unshift(action.payload);
      })
      .addCase(editAdminDoctor.fulfilled, (state, action) => {
        const idx = state.doctors.findIndex(d => d.id === action.payload.id || d.id === String(action.payload.id));
        if (idx !== -1) state.doctors[idx] = action.payload;
      })
      .addCase(removeAdminDoctor.fulfilled, (state, action) => {
        state.doctors = state.doctors.filter(d => d.id !== action.payload && d.id !== String(action.payload));
      })

      // Medicines
      .addCase(getAdminMedicines.fulfilled, (state, action) => { state.medicines = action.payload; })
      .addCase(addAdminMedicine.fulfilled, (state, action) => {
        state.medicines.unshift(action.payload);
      })
      .addCase(editAdminMedicine.fulfilled, (state, action) => {
        const idx = state.medicines.findIndex(m => m.id === action.payload.id);
        if (idx !== -1) state.medicines[idx] = action.payload;
      })
      .addCase(removeAdminMedicine.fulfilled, (state, action) => {
        state.medicines = state.medicines.filter(m => m.id !== action.payload);
      })

      // Appointments
      .addCase(getAdminAppointments.fulfilled, (state, action) => { state.appointments = action.payload; })
      .addCase(editAdminAppointment.fulfilled, (state, action) => {
        const idx = state.appointments.findIndex(a => a.id === action.payload.id);
        if (idx !== -1) state.appointments[idx] = action.payload;
      })
      .addCase(removeAdminAppointment.fulfilled, (state, action) => {
        state.appointments = state.appointments.filter(a => a.id !== action.payload);
      })

      // AI Chats
      .addCase(getAdminAIChats.fulfilled, (state, action) => { state.aiChats = action.payload; })

      // Reports
      .addCase(getAdminReports.fulfilled, (state, action) => { state.reports = action.payload; })
      .addCase(editAdminReportStatus.fulfilled, (state, action) => {
        const idx = state.reports.findIndex(r => r.id === action.payload.id);
        if (idx !== -1) state.reports[idx] = action.payload;
      });
  }
});

export const { clearAdminError } = adminSlice.actions;
export default adminSlice.reducer;

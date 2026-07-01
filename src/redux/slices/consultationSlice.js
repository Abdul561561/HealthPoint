import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../../services/consultationApi';

export const fetchConsultationAppointments = createAsyncThunk(
  'consultation/fetchAppointments',
  async (_, { rejectWithValue }) => {
    try {
      return await api.fetchVideoAppointments();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch appointments');
    }
  }
);

export const fetchJitsiRoom = createAsyncThunk(
  'consultation/fetchJitsiRoom',
  async (apptId, { rejectWithValue }) => {
    try {
      return await api.fetchJitsiRoomConfig(apptId);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch meeting room configuration');
    }
  }
);

export const saveDoctorClinicalNote = createAsyncThunk(
  'consultation/saveClinicalNote',
  async (noteData, { rejectWithValue }) => {
    try {
      return await api.saveClinicalNote(noteData);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to save clinical notes');
    }
  }
);

export const fetchPatientNotesHistory = createAsyncThunk(
  'consultation/fetchNotesHistory',
  async (patientEmail, { rejectWithValue }) => {
    try {
      return await api.fetchPatientNotes(patientEmail);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch clinical notes history');
    }
  }
);

export const fetchPatientHealthMetrics = createAsyncThunk(
  'consultation/fetchBiometrics',
  async (patientEmail, { rejectWithValue }) => {
    try {
      return await api.fetchPatientBiometrics(patientEmail);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch biometrics');
    }
  }
);

const initialState = {
  appointments: [],
  notes: [],
  currentRoom: null,
  patientBiometrics: null,
  loading: false,
  error: null,
};

const consultationSlice = createSlice({
  name: 'consultation',
  initialState,
  reducers: {
    clearCurrentRoom: (state) => {
      state.currentRoom = null;
    },
    clearConsultationError: (state) => {
      state.error = null;
    },
    setDirectRoomName: (state, action) => {
      state.currentRoom = {
        roomName: action.payload.roomName,
        displayName: action.payload.displayName || 'HealthPoint User',
        subject: 'Direct Call Room',
        isDoctor: action.payload.isDoctor || false
      };
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Appointments
      .addCase(fetchConsultationAppointments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchConsultationAppointments.fulfilled, (state, action) => {
        state.loading = false;
        state.appointments = action.payload;
      })
      .addCase(fetchConsultationAppointments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Room Config
      .addCase(fetchJitsiRoom.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchJitsiRoom.fulfilled, (state, action) => {
        state.loading = false;
        state.currentRoom = action.payload;
      })
      .addCase(fetchJitsiRoom.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Save Clinical Note
      .addCase(saveDoctorClinicalNote.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(saveDoctorClinicalNote.fulfilled, (state, action) => {
        state.loading = false;
        state.notes.unshift(action.payload);
      })
      .addCase(saveDoctorClinicalNote.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Notes History
      .addCase(fetchPatientNotesHistory.fulfilled, (state, action) => {
        state.notes = action.payload;
      })
      
      // Fetch Biometrics
      .addCase(fetchPatientHealthMetrics.fulfilled, (state, action) => {
        state.patientBiometrics = action.payload;
      });
  }
});

export const { clearCurrentRoom, clearConsultationError, setDirectRoomName } = consultationSlice.actions;
export default consultationSlice.reducer;

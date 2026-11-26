import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/login', credentials);
      const { access_token, user } = response.data;
      localStorage.setItem('hp-token', access_token);
      return user;
    } catch (err) {
      const detail = err.response?.data?.detail;
      return rejectWithValue({
        message: detail || 'Login failed',
        status: err.response?.status,
        email: credentials.email,
      });
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/register', userData);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Registration failed';
      return rejectWithValue(message);
    }
  }
);

export const verifyUserEmail = createAsyncThunk(
  'auth/verifyUserEmail',
  async ({ email, otp }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/verify', { email, otp });
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Verification failed';
      return rejectWithValue(message);
    }
  }
);

export const resendVerificationOtp = createAsyncThunk(
  'auth/resendVerificationOtp',
  async ({ email }, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/resend-otp', { email });
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Could not resend verification code';
      return rejectWithValue(message);
    }
  }
);

export const fetchUserProfile = createAsyncThunk(
  'auth/fetchUserProfile',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.get('/auth/profile');
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to fetch profile';
      return rejectWithValue(message);
    }
  }
);

export const updateUserProfile = createAsyncThunk(
  'auth/updateUserProfile',
  async (profileData, { rejectWithValue }) => {
    try {
      const response = await api.put('/auth/profile', profileData);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.detail || 'Failed to update profile';
      return rejectWithValue(message);
    }
  }
);

const token = localStorage.getItem('hp-token');

const initialState = {
  isAuthenticated: !!token,
  user: null,
  loading: false,
  error: null,
  verificationRequired: false,
  unverifiedEmail: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      localStorage.removeItem('hp-token');
      state.isAuthenticated = false;
      state.user = null;
      state.error = null;
      state.verificationRequired = false;
      state.unverifiedEmail = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setVerificationRequired: (state, action) => {
      state.verificationRequired = action.payload.required;
      state.unverifiedEmail = action.payload.email;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        state.verificationRequired = false;
        state.unverifiedEmail = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        const payload = action.payload;
        if (payload && typeof payload === 'object') {
          state.error = payload.message || 'Login failed';
          if (payload.status === 403 && payload.email) {
            state.verificationRequired = true;
            state.unverifiedEmail = payload.email;
          }
        } else {
          state.error = typeof payload === 'string' ? payload : 'Login failed';
        }
      })

      // Register (Account remains unverified until OTP is confirmed; no JWT issued)
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.verificationRequired = true;
        state.unverifiedEmail = action.payload?.email || null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Verify User Email (marks verified, user proceeds to login)
      .addCase(verifyUserEmail.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyUserEmail.fulfilled, (state) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.verificationRequired = false;
        state.unverifiedEmail = null;
        state.error = null;
      })
      .addCase(verifyUserEmail.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Resend OTP
      .addCase(resendVerificationOtp.pending, (state) => {
        state.error = null;
      })
      .addCase(resendVerificationOtp.rejected, (state, action) => {
        state.error = action.payload;
      })

      // Fetch Profile
      .addCase(fetchUserProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(fetchUserProfile.rejected, (state) => {
        state.loading = false;
        state.user = null;
        state.isAuthenticated = false;
        localStorage.removeItem('hp-token');
      })

      // Update Profile
      .addCase(updateUserProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { logout, clearError, setVerificationRequired } = authSlice.actions;
export default authSlice.reducer;

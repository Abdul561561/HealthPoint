import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';

// Async Thunks for API calls
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
      return rejectWithValue(detail || 'Login failed');
    }
  }
);

export const loginSocialUser = createAsyncThunk(
  'auth/loginSocialUser',
  async (socialData, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/social-login', socialData);
      const { access_token, user } = response.data;
      localStorage.setItem('hp-token', access_token);
      return user;
    } catch (err) {
      const message = err.response?.data?.detail || 'Social Login failed';
      return rejectWithValue(message);
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
      const { access_token, user } = response.data;
      localStorage.setItem('hp-token', access_token);
      return user;
    } catch (err) {
      const message = err.response?.data?.detail || 'Verification failed';
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
    }
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
        if (action.payload && action.payload.error === "verification_required") {
          state.verificationRequired = true;
          state.unverifiedEmail = action.payload.email;
          state.error = action.payload.message;
        } else {
          state.error = typeof action.payload === 'string' ? action.payload : 'Login failed';
        }
      })
      
      // Social Login
      .addCase(loginSocialUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginSocialUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        state.verificationRequired = false;
        state.unverifiedEmail = null;
      })
      .addCase(loginSocialUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Register
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload && action.payload.status === "verification_required") {
          state.verificationRequired = true;
          state.unverifiedEmail = action.payload.email;
          state.user = null;
          state.isAuthenticated = false;
        } else {
          state.isAuthenticated = true;
          state.user = action.payload.user;
          state.verificationRequired = false;
          state.unverifiedEmail = null;
        }
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Verify User Email
      .addCase(verifyUserEmail.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyUserEmail.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        state.verificationRequired = false;
        state.unverifiedEmail = null;
        state.error = null;
      })
      .addCase(verifyUserEmail.rejected, (state, action) => {
        state.loading = false;
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

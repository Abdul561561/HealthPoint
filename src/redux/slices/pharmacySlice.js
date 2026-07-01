import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../../services/pharmacyApi';


export const uploadPrescriptionFile = createAsyncThunk(
  'pharmacy/uploadPrescriptionFile',
  async (file, { rejectWithValue }) => {
    try {
      const data = await api.uploadPrescription(file);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to upload prescription');
    }
  }
);

export const placePharmacyOrder = createAsyncThunk(
  'pharmacy/placePharmacyOrder',
  async (orderData, { rejectWithValue }) => {
    try {
      const data = await api.placeOrder(orderData);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to place order');
    }
  }
);

export const fetchOrders = createAsyncThunk(
  'pharmacy/fetchOrders',
  async (_, { rejectWithValue }) => {
    try {
      const data = await api.fetchOrderHistory();
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch order history');
    }
  }
);

export const fetchLatestPrescription = createAsyncThunk(
  'pharmacy/fetchLatestPrescription',
  async (_, { rejectWithValue }) => {
    try {
      const data = await api.getLatestPrescription();
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch prescription');
    }
  }
);

export const fetchPrescriptionHistory = createAsyncThunk(
  'pharmacy/fetchPrescriptionHistory',
  async (_, { rejectWithValue }) => {
    try {
      const data = await api.fetchPrescriptionHistory();
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch prescription history');
    }
  }
);

export const deletePrescriptionFile = createAsyncThunk(
  'pharmacy/deletePrescriptionFile',
  async (prescriptionId, { rejectWithValue }) => {
    try {
      await api.deletePrescription(prescriptionId);
      return prescriptionId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to delete prescription');
    }
  }
);


export const fetchStores = createAsyncThunk(
  'pharmacy/fetchStores',
  async (coords, { rejectWithValue }) => {
    try {
      const { lat, lng } = coords || {};
      const data = await api.fetchNearbyStores(lat, lng);
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to fetch nearby stores');
    }
  }
);

const initialState = {
  orders: [],
  stores: [],
  uploadedPrescription: null,
  prescriptionHistory: [],
  loading: false,
  error: null,
  prescriptionLoading: false,
};

const pharmacySlice = createSlice({
  name: 'pharmacy',
  initialState,
  reducers: {
    clearUploadedPrescription: (state) => {
      state.uploadedPrescription = null;
    },
    setUploadedPrescription: (state, action) => {
      state.uploadedPrescription = action.payload;
    },
    clearPharmacyError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder

      // Upload Prescription
      .addCase(uploadPrescriptionFile.pending, (state) => {
        state.prescriptionLoading = true;
        state.error = null;
      })
      .addCase(uploadPrescriptionFile.fulfilled, (state, action) => {
        state.prescriptionLoading = false;
        state.uploadedPrescription = action.payload;
        if (!state.prescriptionHistory) state.prescriptionHistory = [];
        state.prescriptionHistory.unshift(action.payload);
      })
      .addCase(uploadPrescriptionFile.rejected, (state, action) => {
        state.prescriptionLoading = false;
        state.error = action.payload;
      })

      // Fetch Orders
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.orders = action.payload;
      })

      // Fetch Latest Prescription
      .addCase(fetchLatestPrescription.fulfilled, (state, action) => {
        state.uploadedPrescription = action.payload;
      })

      // Fetch Prescription History
      .addCase(fetchPrescriptionHistory.fulfilled, (state, action) => {
        state.prescriptionHistory = action.payload;
      })

      // Delete Prescription
      .addCase(deletePrescriptionFile.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deletePrescriptionFile.fulfilled, (state, action) => {
        state.loading = false;
        state.prescriptionHistory = (state.prescriptionHistory || []).filter(rx => rx.id !== action.payload);
        if (state.uploadedPrescription && state.uploadedPrescription.id === action.payload) {
          state.uploadedPrescription = null;
        }
      })
      .addCase(deletePrescriptionFile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Place Order
      .addCase(placePharmacyOrder.pending, (state) => {
        state.loading = true;
      })
      .addCase(placePharmacyOrder.fulfilled, (state, action) => {
        state.loading = false;
        state.orders.unshift(action.payload);
      })
      .addCase(placePharmacyOrder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })


      // Fetch Stores
      .addCase(fetchStores.fulfilled, (state, action) => {
        state.stores = action.payload;
      });
  }
});

export const { clearUploadedPrescription, setUploadedPrescription, clearPharmacyError } = pharmacySlice.actions;
export default pharmacySlice.reducer;

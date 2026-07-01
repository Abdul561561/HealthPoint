import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import themeSlice from './slices/themeSlice';
import healthSlice from './slices/healthSlice';
import uiSlice from './slices/uiSlice';
import pharmacySlice from './slices/pharmacySlice';
import consultationSlice from './slices/consultationSlice';
import analyticsSlice from './slices/analyticsSlice';
import adminSlice from './slices/adminSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    theme: themeSlice,
    health: healthSlice,
    ui: uiSlice,
    pharmacy: pharmacySlice,
    consultation: consultationSlice,
    analytics: analyticsSlice,
    admin: adminSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export default store;

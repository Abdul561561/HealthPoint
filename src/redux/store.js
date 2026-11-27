import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import themeSlice from './slices/themeSlice';
import healthSlice from './slices/healthSlice';
import uiSlice from './slices/uiSlice';
import pharmacySlice from './slices/pharmacySlice';
import analyticsSlice from './slices/analyticsSlice';
import adminSlice from './slices/adminSlice';
import notificationSlice from './slices/notificationSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    theme: themeSlice,
    health: healthSlice,
    ui: uiSlice,
    pharmacy: pharmacySlice,
    analytics: analyticsSlice,
    admin: adminSlice,
    notifications: notificationSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export default store;

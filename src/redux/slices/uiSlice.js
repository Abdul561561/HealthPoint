import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  sidebarOpen: true,
  sidebarCollapsed: false,
  activeModal: null,
  notifications: [
    { id: 1, title: 'Emergency Alert', message: 'Heat wave warning in Bengaluru. Stay hydrated!', read: false, time: '10:15 AM', type: 'emergency', dateGroup: 'Today' },
    { id: 2, title: 'Medicine Reminder', message: 'Take Pantocid 40mg before breakfast', read: false, time: '8:00 AM', type: 'medication', dateGroup: 'Today' },
    { id: 3, title: 'Appointment Tomorrow', message: 'Dr. Sagar Ithape — Tomorrow 2:30 PM', read: false, time: '4:00 PM', type: 'appointment', dateGroup: 'Today' },
    { id: 4, title: 'Health Score Increased', message: 'Excellent! Your Index Health Score increased by +4.2% this week.', read: true, time: 'Yesterday, 9:00 AM', type: 'tip', dateGroup: 'Yesterday' },
    { id: 5, title: 'Workout Completed', message: 'Leg Day completed: 180 kcal burned in 30 mins', read: true, time: 'Yesterday, 6:30 PM', type: 'tip', dateGroup: 'Yesterday' },
    { id: 6, title: 'Prescription Analysed', message: 'Gemini successfully completed prescription scan analysis.', read: true, time: '2 days ago', type: 'tip', dateGroup: 'Older' },
    { id: 7, title: 'Water Reminder', message: 'Remember to log your water intake. 4 glasses remaining.', read: true, time: '3 days ago', type: 'tip', dateGroup: 'Older' },
    { id: 8, title: 'Insurance Update', message: 'HealthShield Individual Prime document verification completed.', read: true, time: '4 days ago', type: 'tip', dateGroup: 'Older' },
  ],
  cart: [],
  toasts: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    toggleSidebarCollapse: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarOpen: (state, action) => {
      state.sidebarOpen = action.payload;
    },
    openModal: (state, action) => {
      state.activeModal = action.payload;
    },
    closeModal: (state) => {
      state.activeModal = null;
    },
    markNotificationRead: (state, action) => {
      const n = state.notifications.find(n => n.id === action.payload);
      if (n) n.read = true;
    },
    markAllNotificationsRead: (state) => {
      state.notifications.forEach(n => { n.read = true; });
    },
    addToCart: (state, action) => {
      const existing = state.cart.find(i => i.id === action.payload.id);
      if (existing) {
        existing.qty += 1;
      } else {
        state.cart.push({ ...action.payload, qty: 1 });
      }
    },
    removeFromCart: (state, action) => {
      state.cart = state.cart.filter(i => i.id !== action.payload);
    },
    clearCart: (state) => {
      state.cart = [];
    },
    addToast: (state, action) => {
      state.toasts.push({ id: Date.now(), ...action.payload });
    },
    removeToast: (state, action) => {
      state.toasts = state.toasts.filter(t => t.id !== action.payload);
    },
  },
});

export const {
  toggleSidebar, toggleSidebarCollapse, setSidebarOpen,
  openModal, closeModal,
  markNotificationRead, markAllNotificationsRead,
  addToCart, removeFromCart, clearCart,
  addToast, removeToast,
} = uiSlice.actions;

export default uiSlice.reducer;

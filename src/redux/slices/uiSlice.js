import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  sidebarOpen: true,
  sidebarCollapsed: false,
  activeModal: null,
  notifications: [],
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

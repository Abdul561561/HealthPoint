import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import {
  clearAllNotificationsApi,
  clearReadNotificationsApi,
  createNotificationApi,
  createReminderApi,
  deleteNotificationApi,
  deleteReminderApi,
  evaluateRemindersApi,
  fetchNotifications,
  fetchReminders,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  markNotificationUnreadApi,
  updateReminderApi,
} from '../../services/notificationApi';

export const loadNotifications = createAsyncThunk(
  'notifications/load',
  async (filters = {}, { rejectWithValue }) => {
    try {
      return await fetchNotifications(filters);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load notifications');
    }
  }
);

export const addNotification = createAsyncThunk(
  'notifications/create',
  async (payload, { rejectWithValue }) => {
    try {
      return await createNotificationApi(payload);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to create notification');
    }
  }
);

export const markNotifRead = createAsyncThunk(
  'notifications/markRead',
  async (id, { rejectWithValue }) => {
    try {
      await markNotificationReadApi(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to mark notification read');
    }
  }
);

export const markNotifUnread = createAsyncThunk(
  'notifications/markUnread',
  async (id, { rejectWithValue }) => {
    try {
      await markNotificationUnreadApi(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to mark notification unread');
    }
  }
);

export const markAllNotifRead = createAsyncThunk(
  'notifications/markAllRead',
  async (_, { rejectWithValue }) => {
    try {
      await markAllNotificationsReadApi();
      return true;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to mark notifications read');
    }
  }
);

export const removeNotif = createAsyncThunk(
  'notifications/delete',
  async (id, { rejectWithValue }) => {
    try {
      await deleteNotificationApi(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to delete notification');
    }
  }
);

export const clearReadNotif = createAsyncThunk(
  'notifications/clearRead',
  async (_, { rejectWithValue }) => {
    try {
      await clearReadNotificationsApi();
      return true;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to clear read notifications');
    }
  }
);

export const clearAllNotif = createAsyncThunk(
  'notifications/clearAll',
  async (_, { rejectWithValue }) => {
    try {
      await clearAllNotificationsApi();
      return true;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to clear notifications');
    }
  }
);

export const loadReminders = createAsyncThunk(
  'notifications/loadReminders',
  async (_, { rejectWithValue }) => {
    try {
      return await fetchReminders();
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to load reminders');
    }
  }
);

export const addReminder = createAsyncThunk(
  'notifications/addReminder',
  async (payload, { rejectWithValue }) => {
    try {
      return await createReminderApi(payload);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to create reminder');
    }
  }
);

export const editReminder = createAsyncThunk(
  'notifications/editReminder',
  async ({ id, updates }, { rejectWithValue }) => {
    try {
      return await updateReminderApi(id, updates);
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to update reminder');
    }
  }
);

export const removeReminder = createAsyncThunk(
  'notifications/removeReminder',
  async (id, { rejectWithValue }) => {
    try {
      await deleteReminderApi(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to delete reminder');
    }
  }
);

export const triggerReminderEvaluation = createAsyncThunk(
  'notifications/evaluateReminders',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const res = await evaluateRemindersApi();
      await dispatch(loadNotifications());
      return res;
    } catch (err) {
      return rejectWithValue(err.response?.data?.detail || 'Failed to evaluate reminders');
    }
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState: {
    items: [],
    reminders: [],
    loading: false,
    remindersLoading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadNotifications.pending, (state) => {
        state.loading = true;
      })
      .addCase(loadNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = Array.isArray(action.payload) ? action.payload : [];
        state.error = null;
      })
      .addCase(loadNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(addNotification.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      .addCase(markNotifRead.fulfilled, (state, action) => {
        const target = state.items.find((item) => item.id === action.payload);
        if (target) target.read = true;
      })
      .addCase(markNotifUnread.fulfilled, (state, action) => {
        const target = state.items.find((item) => item.id === action.payload);
        if (target) target.read = false;
      })
      .addCase(markAllNotifRead.fulfilled, (state) => {
        state.items.forEach((item) => {
          item.read = true;
        });
      })
      .addCase(removeNotif.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
      })
      .addCase(clearReadNotif.fulfilled, (state) => {
        state.items = state.items.filter((item) => !item.read);
      })
      .addCase(clearAllNotif.fulfilled, (state) => {
        state.items = [];
      })
      .addCase(loadReminders.pending, (state) => {
        state.remindersLoading = true;
      })
      .addCase(loadReminders.fulfilled, (state, action) => {
        state.remindersLoading = false;
        state.reminders = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(loadReminders.rejected, (state, action) => {
        state.remindersLoading = false;
        state.error = action.payload;
      })
      .addCase(addReminder.fulfilled, (state, action) => {
        state.reminders.unshift(action.payload);
      })
      .addCase(editReminder.fulfilled, (state, action) => {
        const idx = state.reminders.findIndex((r) => r.id === action.payload.id);
        if (idx !== -1) state.reminders[idx] = action.payload;
      })
      .addCase(removeReminder.fulfilled, (state, action) => {
        state.reminders = state.reminders.filter((r) => r.id !== action.payload);
      });
  },
});

export default notificationSlice.reducer;

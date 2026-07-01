import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

// Layouts
import DashboardLayout from './layouts/DashboardLayout';
import AuthLayout from './layouts/AuthLayout';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Doctors from './pages/Doctors';
import Pharmacy from './pages/Pharmacy';
import AIAssistant from './pages/AIAssistant';
import HealthRecords from './pages/HealthRecords';
import Fitness from './pages/Fitness';
import Insurance from './pages/Insurance';
import Nutrition from './pages/Nutrition';
import Emergency from './pages/Emergency';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Analytics from './pages/Analytics';
import AdminDashboard from './pages/AdminDashboard';
import Timeline from './pages/Timeline';

// ProtectedRoute Wrapper Component
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Landing Page */}
        <Route path="/" element={<Landing />} />

        {/* Auth Layout & Auth Pages */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>

        {/* Protected Dashboard Views */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/doctors" element={<Doctors />} />
          <Route path="/pharmacy" element={<Pharmacy />} />
          <Route path="/ai-assistant" element={<AIAssistant />} />
          <Route path="/records" element={<HealthRecords />} />
          <Route path="/fitness" element={<Fitness />} />
          <Route path="/insurance" element={<Insurance />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        {/* Fallback Wildcard redirect */}
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/dashboard" : "/"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

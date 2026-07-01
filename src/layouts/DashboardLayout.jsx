import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import Sidebar from '../components/layout/Sidebar';
import Navbar from '../components/layout/Navbar';
import FloatingAI from '../components/FloatingAI';
import { fetchUserProfile } from '../redux/slices/authSlice';
import { fetchHealthData } from '../redux/slices/healthSlice';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export default function DashboardLayout() {
  const { sidebarCollapsed } = useSelector((s) => s.ui);
  const location = useLocation();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchUserProfile());
    dispatch(fetchHealthData());
  }, [dispatch]);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-dark-300">
      <Sidebar />

      {/* Main content area */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}
      >
        <Navbar />

        {/* Page content */}
        <main className="flex-1 pt-16 overflow-auto">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="p-4 lg:p-6 min-h-full flex flex-col justify-between"
          >
            <div>
              <Outlet />
            </div>

            {/* Premium Footer */}
            <footer className="mt-12 pt-6 pb-2 border-t border-slate-200/60 dark:border-white/5 text-slate-400 dark:text-slate-500 text-[10px] sm:text-xs flex flex-col sm:flex-row items-center justify-between gap-4 font-bold uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-800 dark:text-slate-300">HealthPoint AI</span>
                <span>·</span>
                <span>Version 2.0.0</span>
              </div>
              <div className="flex items-center gap-4">
                <a href="#privacy" className="hover:text-primary-500 transition-colors">Privacy Policy</a>
                <a href="#terms" className="hover:text-primary-500 transition-colors">Terms of Service</a>
                <a href="#support" className="hover:text-primary-500 transition-colors">Support Channels</a>
              </div>
              <div className="normal-case tracking-normal">
                Made with <span className="text-rose-500">❤️</span> for a healthier tomorrow
              </div>
            </footer>
          </motion.div>
        </main>
        <FloatingAI />
      </div>
    </div>
  );
}

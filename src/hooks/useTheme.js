import { useSelector, useDispatch } from 'react-redux';
import { toggleTheme, setTheme } from '../redux/slices/themeSlice';
import { useEffect } from 'react';

export const useTheme = () => {
  const dispatch = useDispatch();
  const mode = useSelector((state) => state.theme.mode);

  useEffect(() => {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [mode]);

  return {
    mode,
    isDark: mode === 'dark',
    toggle: () => dispatch(toggleTheme()),
    setMode: (m) => dispatch(setTheme(m)),
  };
};

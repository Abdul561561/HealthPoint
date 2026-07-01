import { useSelector } from 'react-redux';

export const useAuth = () => {
  const { isAuthenticated, user, loading, error } = useSelector((state) => state.auth);
  return { isAuthenticated, user, loading, error };
};

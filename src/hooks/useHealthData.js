import { useSelector } from 'react-redux';

export const useHealthData = () => {
  const { metrics, records, workouts, medications } = useSelector((state) => state.health);
  return { metrics, records, workouts, medications };
};

import { useSelector } from 'react-redux';

export const useHealthData = () => {
  const { metrics, appointments, records, medications } = useSelector((state) => state.health);
  return { metrics, appointments, records, medications };
};

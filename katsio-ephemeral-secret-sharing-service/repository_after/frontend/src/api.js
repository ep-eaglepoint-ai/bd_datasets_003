import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const createSecret = async (secret, ttlHours) => {
  const response = await api.post('/api/secrets', {
    secret,
    ttl_hours: ttlHours,
  });
  return response.data;
};

export const getSecret = async (uuid) => {
  const response = await api.get(`/api/secrets/${uuid}`);
  return response.data;
};


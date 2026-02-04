import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

console.log('API Base URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.config.url, response.status);
    return response;
  },
  (error) => {
    console.error('API Error:', error.config?.url, error.response?.status, error.message);
    return Promise.reject(error);
  }
);
export const countdownApi = {
  create: (data: any) => api.post('/countdowns', data),
  getBySlug: (slug: string) => api.get(`/countdowns/${slug}`), 
  getUserCountdowns: () => api.get('/countdowns/user/mine'),
  update: (id: string, data: any) => api.patch(`/countdowns/${id}`, data),
  delete: (id: string) => api.delete(`/countdowns/${id}`),
};
export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};
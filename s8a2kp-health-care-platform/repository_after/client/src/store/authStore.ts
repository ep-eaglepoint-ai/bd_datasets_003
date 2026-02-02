
import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  role: 'PATIENT' | 'PROVIDER' | 'ADMIN';
}

interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  login: (user, token) => {
      localStorage.setItem('token', token);
      set({ user, token });
  },
  logout: () => {
      localStorage.removeItem('token');
      set({ user: null, token: null });
  },
}));

export interface Countdown {
  id: string;
  slug: string;
  title: string;
  description?: string;
  targetDate: string;
  timezone: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  theme: 'minimal' | 'celebration' | 'elegant' | 'neon';
  backgroundImage?: string;
  isPublic: boolean;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
  userId?: string;
}

export interface CountdownWithTime extends Countdown {
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
    status: 'upcoming' | 'happening' | 'past';
  };
}

export interface User {
  id: string;
  email: string;
  username: string;
  token?: string;
}

export interface CreateCountdownInput {
  title: string;
  description?: string;
  targetDate: string;
  timezone: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  theme: 'minimal' | 'celebration' | 'elegant' | 'neon';
  backgroundImage?: string;
  isPublic: boolean;
  isArchived?: boolean;
}
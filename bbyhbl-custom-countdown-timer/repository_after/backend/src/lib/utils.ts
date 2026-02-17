import { nanoid } from 'nanoid';

export function generateSlug(): string {
  return nanoid(10);
}

export function calculateTimeRemaining(targetDate: Date): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  status: 'upcoming' | 'happening' | 'past';
} {
  const now = new Date();
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  
  const totalSeconds = Math.floor(diffMs / 1000);
  
  if (totalSeconds <= 0) {
    const daysAgo = Math.floor(Math.abs(totalSeconds) / 86400);
    return {
      days: daysAgo,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      status: 'past'
    };
  }
  
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const status = totalSeconds <= 60 ? 'happening' : 'upcoming';
  
  return { days, hours, minutes, seconds, totalSeconds, status };
}

export function formatCountdownDisplay(remaining: ReturnType<typeof calculateTimeRemaining>): string {
  if (remaining.status === 'past') {
    return `${remaining.days} days ago`;
  }
  
  if (remaining.status === 'happening') {
    return 'Happening now!';
  }
  
  return `${remaining.days}d ${remaining.hours}h ${remaining.minutes}m ${remaining.seconds}s`;
}
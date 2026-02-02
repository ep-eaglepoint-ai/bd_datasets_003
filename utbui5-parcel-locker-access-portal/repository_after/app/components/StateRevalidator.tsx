'use client';

import { useEffect } from 'react';

export default function StateRevalidator() {
  useEffect(() => {
    const revalidate = async () => {
      try {
        await fetch('/api/revalidate', {
          method: 'POST',
        });
      } catch (error) {
        console.error('Revalidation error:', error);
      }
    };

    revalidate();
    const interval = setInterval(revalidate, 30000);

    return () => clearInterval(interval);
  }, []);

  return null;
}

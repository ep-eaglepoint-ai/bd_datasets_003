import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import Home from '../../repository_after/frontend/src/pages/Home';
import Browse from '../../repository_after/frontend/src/pages/Browse';
import { AuthProvider } from '../../repository_after/frontend/src/contexts/AuthContext';

import { countdownApi } from '../__mocks__/frontendApiClient';

describe('Pages - Requirements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Home shows user countdown grid when logged in (Requirement 4)', async () => {
    (countdownApi.getUserCountdowns as jest.Mock).mockResolvedValueOnce({
      data: {
        data: [
          {
            id: '1',
            slug: 'soon',
            title: 'Soon',
            targetDate: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
            timezone: 'UTC',
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
            accentColor: '#3B82F6',
            theme: 'minimal',
            isPublic: false,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timeRemaining: { days: 0, hours: 1, minutes: 0, seconds: 0, totalSeconds: 3600, status: 'upcoming' },
          },
        ],
      },
    });

    // AuthProvider reads from localStorage
    window.localStorage.getItem = jest.fn((k: string) => {
      if (k === 'token') return 't';
      if (k === 'user') return JSON.stringify({ id: 'u1', email: 'e@test.com', username: 'u' });
      return null;
    });

    render(
      <MemoryRouter>
        <AuthProvider>
          <Home />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/your countdowns/i)).toBeInTheDocument());
    expect(screen.getByText('Soon')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view/i })).toBeInTheDocument();
  });

  it('Browse lists public countdowns (Requirement 3)', async () => {
    (countdownApi.getPublicCountdowns as jest.Mock).mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'p1',
            slug: 'public',
            title: 'Public',
            targetDate: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
            timezone: 'UTC',
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
            accentColor: '#3B82F6',
            theme: 'minimal',
            isPublic: true,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timeRemaining: { days: 0, hours: 1, minutes: 0, seconds: 0, totalSeconds: 3600, status: 'upcoming' },
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <Browse />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/public countdowns/i)).toBeInTheDocument());
    expect(screen.getByText('Public')).toBeInTheDocument();
  });
});

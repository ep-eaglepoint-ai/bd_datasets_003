import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DateTime } from 'luxon';

import CountdownForm from '../../repository_after/frontend/src/components/CountdownForm';
import CountdownDisplay from '../../repository_after/frontend/src/components/CountdownDisplay';

import { unsplashApi } from '../__mocks__/frontendApiClient';

describe('Frontend Components - Requirements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Requirement 1 + 6
  it('CountdownForm renders required fields, supports themes, and allows custom colors', async () => {
    const onSubmit = jest.fn();
    render(<CountdownForm onSubmit={onSubmit} />);

    expect(screen.getByLabelText(/event title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();

    expect(screen.getByText(/preset themes/i)).toBeInTheDocument();
    expect(screen.getByText('Minimal')).toBeInTheDocument();
    expect(screen.getByText('Celebration')).toBeInTheDocument();
    expect(screen.getByText('Elegant')).toBeInTheDocument();
    expect(screen.getByText('Neon')).toBeInTheDocument();

    // Custom color picker inputs exist
    expect(screen.getByLabelText(/background color/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/text color/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/accent color/i)).toBeInTheDocument();
  });

  it('CountdownForm converts date+time using selected timezone (edge case: non-UTC)', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<CountdownForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/event title/i), 'TZ Test');
    await user.clear(screen.getByLabelText(/target date/i));
    await user.type(screen.getByLabelText(/target date/i), '2026-02-05');
    await user.clear(screen.getByLabelText(/target time/i));
    await user.type(screen.getByLabelText(/target time/i), '12:30');
    await user.selectOptions(screen.getByLabelText(/timezone/i), 'America/New_York');

    await user.click(screen.getByRole('button', { name: /create countdown/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0];
    const expected = DateTime.fromISO('2026-02-05T12:30', { zone: 'America/New_York' }).toUTC().toISO();
    expect(payload.timezone).toBe('America/New_York');
    expect(payload.targetDate).toBe(expected);
  });

  // Unsplash API background selection (Requirement 1)
  it('CountdownForm can search Unsplash and select a background image', async () => {
    const user = userEvent.setup();
    (unsplashApi.search as jest.Mock).mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'img1',
            small: 'https://example.com/small.jpg',
            regular: 'https://example.com/regular.jpg',
            full: 'https://example.com/full.jpg',
            alt: 'A beach',
            credit: 'Tester',
          },
        ],
      },
    });

    const onSubmit = jest.fn();
    render(<CountdownForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/event title/i), 'Unsplash Test');
    await user.clear(screen.getByLabelText(/target date/i));
    await user.type(screen.getByLabelText(/target date/i), '2026-02-05');
    await user.clear(screen.getByLabelText(/target time/i));
    await user.type(screen.getByLabelText(/target time/i), '12:30');

    const searchBox = screen.getByPlaceholderText(/fireworks, beach, neon city/i);
    await act(async () => {
      await user.type(searchBox, 'beach');
    });
    await user.click(screen.getByRole('button', { name: /search/i }));

    await screen.findByAltText(/a beach/i);
    await user.click(screen.getByRole('button', { name: /a beach/i }));

    await user.click(screen.getByRole('button', { name: /create countdown/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.backgroundImage).toBe('https://example.com/regular.jpg');
  });

  // Requirement 2 + 5 + 6
  it('CountdownDisplay shows days/hours/minutes/seconds and correct state text', () => {
    const countdown: any = {
      id: '1',
      slug: 'abc',
      title: 'Display',
      targetDate: new Date(Date.now() + 86400000).toISOString(),
      timezone: 'UTC',
      backgroundColor: '#000000',
      textColor: '#FFFFFF',
      accentColor: '#3B82F6',
      theme: 'neon',
      isPublic: true,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeRemaining: {
        days: 1,
        hours: 2,
        minutes: 3,
        seconds: 4,
        totalSeconds: 1,
        status: 'upcoming',
      },
    };

    render(<CountdownDisplay countdown={countdown} isPreview />);

    expect(screen.getByText('days')).toBeInTheDocument();
    expect(screen.getByText('hours')).toBeInTheDocument();
    expect(screen.getByText('minutes')).toBeInTheDocument();
    expect(screen.getByText('seconds')).toBeInTheDocument();
    expect(screen.getByText(/counting down/i)).toBeInTheDocument();
  });
});

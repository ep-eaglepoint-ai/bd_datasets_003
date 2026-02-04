import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import SecretViewer from '../repository_after/frontend/src/components/SecretViewer';
import * as api from '../repository_after/frontend/src/api';

// Mock the API module
vi.mock('../repository_after/frontend/src/api', () => ({
  getSecret: vi.fn(),
}));

// Mock useParams
const mockUseParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
  };
});

describe('SecretViewer - Integration Tests for Shoulder-Surfing Prevention', () => {
  const mockUuid = 'test-uuid-456';
  const sensitiveSecret = 'sk_live_51H3ll0W0r1d_Th1sIsAS3cr3tK3y123456789';

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ uuid: mockUuid });
  });

  it('should prevent secret exposure in initial render (shoulder-surfing protection)', async () => {
    api.getSecret.mockResolvedValue({ secret: sensitiveSecret });

    const { container } = render(
      <BrowserRouter>
        <SecretViewer />
      </BrowserRouter>
    );

    // Wait for API call
    await waitFor(() => {
      expect(api.getSecret).toHaveBeenCalled();
    });

    // Critical: Secret should NOT be in DOM at all
    const domString = container.innerHTML;
    expect(domString).not.toContain(sensitiveSecret);
    expect(domString).not.toContain('sk_live');
    expect(domString).not.toContain('S3cr3tK3y');

    // Verify only safe UI elements are present
    expect(screen.getByText(/Secret Retrieved/)).toBeInTheDocument();
    expect(screen.getByText('Reveal Secret')).toBeInTheDocument();
  });

  it('should only expose secret after explicit user interaction', async () => {
    api.getSecret.mockResolvedValue({ secret: sensitiveSecret });

    const { container } = render(
      <BrowserRouter>
        <SecretViewer />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(api.getSecret).toHaveBeenCalled();
    });

    // Before reveal: secret not in DOM
    expect(container.innerHTML).not.toContain(sensitiveSecret);

    // User must explicitly click reveal
    const revealButton = screen.getByText('Reveal Secret');
    await userEvent.click(revealButton);

    // After reveal: secret is now in DOM
    await waitFor(() => {
      expect(screen.getByText(sensitiveSecret)).toBeInTheDocument();
    });
    expect(container.innerHTML).toContain(sensitiveSecret);
  });

  it('should handle multiple secrets without leaking previous secrets', async () => {
    const secret1 = 'first-secret-123';
    const secret2 = 'second-secret-456';

    // First render with secret1
    api.getSecret.mockResolvedValueOnce({ secret: secret1 });
    mockUseParams.mockReturnValueOnce({ uuid: 'uuid-1' });

    const { rerender } = render(
      <MemoryRouter initialEntries={['/secret/uuid-1']}>
        <SecretViewer />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.getSecret).toHaveBeenCalledWith('uuid-1');
    });

    // Reveal first secret
    await userEvent.click(screen.getByText('Reveal Secret'));
    await waitFor(() => {
      expect(screen.getByText(secret1)).toBeInTheDocument();
    });

    // Switch to second secret (simulating navigation)
    api.getSecret.mockResolvedValueOnce({ secret: secret2 });
    mockUseParams.mockReturnValueOnce({ uuid: 'uuid-2' });

    rerender(
      <MemoryRouter initialEntries={['/secret/uuid-2']}>
        <SecretViewer />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.getSecret).toHaveBeenCalledWith('uuid-2');
    });

    // Second secret should be masked initially
    expect(screen.queryByText(secret2)).not.toBeInTheDocument();
    expect(screen.getByText('Reveal Secret')).toBeInTheDocument();
  });

  it('should maintain masking state correctly during component lifecycle', async () => {
    api.getSecret.mockResolvedValue({ secret: sensitiveSecret });

    const { unmount, container } = render(
      <BrowserRouter>
        <SecretViewer />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(api.getSecret).toHaveBeenCalled();
    });

    // Verify masked
    expect(container.innerHTML).not.toContain(sensitiveSecret);

    // Unmount and remount (simulating page refresh)
    unmount();

    const { container: newContainer } = render(
      <BrowserRouter>
        <SecretViewer />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(api.getSecret).toHaveBeenCalledTimes(2);
    });

    // Should still be masked after remount
    expect(newContainer.innerHTML).not.toContain(sensitiveSecret);
  });

  it('should prevent secret from appearing in accessibility tree before reveal', async () => {
    api.getSecret.mockResolvedValue({ secret: sensitiveSecret });

    render(
      <BrowserRouter>
        <SecretViewer />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(api.getSecret).toHaveBeenCalled();
    });

    // Check accessibility tree
    const secretElement = screen.queryByText(sensitiveSecret);
    expect(secretElement).not.toBeInTheDocument();

    // Verify reveal button is accessible
    const revealButton = screen.getByRole('button', { name: /reveal secret/i });
    expect(revealButton).toBeInTheDocument();
  });
});


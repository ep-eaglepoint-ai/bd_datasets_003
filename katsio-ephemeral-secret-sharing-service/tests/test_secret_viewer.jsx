import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
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

describe('SecretViewer - Secret Masking Tests', () => {
  const mockUuid = 'test-uuid-123';
  const mockSecret = 'my-secret-api-key-12345';

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ uuid: mockUuid });
  });

  describe('Unit Tests - Secret Masking', () => {
    it('should not display secret content initially (masked)', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      // Wait for secret to be fetched
      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Verify secret is NOT visible in the DOM
      expect(screen.queryByText(mockSecret)).not.toBeInTheDocument();
      
      // Verify reveal button is present
      expect(screen.getByText('Reveal Secret')).toBeInTheDocument();
      
      // Verify secret content element does not exist
      const secretContent = screen.queryByText(mockSecret, { exact: false });
      expect(secretContent).not.toBeInTheDocument();
    });

    it('should display secret only after clicking reveal button', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      // Wait for secret to be fetched
      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Verify secret is NOT visible initially
      expect(screen.queryByText(mockSecret)).not.toBeInTheDocument();

      // Click the reveal button
      const revealButton = screen.getByText('Reveal Secret');
      await userEvent.click(revealButton);

      // Now verify secret IS visible
      await waitFor(() => {
        expect(screen.getByText(mockSecret)).toBeInTheDocument();
      });

      // Verify reveal button is gone
      expect(screen.queryByText('Reveal Secret')).not.toBeInTheDocument();
    });

    it('should prevent shoulder-surfing by not rendering secret in DOM until revealed', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      const { container } = render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Check that secret text is NOT anywhere in the DOM
      const htmlContent = container.innerHTML;
      expect(htmlContent).not.toContain(mockSecret);

      // Verify reveal section is present
      expect(screen.getByText(/Click the button below to reveal the secret/)).toBeInTheDocument();
    });

    it('should show reveal button initially, not secret display', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Verify reveal section is shown
      expect(screen.getByText(/Click the button below to reveal the secret/)).toBeInTheDocument();
      expect(screen.getByText('Reveal Secret')).toBeInTheDocument();

      // Verify secret display section is NOT shown
      expect(screen.queryByText('Copy Secret')).not.toBeInTheDocument();
      expect(screen.queryByText(/Remember: This secret has been deleted/)).not.toBeInTheDocument();
    });

    it('should show secret display after reveal, not reveal button', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Click reveal
      const revealButton = screen.getByText('Reveal Secret');
      await userEvent.click(revealButton);

      // Verify secret display is shown
      await waitFor(() => {
        expect(screen.getByText(mockSecret)).toBeInTheDocument();
        expect(screen.getByText('Copy Secret')).toBeInTheDocument();
        expect(screen.getByText(/Remember: This secret has been deleted/)).toBeInTheDocument();
      });

      // Verify reveal section is gone
      expect(screen.queryByText(/Click the button below to reveal the secret/)).not.toBeInTheDocument();
      expect(screen.queryByText('Reveal Secret')).not.toBeInTheDocument();
    });
  });

  describe('Integration Tests - Secret Masking Flow', () => {
    it('should complete full flow: fetch -> mask -> reveal -> display', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      // Step 1: Verify loading state
      expect(screen.getByText('Loading secret...')).toBeInTheDocument();

      // Step 2: Wait for fetch to complete
      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Step 3: Verify secret is masked (not visible)
      await waitFor(() => {
        expect(screen.queryByText('Loading secret...')).not.toBeInTheDocument();
      });
      expect(screen.queryByText(mockSecret)).not.toBeInTheDocument();
      expect(screen.getByText('Reveal Secret')).toBeInTheDocument();

      // Step 4: Click reveal
      const revealButton = screen.getByText('Reveal Secret');
      await userEvent.click(revealButton);

      // Step 5: Verify secret is now visible
      await waitFor(() => {
        expect(screen.getByText(mockSecret)).toBeInTheDocument();
      });
      expect(screen.getByText('Copy Secret')).toBeInTheDocument();
    });

    it('should maintain secret masking even if component re-renders before reveal', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      const { rerender } = render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Verify secret is masked
      expect(screen.queryByText(mockSecret)).not.toBeInTheDocument();

      // Force re-render (simulating parent update)
      rerender(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      // Secret should still be masked
      expect(screen.queryByText(mockSecret)).not.toBeInTheDocument();
      expect(screen.getByText('Reveal Secret')).toBeInTheDocument();
    });

    it('should prevent secret from being visible in DOM source inspection', async () => {
      api.getSecret.mockResolvedValue({ secret: mockSecret });

      const { container } = render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Get all text nodes in the DOM
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
      );

      let foundSecret = false;
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(mockSecret)) {
          foundSecret = true;
          break;
        }
      }

      // Secret should NOT be found in any text node
      expect(foundSecret).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should not show secret when API call fails', async () => {
      api.getSecret.mockRejectedValue(new Error('Secret not found'));

      render(
        <BrowserRouter>
          <SecretViewer />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(api.getSecret).toHaveBeenCalledWith(mockUuid);
      });

      // Verify error is shown, not secret
      await waitFor(() => {
        expect(screen.getByText('Secret Unavailable')).toBeInTheDocument();
      });

      // Secret should never be visible
      expect(screen.queryByText(mockSecret)).not.toBeInTheDocument();
      expect(screen.queryByText('Reveal Secret')).not.toBeInTheDocument();
    });
  });
});


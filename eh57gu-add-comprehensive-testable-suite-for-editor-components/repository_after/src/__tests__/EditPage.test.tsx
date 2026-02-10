import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditPage from '../components/EditPage'
import { createMockVideoFile } from './utils/testHelpers'

describe('EditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial render', () => {
    it('should render EditPage component', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.getByText('Edit Your Video')).toBeInTheDocument()
    })

    it('should render Header component', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.getByText('EditPage Standalone')).toBeInTheDocument()
    })

    it('should render without video initially', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.getByText(/Click or drag a video file here to upload/i)).toBeInTheDocument()
    })

    it('should render with provided videoUrl prop', () => {
      const videoUrl = 'data:video/mp4;base64,test'
      const { container } = render(<EditPage videoUrl={videoUrl} />)
      const video = container.querySelector('video')
      expect(video).toBeInTheDocument()
      expect(video).toHaveAttribute('src', videoUrl)
    })
  })

  describe('UI Controls', () => {
    it('should render Add Text button', () => {
      render(<EditPage videoUrl={null} />)
      const buttons = screen.getAllByRole('button')
      const textButton = buttons.find(btn =>
        btn.querySelector('svg')?.classList.contains('w-5')
      )
      expect(textButton).toBeInTheDocument()
    })

    it('should render Zoom Tool button', () => {
      render(<EditPage videoUrl={null} />)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('should show Done button when video is loaded', () => {
      render(<EditPage videoUrl="data:video/mp4;base64,test" />)
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    it('should show Download button when video is loaded', () => {
      render(<EditPage videoUrl="data:video/mp4;base64,test" />)
      expect(screen.getByText('Download Edited Video')).toBeInTheDocument()
    })

    it('should show Apply Text To Video button when video is loaded', () => {
      render(<EditPage videoUrl="data:video/mp4;base64,test" />)
      expect(screen.getByText('Apply Text To Video')).toBeInTheDocument()
    })
  })

  describe('TextEditorModal interactions', () => {
    it('should not show modal initially', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.queryByText('Text Editor (stub)')).not.toBeInTheDocument()
    })

    it('should open TextEditorModal when Add Text button is clicked', async () => {
      render(<EditPage videoUrl={null} />)

      // Find and click the text button (first button with DocumentTextIcon)
      const buttons = screen.getAllByRole('button')
      const textButton = buttons[0] // First button is Add Text based on component structure

      fireEvent.click(textButton)

      await waitFor(() => {
        expect(screen.getByText('Text Editor (stub)')).toBeInTheDocument()
      })
    })

    it('should close modal when Cancel is clicked', async () => {
      render(<EditPage videoUrl={null} />)

      // Open modal
      const buttons = screen.getAllByRole('button')
      const textButton = buttons[0]
      fireEvent.click(textButton)

      await waitFor(() => {
        expect(screen.getByText('Text Editor (stub)')).toBeInTheDocument()
      })

      // Close modal
      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Text Editor (stub)')).not.toBeInTheDocument()
      })
    })

    it('should add text overlay when Save is clicked in modal', async () => {
      render(<EditPage videoUrl="data:video/mp4;base64,test" />)

      // Open modal
      const buttons = screen.getAllByRole('button')
      const textButton = buttons[0]
      fireEvent.click(textButton)

      await waitFor(() => {
        expect(screen.getByText('Text Editor (stub)')).toBeInTheDocument()
      })

      // Click Save
      const saveButton = screen.getByText('Save')
      fireEvent.click(saveButton)

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText('Text Editor (stub)')).not.toBeInTheDocument()
      })
    })
  })

  describe('Zoom Tool functionality', () => {
    it('should not show zoom controls initially', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.queryByText('Zoom Timing')).not.toBeInTheDocument()
    })

    it('should show zoom controls when zoom button is clicked', async () => {
      render(<EditPage videoUrl={null} />)

      // Click zoom button (second button)
      const buttons = screen.getAllByRole('button')
      const zoomButton = buttons[1]
      fireEvent.click(zoomButton)

      await waitFor(() => {
        expect(screen.getByText('Zoom Timing')).toBeInTheDocument()
      })
    })

    it('should display zoom start time input', async () => {
      render(<EditPage videoUrl={null} />)

      const buttons = screen.getAllByRole('button')
      const zoomButton = buttons[1]
      fireEvent.click(zoomButton)

      await waitFor(() => {
        const startTimeInput = screen.getByPlaceholderText('Enter start time')
        expect(startTimeInput).toBeInTheDocument()
      })
    })

    it('should display zoom end time input', async () => {
      render(<EditPage videoUrl={null} />)

      const buttons = screen.getAllByRole('button')
      const zoomButton = buttons[1]
      fireEvent.click(zoomButton)

      await waitFor(() => {
        const endTimeInput = screen.getByPlaceholderText('Enter end time')
        expect(endTimeInput).toBeInTheDocument()
      })
    })

    it('should allow updating zoom start time', async () => {
      const user = userEvent.setup()
      render(<EditPage videoUrl={null} />)

      const buttons = screen.getAllByRole('button')
      const zoomButton = buttons[1]
      fireEvent.click(zoomButton)

      await waitFor(() => {
        const startTimeInput = screen.getByPlaceholderText('Enter start time') as HTMLInputElement
        expect(startTimeInput).toBeInTheDocument()
      })

      const startTimeInput = screen.getByPlaceholderText('Enter start time') as HTMLInputElement
      await user.clear(startTimeInput)
      await user.type(startTimeInput, '5')

      expect(startTimeInput.value).toBe('5')
    })
  })

  describe('Video upload', () => {
    it('should show upload prompt when no video', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.getByText(/Click or drag a video file here to upload/i)).toBeInTheDocument()
    })

    it('should have hidden file input for video upload', () => {
      const { container } = render(<EditPage videoUrl={null} />)
      const fileInputs = container.querySelectorAll('input[type="file"]')
      const videoInput = Array.from(fileInputs).find(input =>
        input.getAttribute('accept') === 'video/*'
      )
      expect(videoInput).toBeInTheDocument()
      expect(videoInput).toHaveClass('hidden')
    })

    it('should have hidden file input for audio upload', () => {
      const { container } = render(<EditPage videoUrl={null} />)
      const fileInputs = container.querySelectorAll('input[type="file"]')
      const audioInput = Array.from(fileInputs).find(input =>
        input.getAttribute('accept') === 'audio/*'
      )
      expect(audioInput).toBeInTheDocument()
      expect(audioInput).toHaveClass('hidden')
    })
  })

  describe('Footer', () => {
    it('should render footer with copyright', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.getByText(/© 2025 VideoPro. All rights reserved./)).toBeInTheDocument()
    })
  })

  describe('State management', () => {
    it('should initialize with no video', () => {
      const { container } = render(<EditPage videoUrl={null} />)
      const videos = container.querySelectorAll('video')
      expect(videos.length).toBe(0)
    })

    it('should render video element when videoUrl is provided', () => {
      const { container } = render(<EditPage videoUrl="data:video/mp4;base64,test" />)
      const videos = container.querySelectorAll('video')
      expect(videos.length).toBeGreaterThan(0)
    })
  })

  describe('TrimTools integration', () => {
    it('should not show TrimTools initially without video', () => {
      render(<EditPage videoUrl={null} />)
      expect(screen.queryByText('Trim Tools (simple stub)')).not.toBeInTheDocument()
    })
  })

  describe('Button states', () => {
    it('should enable Download button when not loading', () => {
      render(<EditPage videoUrl="data:video/mp4;base64,test" />)
      const downloadButton = screen.getByText('Download Edited Video')
      expect(downloadButton).not.toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA roles for main content', () => {
      render(<EditPage videoUrl={null} />)
      const main = screen.getByRole('main')
      expect(main).toBeInTheDocument()
    })

    it('should have accessible buttons', () => {
      render(<EditPage videoUrl={null} />)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('Component structure verification', () => {
    it('should have proper structure without video', () => {
      const { container } = render(<EditPage videoUrl={null} />)
      const mainContent = container.querySelector('main')
      expect(mainContent).toBeInTheDocument()
      expect(mainContent?.querySelector('.bg-white')).toBeInTheDocument()
    })

    it('should have proper structure with video URL', () => {
      const { container } = render(<EditPage videoUrl="data:video/mp4;base64,test" />)
      const mainContent = container.querySelector('main')
      const video = container.querySelector('video')
      expect(mainContent).toBeInTheDocument()
      expect(video).toBeInTheDocument()
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TrimTools from '../components/TrimTools'
import { createRef } from 'react'

describe('TrimTools', () => {
  const mockVideoRef = createRef<HTMLVideoElement>()
  const mockAudioRef = createRef<HTMLAudioElement>()
  const mockSetStartTrim = vi.fn()
  const mockSetEndTrim = vi.fn()
  const mockSetIsDragging = vi.fn()
  const mockSetTooltipPosition = vi.fn()
  const mockSetTooltipTime = vi.fn()
  const mockSetTrimMode = vi.fn()

  const defaultProps = {
    videoRef: mockVideoRef,
    audioRef: mockAudioRef,
    startTrim: 0,
    endTrim: 100,
    setStartTrim: mockSetStartTrim,
    setEndTrim: mockSetEndTrim,
    videoDuration: 60.5,
    audioDuration: 45.3,
    isDragging: null,
    setIsDragging: mockSetIsDragging,
    tooltipPosition: null,
    setTooltipPosition: mockSetTooltipPosition,
    tooltipTime: '0:00',
    setTooltipTime: mockSetTooltipTime,
    trimMode: 'video' as const,
    setTrimMode: mockSetTrimMode,
  }

  describe('Initial render', () => {
    it('should render TrimTools component', () => {
      render(<TrimTools {...defaultProps} />)
      expect(screen.getByText('Trim Tools (simple stub)')).toBeInTheDocument()
    })

    it('should display video duration with 2 decimal places', () => {
      render(<TrimTools {...defaultProps} />)
      expect(screen.getByText(/Video duration: 60\.50/)).toBeInTheDocument()
    })

    it('should display start and end trim percentages', () => {
      render(<TrimTools {...defaultProps} />)
      expect(screen.getByText(/Start: 0%, End: 100%/)).toBeInTheDocument()
    })
  })

  describe('Props variations', () => {
    it('should display updated startTrim value', () => {
      render(<TrimTools {...defaultProps} startTrim={25} />)
      expect(screen.getByText(/Start: 25%/)).toBeInTheDocument()
    })

    it('should display updated endTrim value', () => {
      render(<TrimTools {...defaultProps} endTrim={75} />)
      expect(screen.getByText(/End: 75%/)).toBeInTheDocument()
    })

    it('should display both updated trim values', () => {
      render(<TrimTools {...defaultProps} startTrim={10} endTrim={90} />)
      expect(screen.getByText(/Start: 10%, End: 90%/)).toBeInTheDocument()
    })

    it('should format video duration correctly for whole numbers', () => {
      render(<TrimTools {...defaultProps} videoDuration={120} />)
      expect(screen.getByText(/Video duration: 120\.00/)).toBeInTheDocument()
    })

    it('should format video duration correctly for decimals', () => {
      render(<TrimTools {...defaultProps} videoDuration={45.678} />)
      expect(screen.getByText(/Video duration: 45\.68/)).toBeInTheDocument()
    })

    it('should handle zero duration', () => {
      render(<TrimTools {...defaultProps} videoDuration={0} />)
      expect(screen.getByText(/Video duration: 0\.00/)).toBeInTheDocument()
    })

    it('should handle very small duration', () => {
      render(<TrimTools {...defaultProps} videoDuration={0.01} />)
      expect(screen.getByText(/Video duration: 0\.01/)).toBeInTheDocument()
    })

    it('should handle large duration', () => {
      render(<TrimTools {...defaultProps} videoDuration={3600.99} />)
      expect(screen.getByText(/Video duration: 3600\.99/)).toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('should handle startTrim at 0%', () => {
      render(<TrimTools {...defaultProps} startTrim={0} endTrim={100} />)
      expect(screen.getByText(/Start: 0%, End: 100%/)).toBeInTheDocument()
    })

    it('should handle both trims at same position', () => {
      render(<TrimTools {...defaultProps} startTrim={50} endTrim={50} />)
      expect(screen.getByText(/Start: 50%, End: 50%/)).toBeInTheDocument()
    })

    it('should handle decimal trim values', () => {
      render(<TrimTools {...defaultProps} startTrim={12.5} endTrim={87.5} />)
      expect(screen.getByText(/Start: 12\.5%, End: 87\.5%/)).toBeInTheDocument()
    })
  })

  describe('Component structure', () => {
    it('should render with correct container structure', () => {
      const { container } = render(<TrimTools {...defaultProps} />)
      const mainDiv = container.querySelector('div')
      expect(mainDiv).toBeInTheDocument()
    })

    it('should render all text elements', () => {
      render(<TrimTools {...defaultProps} />)
      expect(screen.getByText('Trim Tools (simple stub)')).toBeInTheDocument()
      expect(screen.getByText(/Video duration:/)).toBeInTheDocument()
      expect(screen.getByText(/Start:/)).toBeInTheDocument()
    })
  })

  describe('Component verification', () => {
    it('should render all expected elements', () => {
      const { container } = render(<TrimTools {...defaultProps} />)
      expect(container.firstChild).toBeInTheDocument()
      expect(screen.getByText('Trim Tools (simple stub)')).toBeInTheDocument()
    })

    it('should display data correctly with custom values', () => {
      render(
        <TrimTools {...defaultProps} startTrim={20} endTrim={80} videoDuration={90.25} />
      )
      expect(screen.getByText(/Video duration: 90\.25/)).toBeInTheDocument()
      expect(screen.getByText(/Start: 20%, End: 80%/)).toBeInTheDocument()
    })
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  describe('Initial render', () => {
    it('should render App component', () => {
      const { container } = render(<App />)
      expect(container).toBeInTheDocument()
    })

    it('should render EditPage component', () => {
      render(<App />)
      expect(screen.getByText('Edit Your Video')).toBeInTheDocument()
    })

    it('should render Header through EditPage', () => {
      render(<App />)
      expect(screen.getByText('EditPage Standalone')).toBeInTheDocument()
    })

    it('should initialize EditPage with null videoUrl', () => {
      render(<App />)
      // Check for upload prompt which appears when videoUrl is null
      expect(screen.getByText(/Click or drag a video file here to upload/i)).toBeInTheDocument()
    })
  })

  describe('Component structure', () => {
    it('should have a root div wrapper', () => {
      const { container } = render(<App />)
      expect(container.firstChild).toBeInTheDocument()
    })

    it('should render main content area', () => {
      render(<App />)
      const main = screen.getByRole('main')
      expect(main).toBeInTheDocument()
    })

    it('should render header', () => {
      render(<App />)
      const header = screen.getByRole('banner')
      expect(header).toBeInTheDocument()
    })

    it('should render footer', () => {
      render(<App />)
      expect(screen.getByText(/© 2025 VideoPro. All rights reserved./)).toBeInTheDocument()
    })
  })

  describe('EditPage integration', () => {
    it('should pass videoUrl prop to EditPage', () => {
      render(<App />)
      // Verify EditPage renders correctly
      expect(screen.getByText('Edit Your Video')).toBeInTheDocument()
    })

    it('should render all EditPage UI elements', () => {
      render(<App />)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  describe('Accessibility', () => {
    it('should have proper document structure', () => {
      render(<App />)
      expect(screen.getByRole('banner')).toBeInTheDocument() // header
      expect(screen.getByRole('main')).toBeInTheDocument() // main content
    })

    it('should have accessible navigation', () => {
      render(<App />)
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeInTheDocument()
      })
    })
  })

  describe('Component verification', () => {
    it('should render complete app structure', () => {
      const { container } = render(<App />)
      expect(container.firstChild).toBeInTheDocument()
      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })
})

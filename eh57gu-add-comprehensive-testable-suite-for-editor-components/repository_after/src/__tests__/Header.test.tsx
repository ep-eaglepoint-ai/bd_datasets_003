import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Header from '../components/Header'

describe('Header', () => {
  describe('Initial render', () => {
    it('should render the header element', () => {
      render(<Header />)
      const header = screen.getByRole('banner')
      expect(header).toBeInTheDocument()
    })

    it('should display the application title', () => {
      render(<Header />)
      const title = screen.getByText('EditPage Standalone')
      expect(title).toBeInTheDocument()
    })

    it('should have correct heading level', () => {
      render(<Header />)
      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toBeInTheDocument()
      expect(heading).toHaveTextContent('EditPage Standalone')
    })
  })

  describe('Styling and layout', () => {
    it('should have proper semantic structure', () => {
      render(<Header />)
      const header = screen.getByRole('banner')
      expect(header.tagName).toBe('HEADER')
    })

    it('should contain a container div', () => {
      const { container } = render(<Header />)
      const headerElement = container.querySelector('header')
      const containerDiv = headerElement?.querySelector('.max-w-7xl')
      expect(containerDiv).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should be accessible by role', () => {
      render(<Header />)
      const banner = screen.getByRole('banner')
      expect(banner).toBeInTheDocument()
    })

    it('should have proper heading hierarchy', () => {
      render(<Header />)
      const h1 = screen.getByRole('heading', { level: 1 })
      expect(h1).toBeInTheDocument()
    })
  })

  describe('Component structure', () => {
    it('should have correct class names', () => {
      const { container } = render(<Header />)
      const header = container.querySelector('header')
      expect(header).toHaveClass('bg-white', 'shadow-sm')
    })
  })
})

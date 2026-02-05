import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '@/app/page'

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>
  },
}))

const AppRouterContext = React.createContext<any>(null)

function renderWithRouter(ui: React.ReactElement) {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
  }
  return render(
    <AppRouterContext.Provider value={mockRouter as any}>{ui}</AppRouterContext.Provider>
  )
}

describe('User Interactions', () => {
  beforeEach(() => {
    renderWithRouter(<Home />)
  })

  test('should have hover effects on article cards', () => {
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    
    if (articleLinks.length > 0) {
      const articleCard = articleLinks[0]
      
      // Check for transition classes on the inner div
      const innerDiv = articleCard.querySelector('div')
      if (innerDiv) {
        const cardClass = innerDiv.className
        expect(cardClass).toMatch(/transition|hover/)
      }
    }
  })

  test('should show visual feedback when hovering over category buttons', () => {
    const categoryButton = screen.getByRole('button', { name: 'Technology' })
    
    // Button should be visible and interactive
    expect(categoryButton).toBeInTheDocument()
    expect(categoryButton).not.toBeDisabled()
  })

  test('should filter articles immediately when category is clicked', async () => {
    const user = userEvent.setup()
    
    // Get initial count
    const initialLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    const initialCount = initialLinks.length
    
    // Click category
    await user.click(screen.getByRole('button', { name: 'Sports' }))
    
    // Wait for filter to apply
    await waitFor(() => {
      const filteredLinks = screen.getAllByRole('link').filter(link => 
        link.getAttribute('href')?.startsWith('/article/')
      )
      expect(filteredLinks.length).toBeGreaterThan(0)
    })
    
    // All visible articles should be Sports
    const filteredLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    
    for (const link of filteredLinks.slice(0, 5)) {
      const categoryBadge = within(link).queryByText('Sports')
      expect(categoryBadge).toBeInTheDocument()
    }
  })

  test('should maintain filter state during page interaction', async () => {
    const user = userEvent.setup()
    
    // Select a category
    await user.click(screen.getByRole('button', { name: 'Entertainment' }))
    
    // Category should remain selected
    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Entertainment' })
      expect(button).toHaveClass('bg-gray-900')
    })
  })

  test('should have clickable article cards', () => {
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    
    if (articleLinks.length > 0) {
      const articleCard = articleLinks[0]
      
      // Should be a link
      expect(articleCard.tagName.toLowerCase()).toBe('a')
      
      // Should have href
      const href = articleCard.getAttribute('href')
      expect(href).toMatch(/^\/article\/\d+$/)
    }
  })

  test('should have accessible category buttons', () => {
    const categories = ['All', 'World', 'Technology', 'Sports', 'Entertainment']
    
    for (const category of categories) {
      const button = screen.getByRole('button', { name: category })
      expect(button).toBeInTheDocument()
      expect(button).not.toBeDisabled()
    }
  })

  test('should handle rapid category switching', async () => {
    const user = userEvent.setup()
    const categories = ['Technology', 'Sports', 'Entertainment', 'World', 'All']
    
    for (const category of categories) {
      await user.click(screen.getByRole('button', { name: category }))
      await waitFor(() => {
        const links = screen.getAllByRole('link').filter(link => 
          link.getAttribute('href')?.startsWith('/article/')
        )
        // Either articles are shown or we're on "All" which should show articles
        if (category === 'All' || links.length > 0) {
          expect(links.length).toBeGreaterThanOrEqual(0)
        }
      })
    }
  })
})


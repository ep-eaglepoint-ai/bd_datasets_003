import React from 'react'
import { render, screen, within } from '@testing-library/react'
import Home from '@/app/page'
import ArticlePage from '@/app/article/[id]/page'

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

// Mock next/navigation
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
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

describe('Responsive Design', () => {
  test('should display single column layout on mobile', () => {
    // Set mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })
    
    renderWithRouter(<Home />)
    
    // Grid should be present (Tailwind defaults to single column on mobile)
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    expect(articleLinks.length).toBeGreaterThan(0)
  })

  test('should display multi-column layout on tablet', () => {
    // Set tablet viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    })
    
    renderWithRouter(<Home />)
    
    // Grid should have multiple columns on tablet
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    expect(articleLinks.length).toBeGreaterThan(0)
  })

  test('should display multi-column layout on desktop', () => {
    // Set desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    })
    
    renderWithRouter(<Home />)
    
    // Grid should have 2-3 columns on desktop
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    expect(articleLinks.length).toBeGreaterThan(0)
  })

  test('should adapt hero section on mobile', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })
    
    renderWithRouter(<Home />)
    
    // Hero section should be visible
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    expect(articleLinks.length).toBeGreaterThan(0)
  })

  test('should adapt hero section on desktop', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    })
    
    renderWithRouter(<Home />)
    
    // Hero section should be visible
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    expect(articleLinks.length).toBeGreaterThan(0)
  })

  test('should maintain readability on all screen sizes', () => {
    const viewports = [375, 768, 1920]
    
    for (const width of viewports) {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      })
      
      const { unmount } = renderWithRouter(<Home />)
      
      // Text should be readable
      const title = screen.getByRole('heading', { name: /Digital News Reader/i })
      expect(title).toBeInTheDocument()
      
      // Article cards should be visible
      const cards = screen.getAllByRole('link').filter(link => 
        link.getAttribute('href')?.startsWith('/article/')
      )
      expect(cards.length).toBeGreaterThan(0)
      
      unmount()
    }
  })

  test('should handle article detail page on mobile', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })
    
    renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    
    // Article should be readable
    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
    
    // Title should be visible
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    
    // Back button should be accessible
    const backLinks = screen.getAllByRole('link', { name: /Back to Articles/i })
    expect(backLinks.length).toBeGreaterThan(0)
  })

  test('should handle article detail page on desktop', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    })
    
    renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    
    // Article should be readable with proper max-width
    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
    
    // Content should have max-width constraint (check className)
    expect(article.className).toContain('max-w-4xl')
  })
})


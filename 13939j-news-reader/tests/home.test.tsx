import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '@/app/page'
import { articles } from '@/lib/articles'

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

describe('Home Page', () => {
  beforeEach(() => {
    renderWithRouter(<Home />)
  })

  test('should display the page title', () => {
    const title = screen.getByRole('heading', { name: /Digital News Reader/i })
    expect(title).toBeInTheDocument()
  })

  test('should display category navigation bar', () => {
    const nav = screen.getByRole('navigation')
    expect(nav).toBeInTheDocument()
    
    // Check for "All" option
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
  })

  test('should display all available categories', () => {
    const categories = ['All', 'World', 'Technology', 'Sports', 'Entertainment']
    
    for (const category of categories) {
      expect(screen.getByRole('button', { name: category })).toBeInTheDocument()
    }
  })

  test('should display hero articles prominently', () => {
    // The hero section is the first <section> inside the main content area
    const main = screen.getByRole('main')
    const heroSection = main.querySelector('section')

    expect(heroSection).not.toBeNull()

    // Hero section should contain 1–2 prominent article links
    const heroLinks = heroSection?.querySelectorAll('a[href^="/article/"]') || []
    expect(heroLinks.length).toBeGreaterThanOrEqual(1)
    expect(heroLinks.length).toBeLessThanOrEqual(2)
  })

  test('should display article grid below hero section', () => {
    // Look for links that point to article detail pages
    const articleLinks = screen
      .getAllByRole('link')
      .filter(link => link.getAttribute('href')?.startsWith('/article/'))
    expect(articleLinks.length).toBeGreaterThan(0)
  })

  test('should display article cards with required information', async () => {
    const articleLinks = screen.getAllByRole('link')
    const articleLink = articleLinks.find(link => link.getAttribute('href')?.startsWith('/article/'))
    
    expect(articleLink).toBeInTheDocument()
    
    if (articleLink) {
      // Check for image
      const image = within(articleLink as HTMLElement).queryByRole('img')
      expect(image).toBeInTheDocument()
      
      // Check for title (h2 or h3)
      const title = within(articleLink as HTMLElement).queryByRole('heading', { level: 2 }) ||
                   within(articleLink as HTMLElement).queryByRole('heading', { level: 3 })
      expect(title).toBeInTheDocument()
      
      // Check for category badge: a span whose text is one of the known categories
      const categorySpans = within(articleLink as HTMLElement).queryAllByText(
        (content, node) =>
          node?.tagName === 'SPAN' &&
          ['World', 'Technology', 'Sports', 'Entertainment'].includes(content.trim())
      )
      expect(categorySpans.length).toBeGreaterThan(0)
    }
  })

  test('should filter articles by category when category button is clicked', async () => {
    const user = userEvent.setup()
    
    // Get initial article count
    const initialLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    const initialCount = initialLinks.length
    expect(initialCount).toBeGreaterThan(0)
    
    // Click on a specific category
    const technologyButton = screen.getByRole('button', { name: 'Technology' })
    await user.click(technologyButton)
    
    // Wait for filtering to complete
    await waitFor(() => {
      const filteredLinks = screen.getAllByRole('link').filter(link => 
        link.getAttribute('href')?.startsWith('/article/')
      )
      expect(filteredLinks.length).toBeGreaterThan(0)
    })
    
    // All displayed articles should have Technology category
    const filteredLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    
    for (const link of filteredLinks.slice(0, 5)) {
      const categoryBadge = within(link).queryByText('Technology')
      expect(categoryBadge).toBeInTheDocument()
    }
  })

  test('should highlight selected category', async () => {
    const user = userEvent.setup()
    const technologyButton = screen.getByRole('button', { name: 'Technology' })
    
    // Click Technology category
    await user.click(technologyButton)
    
    // Check that it has the selected styling
    expect(technologyButton).toHaveClass('bg-gray-900')
  })

  test('should show all articles when "All" is selected', async () => {
    const user = userEvent.setup()
    
    // First select a category
    await user.click(screen.getByRole('button', { name: 'Technology' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Technology' })).toHaveClass('bg-gray-900')
    })
    
    // Then click "All"
    await user.click(screen.getByRole('button', { name: 'All' }))
    
    // Should show all articles (at least 12)
    await waitFor(() => {
      const allLinks = screen.getAllByRole('link').filter(link => 
        link.getAttribute('href')?.startsWith('/article/')
      )
      expect(allLinks.length).toBeGreaterThanOrEqual(12)
    })
  })

  test('should have hover effects on article cards', () => {
    const articleLinks = screen.getAllByRole('link').filter(link => 
      link.getAttribute('href')?.startsWith('/article/')
    )
    
    if (articleLinks.length > 0) {
      const firstLink = articleLinks[0]
      const cardDiv = firstLink.querySelector('div')
      
      if (cardDiv) {
        const cardClass = cardDiv.className
        expect(cardClass).toMatch(/transition|hover/)
      }
    }
  })

  test('should display at least 12 articles', async () => {
    const user = userEvent.setup()
    
    // Make sure "All" is selected
    await user.click(screen.getByRole('button', { name: 'All' }))
    
    await waitFor(() => {
      const articleLinks = screen.getAllByRole('link').filter(link => 
        link.getAttribute('href')?.startsWith('/article/')
      )
      expect(articleLinks.length).toBeGreaterThanOrEqual(12)
    })
  })

  test('should have articles from at least 4 different categories', async () => {
    const user = userEvent.setup()
    const categories = ['World', 'Technology', 'Sports', 'Entertainment']
    const foundCategories = new Set<string>()
    
    for (const category of categories) {
      await user.click(screen.getByRole('button', { name: category }))
      await waitFor(() => {
        const links = screen.getAllByRole('link').filter(link => 
          link.getAttribute('href')?.startsWith('/article/')
        )
        if (links.length > 0) {
          foundCategories.add(category)
        }
      })
    }
    
    expect(foundCategories.size).toBeGreaterThanOrEqual(4)
  })

  test('should have at least 2-3 articles per category', async () => {
    const user = userEvent.setup()
    const categories = ['World', 'Technology', 'Sports', 'Entertainment']
    
    for (const category of categories) {
      await user.click(screen.getByRole('button', { name: category }))
      await waitFor(() => {
        const links = screen.getAllByRole('link').filter(link => 
          link.getAttribute('href')?.startsWith('/article/')
        )
        expect(links.length).toBeGreaterThanOrEqual(2)
      })
    }
  })
})


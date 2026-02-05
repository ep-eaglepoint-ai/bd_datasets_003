import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArticlePage from '@/app/article/[id]/page'
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

describe('Article Detail Page', () => {
  test('should display article when valid ID is accessed', () => {
    renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    
    // Check for article title
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toBeInTheDocument()
    expect(title.textContent).not.toBe('')
    
    // Check for author
    const authorPattern = /Sarah Johnson|Michael Chen|David Martinez|Emily Rodriguez|James Wilson|Lisa Anderson|Robert Taylor|Jennifer Lee|Patricia Brown|Daniel Kim|Amanda White|Christopher Davis/
    expect(screen.getByText(authorPattern)).toBeInTheDocument()
    
    // Check for publication date
    expect(screen.getByText(/January|February|March|April|May|June|July|August|September|October|November|December/)).toBeInTheDocument()
    
    // Check for category badge
    expect(screen.getByText(/World|Technology|Sports|Entertainment/)).toBeInTheDocument()
    
    // Check for hero image
    expect(screen.getByRole('img')).toBeInTheDocument()
    
    // Check for article content
    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
  })

  test('should display complete article information', () => {
    renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    
    // Title should be prominent
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toBeInTheDocument()
    expect(title.textContent?.length).toBeGreaterThan(0)
    
    // Author should be visible
    const authorPattern = /Sarah Johnson|Michael Chen|David Martinez|Emily Rodriguez|James Wilson|Lisa Anderson|Robert Taylor|Jennifer Lee|Patricia Brown|Daniel Kim|Amanda White|Christopher Davis/
    expect(screen.getByText(authorPattern)).toBeInTheDocument()
    
    // Date should be visible and formatted
    const date = screen.getByText(/January|February|March|April|May|June|July|August|September|October|November|December/)
    expect(date).toBeInTheDocument()
    expect(date.textContent?.length).toBeGreaterThan(0)
    
    // Category badge should be visible
    const category = screen.getByText(/World|Technology|Sports|Entertainment/)
    expect(category).toBeInTheDocument()
    
    // Image should be visible
    const image = screen.getByRole('img')
    expect(image).toBeInTheDocument()
    
    // Content should be visible
    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
    expect(article.textContent?.length).toBeGreaterThan(100) // Content should be substantial
  })

  test('should have a visible Back button/link', () => {
    renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    
    // Check for back link (there are 2 links, get all and check first)
    const backLinks = screen.getAllByRole('link', { name: /Back to Articles/i })
    expect(backLinks.length).toBeGreaterThan(0)
    expect(backLinks[0]).toBeInTheDocument()
    
    // Should be in the header
    const header = screen.getByRole('banner')
    const headerLink = within(header).getByRole('link', { name: /Back to Articles/i })
    expect(headerLink).toBeInTheDocument()
  })

  test('should display 404 page for invalid article ID', () => {
    expect(() => {
      renderWithRouter(<ArticlePage params={{ id: '99999' }} />)
    }).toThrow('NEXT_NOT_FOUND')
  })

  test('should display different articles for different IDs', () => {
    const { unmount } = renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    const title1 = screen.getByRole('heading', { level: 1 }).textContent
    unmount()
    
    renderWithRouter(<ArticlePage params={{ id: '2' }} />)
    const title2 = screen.getByRole('heading', { level: 1 }).textContent
    
    // Titles should be different
    expect(title1).not.toBe(title2)
  })

  test('should have proper typography styling', () => {
    renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    
    // Article should have prose styling
    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
    expect(article.className).toBeTruthy()
    
    // Content should be readable (check for proper text styling)
    const content = within(article).getByText(articles[0].content)
    expect(content).toBeInTheDocument()
    expect(content.className).toBeTruthy()
  })

  test('should display article with proper image dimensions', () => {
    renderWithRouter(<ArticlePage params={{ id: '1' }} />)
    
    const image = screen.getByRole('img')
    expect(image).toBeInTheDocument()
    
    // Image should have reasonable dimensions (check parent container)
    const imageContainer = image.closest('div')
    expect(imageContainer).toBeInTheDocument()
    if (imageContainer) {
      expect(imageContainer.className).toContain('h-96')
    }
  })

  test('should display all article fields correctly', () => {
    // Test multiple articles to ensure all fields are displayed
    for (let id = 1; id <= 3; id++) {
      const { unmount } = renderWithRouter(<ArticlePage params={{ id: String(id) }} />)
      
      // All required fields should be present
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument() // title
      expect(
        screen.getByText(
          /January|February|March|April|May|June|July|August|September|October|November|December/
        )
      ).toBeInTheDocument() // publishedAt
      expect(
        screen.getByText(/World|Technology|Sports|Entertainment/, { selector: 'span' })
      ).toBeInTheDocument() // category badge span
      expect(screen.getByRole('img')).toBeInTheDocument() // imageUrl
      
      // Author should be visible
      const authorPattern = /Sarah Johnson|Michael Chen|David Martinez|Emily Rodriguez|James Wilson|Lisa Anderson|Robert Taylor|Jennifer Lee|Patricia Brown|Daniel Kim|Amanda White|Christopher Davis/
      expect(screen.getByText(authorPattern)).toBeInTheDocument()
      
      unmount()
    }
  })
})


/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest'

describe('Simple Frontend Tests', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should handle async operations', async () => {
    const result = await Promise.resolve(42)
    expect(result).toBe(42)
  })

  it('should work with DOM elements', () => {
    document.body.innerHTML = '<div class="test">Hello World</div>'
    const element = document.querySelector('.test')
    expect(element?.textContent).toBe('Hello World')
  })
})

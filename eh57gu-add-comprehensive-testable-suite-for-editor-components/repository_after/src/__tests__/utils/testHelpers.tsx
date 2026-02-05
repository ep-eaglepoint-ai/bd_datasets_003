import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'

/**
 * Custom render function that wraps components with providers if needed
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { ...options })
}

/**
 * Create a mock file for file upload testing
 */
export function createMockFile(
  name: string,
  size: number,
  type: string,
  content: string = 'mock content'
): File {
  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

/**
 * Create a mock video file
 */
export function createMockVideoFile(name: string = 'test-video.mp4'): File {
  return createMockFile(name, 1024 * 1024, 'video/mp4')
}

/**
 * Create a mock audio file
 */
export function createMockAudioFile(name: string = 'test-audio.mp3'): File {
  return createMockFile(name, 512 * 1024, 'audio/mp3')
}

/**
 * Wait for a specific amount of time
 */
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Simulate file input change event
 */
export function simulateFileUpload(input: HTMLInputElement, file: File) {
  const fileList = {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  }

  Object.defineProperty(input, 'files', {
    value: fileList,
    writable: false,
  })

  const event = new Event('change', { bubbles: true })
  input.dispatchEvent(event)
}

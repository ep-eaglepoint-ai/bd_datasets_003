import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Cleanup after each test case
afterEach(() => {
  cleanup()
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-object-url')
global.URL.revokeObjectURL = vi.fn()

// Mock MediaRecorder
global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null,
  onerror: null,
  onstop: null,
  state: 'inactive',
})) as any

// Mock FileReader
global.FileReader = vi.fn().mockImplementation(() => ({
  readAsDataURL: vi.fn(),
  onloadend: null,
  result: null,
})) as any

// Mock HTMLCanvasElement methods
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(100),
    width: 10,
    height: 10,
  })),
  putImageData: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
})) as any

HTMLCanvasElement.prototype.captureStream = vi.fn(() => ({
  getTracks: vi.fn(() => []),
})) as any

// Mock HTMLVideoElement
Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
  get: () => 1920,
})

Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
  get: () => 1080,
})

Object.defineProperty(HTMLVideoElement.prototype, 'duration', {
  get: () => 60,
})

Object.defineProperty(HTMLVideoElement.prototype, 'currentTime', {
  get: () => 0,
  set: vi.fn(),
})

HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)
HTMLVideoElement.prototype.pause = vi.fn()
HTMLVideoElement.prototype.load = vi.fn()

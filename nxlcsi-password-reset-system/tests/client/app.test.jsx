import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { jest } from '@jest/globals'

import { PasswordReset } from '../../repository_after/client/src/app.jsx'

function setRoute(path) {
  window.history.pushState({}, '', path)
}

function mockFetchJson(data, { ok = true, status = 200 } = {}) {
  globalThis.fetch = jest.fn(async () => ({
    ok,
    status,
    text: async () => JSON.stringify(data),
  }))
}

function renderAt(path) {
  setRoute(path)
  return render(<PasswordReset />)
}

describe('Password reset frontend (task requirements)', () => {
  test('redirects / to /forgot-password', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /forgot password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
  })

  test('forgot password: invalid email shows validation error and does not call API', async () => {
    mockFetchJson({ message: 'ok' })

    const user = userEvent.setup()
    renderAt('/forgot-password')

    await user.type(screen.getByLabelText(/email address/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a valid email address/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test('forgot password: valid email calls API and shows generic confirmation (no enumeration language)', async () => {
    jest.useFakeTimers()
    mockFetchJson({ message: 'ok' })

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    renderAt('/forgot-password')

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await act(async () => {
      jest.advanceTimersByTime(700)
    })

    expect(await screen.findByText(/we.?ve sent a reset link\./i)).toBeInTheDocument()

    // Must not leak account existence in UI copy.
    expect(document.body.textContent || '').not.toMatch(/if an account exists/i)

    jest.useRealTimers()
  })

  test('reset password: requires passwords to match before submit (no API call)', async () => {
    mockFetchJson({ ok: true })

    const user = userEvent.setup()
    const token = 'A'.repeat(32)
    renderAt(`/reset-password?token=${token}`)

    await user.type(screen.getByLabelText(/^new password$/i), 'VeryStr0ng!Passw0rd')
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'DifferentPassw0rd!1')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/passwords do not match/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test('reset password: clears token from URL on submit and navigates to success when API ok', async () => {
    jest.useFakeTimers()

    const token = 'B'.repeat(32)
    mockFetchJson({ ok: true })

    const replaceSpy = jest.spyOn(window.history, 'replaceState')
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    renderAt(`/reset-password?token=${token}`)

    await user.type(screen.getByLabelText(/^new password$/i), 'VeryStr0ng!Passw0rd')
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'VeryStr0ng!Passw0rd')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    expect(replaceSpy).toHaveBeenCalledWith({}, '', '/reset-password')

    // Ensure token was sent to backend in request body.
    expect(globalThis.fetch).toHaveBeenCalled()
    const [_url, opts] = globalThis.fetch.mock.calls[0]
    const body = JSON.parse(opts.body)
    expect(body.token).toBe(token)

    // Navigate happens on ok.
    expect(await screen.findByRole('heading', { name: /password updated/i })).toBeInTheDocument()

    await act(async () => {
      jest.advanceTimersByTime(800)
    })

    replaceSpy.mockRestore()
    jest.useRealTimers()
  })

  test('unknown route shows not found page', async () => {
    renderAt('/this-does-not-exist')
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to password reset/i })).toHaveAttribute('href', '/forgot-password')
  })
})

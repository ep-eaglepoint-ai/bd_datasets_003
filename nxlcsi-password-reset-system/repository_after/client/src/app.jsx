import React, { StrictMode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

// Minimal error boundary (no info leakage).
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    // Intentionally do not log details to avoid leaking security-relevant state.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, color: '#444' }}>Please refresh and try again.</p>
        </div>
      )
    }
    return this.props.children
  }
}

const API_BASE = (import.meta?.env?.VITE_API_BASE ?? 'http://localhost:8000').replace(/\/$/, '')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const text = await res.text()
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) }
  } catch {
    return { ok: res.ok, status: res.status, data: { message: text } }
  }
}

function GlobalStyles() {
  return (
    <style>{`
      :root{
        --bg: #0b0f14;
        --panel: rgba(255,255,255,0.06);
        --panel2: rgba(255,255,255,0.09);
        --text: rgba(255,255,255,0.92);
        --muted: rgba(255,255,255,0.70);
        --faint: rgba(255,255,255,0.55);
        --line: rgba(255,255,255,0.14);
        --accent: #2ed3b7;
        --danger: #ff6b6b;
        --warn: #ffcc66;
        --ok: #2ed3b7;
        --shadow: 0 22px 80px rgba(0,0,0,0.55);
        --radius: 14px;
      }

      html, body { height: 100%; }
      body{
        margin:0;
        background:
          radial-gradient(1200px 600px at 15% 10%, rgba(46,211,183,0.12), transparent 55%),
          radial-gradient(900px 600px at 88% 18%, rgba(255,204,102,0.08), transparent 52%),
          linear-gradient(180deg, #070a0f 0%, var(--bg) 100%);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      }

      * { box-sizing: border-box; }
      a { color: inherit; }
      ::selection { background: rgba(46,211,183,0.22); }

      .shell{
        min-height:100vh;
        padding: 28px 18px;
        display:flex;
        align-items:center;
        justify-content:center;
      }

      .card{
        width: min(620px, 100%);
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04));
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        overflow:hidden;
      }

      .cardBody{ padding: 18px; }
      .h1{ margin: 0 0 8px 0; font-size: 20px; letter-spacing: 0.2px; }
      .p{ margin: 0 0 14px 0; color: var(--muted); font-size: 13.5px; line-height: 1.45; }

      .form{ display:flex; flex-direction:column; gap: 12px; }
      .field{ display:flex; flex-direction:column; gap: 6px; }

      label{
        font-size: 12.5px;
        color: rgba(255,255,255,0.78);
      }

      input{
        width:100%;
        padding: 12px 12px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(0,0,0,0.22);
        color: var(--text);
        outline: none;
        transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
      }

      input:focus{
        border-color: rgba(46,211,183,0.55);
        background: rgba(0,0,0,0.28);
      }

      input[aria-invalid="true"]{
        border-color: rgba(255,107,107,0.75);
      }

      .row{
        display:flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .btn{
        appearance:none;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.06);
        color: var(--text);
        padding: 12px 14px;
        border-radius: 12px;
        cursor: pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap: 10px;
        transition: transform 130ms ease, background 130ms ease, border-color 130ms ease;
      }
      .btn:hover{ transform: translateY(-1px); background: rgba(255,255,255,0.08); }
      .btn:active{ transform: translateY(0px); }
      .btnPrimary{
        border-color: rgba(46,211,183,0.35);
        background: linear-gradient(180deg, rgba(46,211,183,0.20), rgba(46,211,183,0.10));
      }
      .btnPrimary:hover{ border-color: rgba(46,211,183,0.55); }
      .btn[disabled]{ opacity: 0.58; cursor: not-allowed; transform: none; }

      .note{
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.18);
        border-radius: 12px;
        padding: 12px;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
        animation: fadeIn 180ms ease;
      }

      .alert{
        border-color: rgba(255,107,107,0.35);
        background: rgba(255,107,107,0.08);
        color: rgba(255,255,255,0.85);
      }

      .success{
        border-color: rgba(46,211,183,0.30);
        background: rgba(46,211,183,0.08);
      }

      .helper{
        margin: 0;
        font-size: 12.5px;
        color: var(--faint);
      }

      .err{
        margin: 0;
        font-size: 12.5px;
        color: rgba(255,107,107,0.92);
      }

      .spinner{
        width: 16px;
        height: 16px;
        border-radius: 999px;
        border: 2px solid rgba(255,255,255,0.24);
        border-top-color: rgba(46,211,183,0.9);
        animation: spin 700ms linear infinite;
      }

      .meter{
        display:flex;
        gap: 6px;
        margin-top: 4px;
      }
      .bar{
        height: 7px;
        border-radius: 999px;
        flex: 1;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.05);
        overflow:hidden;
      }
      .bar > i{ display:block; height:100%; width:100%; transform: translateX(-100%); transition: transform 220ms ease; }
      .barOn > i{ transform: translateX(0%); }

      .ruleList{
        list-style:none;
        padding:0;
        margin: 10px 0 0 0;
        display:grid;
        gap: 6px;
      }
      .rule{
        display:flex;
        gap: 10px;
        align-items:flex-start;
        color: var(--muted);
        font-size: 12.8px;
      }
      .dot{
        width: 10px;
        height: 10px;
        border-radius: 4px;
        margin-top: 3px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(255,255,255,0.06);
      }
      .dotOk{
        border-color: rgba(46,211,183,0.42);
        background: rgba(46,211,183,0.20);
      }

      .footer{
        padding: 14px 18px;
        border-top: 1px solid var(--line);
        display:flex;
        justify-content:space-between;
        flex-wrap: wrap;
        gap: 10px;
        color: var(--faint);
        font-size: 12px;
        background: rgba(0,0,0,0.16);
      }

      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }

      @media (max-width: 520px){
        .cardBody{ padding: 16px; }
        .h1{ font-size: 19px; }
      }
    `}</style>
  )
}

function useQueryParam(name) {
  const location = useLocation()
  return new URLSearchParams(location.search).get(name)
}

function isSuperficiallyValidToken(token) {
  if (typeof token !== 'string') return false
  const trimmed = token.trim()
  if (trimmed.length < 20) return false
  if (trimmed.length > 512) return false
  // Basic base64url-ish check only (authoritative validation is server-side).
  return /^[A-Za-z0-9_-]+$/.test(trimmed)
}

function PageShell({ title, subtitle, children }) {
  return (
    <div className="shell">
      <GlobalStyles />
      <div className="card" role="main" aria-label={title}>
        <div className="cardBody">
          <h1 className="h1">{title}</h1>
          {subtitle ? <p className="p">{subtitle}</p> : null}
          {children}
        </div>
      </div>
    </div>
  )
}

function validateEmailFormat(email) {
  if (typeof email !== 'string') return false
  const trimmed = email.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

function passwordPolicyStatus(password) {
  const s = typeof password === 'string' ? password : ''
  return {
    length: s.length >= 12,
    upper: /[A-Z]/.test(s),
    lower: /[a-z]/.test(s),
    number: /[0-9]/.test(s),
    special: /[^A-Za-z0-9]/.test(s),
  }
}

function passwordStrengthScore(password) {
  const st = passwordPolicyStatus(password)
  const checks = [st.length, st.upper, st.lower, st.number, st.special]
  return checks.reduce((acc, v) => acc + (v ? 1 : 0), 0)
}

function StrengthMeter({ score }) {
  const bars = [0, 1, 2, 3, 4]
  const color = score >= 4 ? 'rgba(46,211,183,0.90)' : score >= 3 ? 'rgba(255,204,102,0.85)' : 'rgba(255,107,107,0.85)'
  return (
    <div className="meter" aria-label="Password strength">
      {bars.map((i) => (
        <div key={i} className={`bar ${score >= i + 1 ? 'barOn' : ''}`}>
          <i style={{ background: color }} />
        </div>
      ))}
    </div>
  )
}

function Rule({ ok, children }) {
  return (
    <li className="rule">
      <span className={`dot ${ok ? 'dotOk' : ''}`} aria-hidden="true" />
      <span>{children}</span>
    </li>
  )
}

function ForgotPasswordPage() {
  const emailId = useId()
  const helpId = useId()
  const errId = useId()

  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const emailOk = validateEmailFormat(email)
  const showEmailErr = touched && !emailOk

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched(true)
    if (!emailOk || loading) return

    setLoading(true)
    const started = Date.now()

    try {
      await fetchJson(`${API_BASE}/api/password-reset/request`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
    } catch {
      // Intentionally ignored. ui must remain generic.
    } finally {
      // Ensure a minimum client-side loading duration to reduce UI timing signals.
      const elapsed = Date.now() - started
      if (elapsed < 650) await sleep(650 - elapsed)
      setLoading(false)
      setSubmitted(true)
    }
  }

  return (
    <PageShell
      title="Forgot password"
      subtitle="We will send a reset link to your email."
    >
      <form className="form" onSubmit={handleSubmit} aria-label="Request password reset">
        <div className="field">
          <label htmlFor={emailId}>Email address</label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-describedby={showEmailErr ? errId : helpId}
            aria-invalid={showEmailErr ? 'true' : 'false'}
            placeholder="name@company.com"
            disabled={loading || submitted}
          />
          {!showEmailErr ? (
            <p className="helper" id={helpId} />
          ) : (
            <p className="err" id={errId} role="alert">
              Enter a valid email address.
            </p>
          )}
        </div>

        <div className="row">
          <button className="btn btnPrimary" type="submit" disabled={loading || submitted}>
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {loading ? 'Submitting…' : submitted ? 'Submitted' : 'Send reset link'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={loading}
            onClick={() => {
              setEmail('')
              setTouched(false)
              setSubmitted(false)
            }}
          >
            Clear
          </button>
        </div>

        {submitted ? (
          <div className="note success" role="status" aria-live="polite">
            We’ve sent a reset link.
          </div>
        ) : null}
      </form>
    </PageShell>
  )
}

function ResetPasswordPage() {
  const rawToken = useQueryParam('token')
  const navigate = useNavigate()

  const newPwId = useId()
  const confirmPwId = useId()
  const liveId = useId()

  const [token, setToken] = useState(() => (typeof rawToken === 'string' ? rawToken.trim() : ''))
  const tokenOk = isSuperficiallyValidToken(token)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [touched, setTouched] = useState({ new: false, confirm: false })
  const [loading, setLoading] = useState(false)
  const [submitErr, setSubmitErr] = useState('')

  const policy = useMemo(() => passwordPolicyStatus(newPassword), [newPassword])
  const strength = useMemo(() => passwordStrengthScore(newPassword), [newPassword])
  const pwOk = useMemo(() => Object.values(policy).every(Boolean), [policy])
  const matchOk = newPassword.length > 0 && newPassword === confirmPassword

  const showNewErr = touched.new && !pwOk
  const showConfirmErr = touched.confirm && !matchOk

  useEffect(() => {
    // Keep `token` synced with URL token on initial load only.
    // After submission we clear the URL for safety.
    if (!token && typeof rawToken === 'string') {
      setToken(rawToken.trim())
    }
  }, [])

  function handleSubmit(e) {
    void (async () => {
      e.preventDefault()
      if (loading) return
      setTouched({ new: true, confirm: true })
      setSubmitErr('')

      if (!pwOk || !matchOk) return

      // Token is validated authoritatively server-side.
      // If it fails a superficial format check, we still keep error messaging generic.
      const capturedToken = token
      window.history.replaceState({}, '', '/reset-password')

      setLoading(true)
      const started = Date.now()
      try {
        const result = await fetchJson(`${API_BASE}/api/password-reset/confirm`, {
          method: 'POST',
          body: JSON.stringify({ token: capturedToken, new_password: newPassword }),
        })
        const ok = Boolean(result?.data?.ok)
        if (ok) {
          setToken('')
          navigate('/reset-success', { replace: true })
        } else {
          setSubmitErr('Unable to reset password. Please request a new link and try again.')
        }
      } catch {
        setSubmitErr('Unable to reset password. Please request a new link and try again.')
      } finally {
        const elapsed = Date.now() - started
        if (elapsed < 750) await sleep(750 - elapsed)
        setLoading(false)
      }
    })()
  }

  return (
    <PageShell
      title="Reset password"
      subtitle="Set a new password that meets the security requirements."
    >
      <form className="form" onSubmit={handleSubmit} aria-label="Set a new password">
        <div className="field">
          <label htmlFor={newPwId}>New password</label>
          <input
            id={newPwId}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, new: true }))}
            aria-describedby={liveId}
            aria-invalid={showNewErr ? 'true' : 'false'}
            disabled={loading}
          />

          <StrengthMeter score={strength} />
          <p className="helper" id={liveId} aria-live="polite">
            Password requirements:
          </p>

          <ul className="ruleList" aria-label="Password requirements">
            <Rule ok={policy.length}>At least 12 characters</Rule>
            <Rule ok={policy.upper}>At least 1 uppercase letter</Rule>
            <Rule ok={policy.lower}>At least 1 lowercase letter</Rule>
            <Rule ok={policy.number}>At least 1 number</Rule>
            <Rule ok={policy.special}>At least 1 special character</Rule>
          </ul>

          {showNewErr ? (
            <p className="err" role="alert">
              Your password must satisfy all requirements.
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor={confirmPwId}>Confirm new password</label>
          <input
            id={confirmPwId}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
            aria-invalid={showConfirmErr ? 'true' : 'false'}
            disabled={loading}
          />
          {showConfirmErr ? (
            <p className="err" role="alert">Passwords do not match.</p>
          ) : null}
        </div>

        {submitErr ? (
          <div className="note alert" role="alert">
            {submitErr}
          </div>
        ) : null}

        <div className="row">
          <button className="btn btnPrimary" type="submit" disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {loading ? 'Updating…' : 'Update password'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={loading}
            onClick={() => navigate('/forgot-password')}
          >
            Request new link
          </button>
        </div>
      </form>
    </PageShell>
  )
}

function ResetSuccessPage() {
  const navigate = useNavigate()
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      navigate('/forgot-password', { replace: true })
    }, 4500)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [navigate])

  return (
    <PageShell
      title="Password updated"
      subtitle="You can now sign in with your new password."
    >
      <div className="note success" role="status" aria-live="polite">
        Redirecting…
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btnPrimary" type="button" onClick={() => navigate('/forgot-password', { replace: true })}>
          Continue
        </button>
      </div>
    </PageShell>
  )
}

function NotFoundPage() {
  return (
    <PageShell title="Not found" subtitle="The page you requested does not exist.">
      <div className="row">
        <a className="btn btnPrimary" href="/forgot-password">Go to password reset</a>
      </div>
    </PageShell>
  )
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/forgot-password" replace />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-success" element={<ResetSuccessPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function PasswordReset() {
  return (
    <AppErrorBoundary>
      <AppRouter />
    </AppErrorBoundary>
  )
}

export { PasswordReset }

const _rootEl = document.getElementById('root')
if (_rootEl && !globalThis.__DISABLE_AUTO_MOUNT__) {
  createRoot(_rootEl).render(
    <StrictMode>
      <PasswordReset />
    </StrictMode>,
  )
}
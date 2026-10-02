import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { Logo } from '../components/Icon'
import { Notice } from '../components/controls'
import { useT } from '../i18n'

export default function Login({ onLogin }: { onLogin: (username: string) => void }) {
  const t = useT()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const fn = mode === 'login' ? api.login : api.register
      const res = await fn(username.trim(), password)
      onLogin(res.username)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'server'
      setError(t.auth.errors[code] ?? (code === 'offline' ? t.common.offline : t.common.error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="card stack" onSubmit={submit}>
        <div className="hero">
          <Logo />
          <h1>{t.appName}</h1>
          <p className="muted">{t.tagline}</p>
        </div>
        <div className="field">
          <label htmlFor="username">{t.auth.username}</label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">{t.auth.password}</label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {mode === 'register' && <div className="help">{t.auth.hint}</div>}
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn primary block" disabled={busy}>
          {mode === 'login' ? t.auth.login : t.auth.register}
        </button>
        <button
          type="button"
          className="btn ghost block"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? t.auth.toRegister : t.auth.toLogin}
        </button>
      </form>
    </div>
  )
}

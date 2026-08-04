import { Cloud, Dumbbell, LockKeyhole, Mail } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const authReturnUrl = () =>
  import.meta.env.VITE_APP_URL?.trim() ||
  window.location.origin

export default function AuthScreen() {
  const [mode, setMode] = useState('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setWorking(true)
    setStatus('')

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authReturnUrl(),
            data: {
              display_name:
                displayName.trim() ||
                email.split('@')[0],
            },
          },
        })

        if (error) throw error

        if (!data.session) {
          setStatus(
            'Check your email to confirm your AVAREN account. The link will return you to this app.',
          )
        }
      } else {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })

        if (error) throw error
      }
    } catch (error) {
      setStatus(error.message || 'Unable to continue.')
    } finally {
      setWorking(false)
    }
  }

  const resetPassword = async () => {
    if (!email.trim()) {
      setStatus('Enter your email first.')
      return
    }

    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: authReturnUrl() },
      )

    setStatus(
      error
        ? error.message
        : 'Password reset instructions were sent to your email.',
    )
  }

  return (
    <main className="auth-screen foundation-auth">
      <section className="auth-brand foundation-auth-brand">
        <img
          src="/brand/foundation/foundation-master-1024.png"
          alt="AVAREN Foundation mark"
        />
        <span>AVAREN</span>
        <h1>THE FOUNDRY</h1>
        <p>Strength, refined.</p>
      </section>

      <section className="auth-card">
        <div className="auth-seal foundation-auth-seal">
          <img src="/brand/foundation/icon-96.png" alt="" aria-hidden="true" />
        </div>

        <span className="eyebrow">YOUR TRAINING, EVERYWHERE</span>
        <h2>{mode === 'signup' ? 'Create your account.' : 'Welcome back.'}</h2>
        <p className="auth-copy">
          Each account has its own private workouts, readiness, mobility, and progress.
        </p>

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              <span>Name</span>
              <div>
                <Dumbbell size={16} />
                <input
                  required
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
            </label>
          )}

          <label>
            <span>Email</span>
            <div>
              <Mail size={16} />
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div>
              <LockKeyhole size={16} />
              <input
                required
                minLength="8"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          </label>

          {status && <div className="auth-status">{status}</div>}

          <button className="gold-button machined" disabled={working}>
            <Cloud size={18} />
            {working
              ? 'Connecting...'
              : mode === 'signup'
              ? 'Create AVAREN Account'
              : 'Sign In'}
          </button>
        </form>

        {mode === 'signin' && (
          <button className="auth-text-button" onClick={resetPassword}>
            Forgot password?
          </button>
        )}

        <button
          className="auth-switch"
          onClick={() => {
            setMode(mode === 'signup' ? 'signin' : 'signup')
            setStatus('')
          }}
        >
          {mode === 'signup'
            ? 'Already have an account? Sign in'
            : 'New to The Foundry? Create account'}
        </button>
      </section>
    </main>
  )
}

import React, { useState } from 'react';
import { looksLikePhone, phoneToAuthEmail } from '@pump/shared';
import { supabase } from '../../services/supabase.js';

export const Login: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      // Accept either an email or a phone number. Phone logins are backed by a
      // synthetic email handle derived deterministically from the phone.
      const trimmed = identifier.trim();
      const email = looksLikePhone(trimmed) ? phoneToAuthEmail(trimmed) : trimmed.toLowerCase();
      if (!email) {
        throw new Error('Enter a valid email or phone number');
      }
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        throw error;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-canvas)',
      fontFamily: 'var(--font-sans)',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-card)',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxShadow: 'var(--shadow-1)'
      }} className="animate-fade-in">

        {/* Brand header */}
        <div style={{ textAlign: 'center' }}>
          <span style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--brand-primary)',
            letterSpacing: '-0.01em'
          }}>
            PumpOS
          </span>
          <h1 style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-strong)',
            marginTop: '8px'
          }}>
            Sign in to operational console
          </h1>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div style={{
            backgroundColor: 'var(--state-danger-bg)',
            border: '1px solid var(--border-soft)',
            color: 'var(--state-danger-fg)',
            padding: '10px 12px',
            borderRadius: 'var(--radius-input)',
            fontSize: '12px',
            fontWeight: 500,
          }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-muted)' }}>
              Email or phone
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="email@pump.com or 98765 43210"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              disabled={loading}
              autoCapitalize="none"
              autoCorrect="off"
              style={{
                width: '100%',
                height: '36px',
                padding: '0 12px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-strong)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--text-muted)' }}>
              Password
            </label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                width: '100%',
                height: '36px',
                padding: '0 12px',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-input)',
                fontSize: '13px',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-strong)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              height: '36px',
              backgroundColor: 'var(--brand-primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '8px',
              transition: 'background-color 0.15s ease',
              width: '100%'
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In ➜'}
          </button>
        </form>

        <div style={{
          borderTop: '1px solid var(--border-soft)',
          paddingTop: '12px',
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}>
          Contact system administrator for credential changes.
        </div>
      </div>
    </div>
  );
};

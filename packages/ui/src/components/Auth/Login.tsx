import React, { useState } from 'react';
import { looksLikePhone, phoneToAuthEmail } from '@pump/shared';
import { supabase } from '../../services/supabase.js';
import { Button, Form, Icon } from '../../pump-ds/index.js';
import { Banner } from '../primitives/Banner.js';
import { Field, TextInput } from '../primitives/Field.js';
import { AuthScreen } from './AuthScreen.js';

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
    <AuthScreen title="Sign in to operational console">
      {errorMsg && <Banner severity="danger">{errorMsg}</Banner>}

      <Form onSubmit={handleLogin} className="flex flex-col gap-3.5">
        <Field label="Email or phone" htmlFor="login-identifier">
          <TextInput
            id="login-identifier"
            type="text"
            placeholder="email@pump.com or 98765 43210"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            disabled={loading}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </Field>

        <Field label="Password" htmlFor="login-password">
          <TextInput
            id="login-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </Field>

        <Button
          type="submit"
          fullWidth
          disabled={loading}
          className="mt-2"
          rightIcon={loading ? undefined : <Icon name="arrow-right" size="xs" />}
        >
          {loading ? 'Authenticating…' : 'Sign in'}
        </Button>
      </Form>

      <div className="border-t border-border-soft pt-3 text-center text-[12px] text-ink-muted">
        Contact system administrator for credential changes.
      </div>
    </AuthScreen>
  );
};

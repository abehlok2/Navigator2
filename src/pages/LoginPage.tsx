import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Input } from '../components/ui';
import { HttpError } from '../features/auth/client';
import { useAuthStore } from '../state/auth';

type FieldErrors = {
  username?: string;
  password?: string;
};

export const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const login = useAuthStore((state) => state.login);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedUsername = username.trim();
    const validationErrors: FieldErrors = {};

    if (!trimmedUsername) {
      validationErrors.username = 'Username is required';
    } else if (trimmedUsername.length < 3) {
      validationErrors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      validationErrors.username = 'Username can only contain letters, numbers, hyphens, and underscores';
    }

    if (!password) {
      validationErrors.password = 'Password is required';
    }

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      await login(trimmedUsername, password);
      navigate('/home');
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.code === 'REGISTRATION_DISABLED') {
          setFormError('Only pre-defined users can access this system. Please contact your administrator.');
        } else if (error.code === 'AUTH_INVALID_CREDENTIALS') {
          setFormError('Invalid username or password.');
        } else {
          setFormError(error.message || 'Unable to complete request. Please try again.');
        }
      } else if (error instanceof Error) {
        setFormError(error.message);
      } else {
        setFormError('Unable to complete request. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className="login-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: 'var(--color-surface-muted, #f3f4f6)',
      }}
    >
      <Card title="Sign in to Navigator">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Username"
            name="username"
            type="text"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              if (fieldErrors.username) {
                setFieldErrors((current) => {
                  const { username: _removed, ...rest } = current;
                  return rest;
                });
              }
              if (formError) {
                setFormError(null);
              }
            }}
            placeholder="Enter your username"
            error={fieldErrors.username}
            disabled={isSubmitting}
            autoComplete="username"
          />
          <Input
            type="password"
            label="Password"
            name="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (fieldErrors.password) {
                setFieldErrors((current) => {
                  const { password: _removed, ...rest } = current;
                  return rest;
                });
              }
            }}
            placeholder="Enter your password"
            error={fieldErrors.password}
            disabled={isSubmitting}
            autoComplete="current-password"
          />
          {formError && (
            <p role="alert" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {formError}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  );
};

LoginPage.displayName = 'LoginPage';

export default LoginPage;

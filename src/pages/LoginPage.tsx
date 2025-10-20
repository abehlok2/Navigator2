import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Input } from '../components/ui';
import { register } from '../features/auth/client';
import { useAuthStore } from '../state/auth';

type FieldErrors = {
  username?: string;
  password?: string;
};

const shouldAutoRegister = (errorMessage: string): boolean => {
  const normalizedMessage = errorMessage.toLowerCase();
  return (
    /not\s+found/.test(normalizedMessage) ||
    /does\s+not\s+exist/.test(normalizedMessage) ||
    /no\s+user/.test(normalizedMessage) ||
    /unknown\s+user/.test(normalizedMessage)
  );
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
    } catch (loginError) {
      const message =
        loginError instanceof Error ? loginError.message : 'Unable to log in. Please try again.';

      if (shouldAutoRegister(message)) {
        try {
          await register(trimmedUsername, password, 'explorer');
          await login(trimmedUsername, password);
          navigate('/home');
        } catch (registerError) {
          const registerMessage =
            registerError instanceof Error
              ? registerError.message
              : 'Unable to register new account. Please try again later.';
          setFormError(registerMessage);
        }
      } else {
        setFormError(message);
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
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              if (fieldErrors.username) {
                setFieldErrors((current) => {
                  const { username: _removed, ...rest } = current;
                  return rest;
                });
              }
            }}
            placeholder="Enter your username"
            error={fieldErrors.username}
            disabled={isSubmitting}
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
          />
          {formError && (
            <p role="alert" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {formError}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Login'}
          </Button>
        </form>
      </Card>
    </main>
  );
};

LoginPage.displayName = 'LoginPage';

export default LoginPage;

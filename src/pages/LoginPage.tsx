import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Input } from '../components/ui';
import { HttpError, register } from '../features/auth/client';
import { useAuthStore } from '../state/auth';

type FieldErrors = {
  email?: string;
  password?: string;
  displayName?: string;
};

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRegistrationFields, setShowRegistrationFields] = useState(false);

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

    const trimmedEmail = email.trim();
    const trimmedDisplayName = displayName.trim();
    const validationErrors: FieldErrors = {};

    if (!trimmedEmail) {
      validationErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      validationErrors.email = 'Enter a valid email address';
    }

    if (!password) {
      validationErrors.password = 'Password is required';
    }

    if (showRegistrationFields && !trimmedDisplayName) {
      validationErrors.displayName = 'Display name is required to create an account';
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
      if (showRegistrationFields) {
        await register(trimmedEmail, password, trimmedDisplayName || undefined);
      }

      await login(trimmedEmail, password);
      navigate('/home');
    } catch (error) {
      if (error instanceof HttpError) {
        if (!showRegistrationFields && error.code === 'AUTH_INVALID_CREDENTIALS') {
          setShowRegistrationFields(true);
          setFormError(
            "We couldn't find an account with that email. Provide a display name below to create one.",
          );
        } else if (showRegistrationFields && error.code === 'AUTH_EMAIL_IN_USE') {
          setShowRegistrationFields(false);
          setDisplayName('');
          setFormError('An account with that email already exists. Please log in instead.');
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
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldErrors.email) {
                setFieldErrors((current) => {
                  const { email: _removed, ...rest } = current;
                  return rest;
                });
              }
              if (formError && showRegistrationFields) {
                setFormError(null);
              }
            }}
            placeholder="Enter your email"
            error={fieldErrors.email}
            disabled={isSubmitting}
            autoComplete="email"
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
            autoComplete={showRegistrationFields ? 'new-password' : 'current-password'}
          />
          {showRegistrationFields && (
            <Input
              label="Display name"
              name="displayName"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (fieldErrors.displayName) {
                  setFieldErrors((current) => {
                    const { displayName: _removed, ...rest } = current;
                    return rest;
                  });
                }
              }}
              placeholder="How should others see you?"
              error={fieldErrors.displayName}
              disabled={isSubmitting}
              autoComplete="nickname"
            />
          )}
          {formError && (
            <p role="alert" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {formError}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Submitting…'
              : showRegistrationFields
              ? 'Register & Sign in'
              : 'Login'}
          </Button>
        </form>
      </Card>
    </main>
  );
};

LoginPage.displayName = 'LoginPage';

export default LoginPage;

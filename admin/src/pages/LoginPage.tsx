import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { LangSwitch } from '../components/LangSwitch';
import { Button, Card, ErrorBox, Field, Input } from '../components/ui';

export function LoginPage() {
  const { t } = useTranslation();
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? '/';

  const [email, setEmail] = useState('admin@ecolife.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[var(--accent)]">
              {t('login.brand')}
            </div>
            <h1 className="mt-1 text-2xl font-semibold">{t('login.title')}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {t('login.subtitle')}
            </p>
          </div>
          <LangSwitch className="shrink-0" />
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label={t('login.email')}>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label={t('login.password')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <ErrorBox message={error} />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </Card>
    </div>
  );
}

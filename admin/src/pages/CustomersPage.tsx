import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { customersApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { CustomerListItem } from '../api/types';
import {
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageHeader,
} from '../components/ui';
import { formatGuestName } from '../lib/guest-name';

export function CustomersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<CustomerListItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const { data } = await customersApi.list(search || undefined);
          if (!cancelled) {
            setRows(data);
            setError('');
          }
        } catch (err) {
          if (!cancelled) setError(getErrorMessage(err));
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
      />
      <Card className="mb-4 p-4">
        <Field label={t('common.search')}>
          <Input
            placeholder={t('customers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
      </Card>
      <ErrorBox message={error} />
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">{t('customers.colName')}</th>
              <th className="px-3 py-3">{t('customers.colPhone')}</th>
              <th className="px-3 py-3">{t('customers.colBookingsCount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className="border-b border-[var(--line)] last:border-0"
              >
                <td className="px-3 py-3">
                  <Link
                    to={`/customers/${c.id}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {formatGuestName(c.firstName, c.lastName)}
                  </Link>
                </td>
                <td className="px-3 py-3">{c.phone}</td>
                <td className="px-3 py-3">{c.bookingsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <Empty>{t('customers.empty')}</Empty> : null}
      </Card>
    </div>
  );
}

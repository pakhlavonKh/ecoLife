import { useEffect, useState } from 'react';
import { auditApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { AuditEntry } from '../api/types';
import { DateField } from '../components/DateField';
import {
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Select,
} from '../components/ui';
import { formatDateTime } from '../lib/format';

export function AuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [entity, setEntity] = useState('');
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await auditApi.list({
          entity: entity || undefined,
          actorType: actorType || undefined,
          action: action || undefined,
          from: from || undefined,
          to: to || undefined,
          limit: 200,
        });
        if (!cancelled) {
          setRows(data);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, actorType, action, from, to]);

  return (
    <div>
      <PageHeader
        title="Журнал изменений"
        subtitle="Кто · что · когда · до → после"
      />
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Сущность">
          <Select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Все</option>
            <option value="booking">booking</option>
            <option value="payment">payment</option>
            <option value="customer">customer</option>
            <option value="category">category</option>
            <option value="room">room</option>
            <option value="cottage">cottage</option>
            <option value="price_tier">price_tier</option>
          </Select>
        </Field>
        <Field label="Актор">
          <Select
            value={actorType}
            onChange={(e) => setActorType(e.target.value)}
          >
            <option value="">Все</option>
            <option value="admin">admin</option>
            <option value="system">system</option>
            <option value="customer">customer</option>
          </Select>
        </Field>
        <Field label="Действие">
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="update / create…"
          />
        </Field>
        <Field label="С">
          <DateField value={from} onChange={setFrom} />
        </Field>
        <Field label="По">
          <DateField value={to} onChange={setTo} />
        </Field>
      </Card>
      <ErrorBox message={error} />
      <Card className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Когда</th>
              <th className="px-3 py-3">Актор</th>
              <th className="px-3 py-3">Сущность</th>
              <th className="px-3 py-3">Действие</th>
              <th className="px-3 py-3">Diff</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--line)] align-top last:border-0"
              >
                <td className="px-3 py-3 whitespace-nowrap">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="px-3 py-3">
                  <div>{row.actorType}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {row.actorId?.slice(0, 8) ?? '—'}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div>{row.entity}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {row.entityId.slice(0, 8)}…
                  </div>
                </td>
                <td className="px-3 py-3">{row.action}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="text-[var(--accent)] hover:underline"
                    onClick={() =>
                      setExpanded((id) => (id === row.id ? null : row.id))
                    }
                  >
                    {expanded === row.id ? 'Скрыть' : 'Показать'}
                  </button>
                  {expanded === row.id ? (
                    <pre className="mt-2 max-w-xl overflow-auto rounded bg-[var(--bg)] p-2 text-xs">
                      {JSON.stringify(row.diff, null, 2)}
                    </pre>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <Empty>Записей нет</Empty> : null}
      </Card>
    </div>
  );
}

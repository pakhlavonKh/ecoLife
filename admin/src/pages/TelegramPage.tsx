import { useEffect, useState } from 'react';
import { telegramApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { TelegramInvite, TelegramRecipient, TelegramStaffRole } from '../api/types';
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  Select,
} from '../components/ui';
import { formatDateTime } from '../lib/format';
import { telegramRoleLabel } from '../lib/labels';

const ROLES: TelegramStaffRole[] = ['owner', 'admin', 'manager', 'cleaner'];

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'owner':
      return 'bg-violet-50 text-violet-800';
    case 'admin':
      return 'bg-[var(--accent-soft)] text-[var(--accent)]';
    case 'manager':
      return 'bg-sky-50 text-sky-800';
    case 'cleaner':
      return 'bg-amber-50 text-amber-900';
    default:
      return 'bg-[var(--bg)] text-[var(--muted)]';
  }
}

export function TelegramPage() {
  const [tab, setTab] = useState<'recipients' | 'invites'>('recipients');
  const [recipients, setRecipients] = useState<TelegramRecipient[]>([]);
  const [invites, setInvites] = useState<TelegramInvite[]>([]);
  const [inviteRole, setInviteRole] = useState<TelegramStaffRole>('manager');
  const [createdInvite, setCreatedInvite] = useState<TelegramInvite | null>(
    null,
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [r, i] = await Promise.all([
      telegramApi.recipients(),
      telegramApi.invites(),
    ]);
    setRecipients(r.data);
    setInvites(i.data);
  }

  useEffect(() => {
    void reload().catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function createInvite() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const { data } = await telegramApi.createInvite(inviteRole);
      setCreatedInvite(data);
      await reload();
      setMessage('Приглашение создано');
      setTab('invites');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(id: string) {
    setError('');
    setMessage('');
    try {
      await telegramApi.revokeInvite(id);
      if (createdInvite?.id === id) setCreatedInvite(null);
      await reload();
      setMessage('Приглашение отозвано');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function patchRecipient(
    id: string,
    body: Record<string, unknown>,
    okMsg: string,
  ) {
    setError('');
    setMessage('');
    try {
      await telegramApi.updateRecipient(id, body);
      await reload();
      setMessage(okMsg);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function deleteRecipient(id: string) {
    if (!confirm('Удалить получателя? Он перестанет получать уведомления.')) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await telegramApi.deleteRecipient(id);
      await reload();
      setMessage('Получатель удалён');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Скопировано');
    } catch {
      setError('Не удалось скопировать');
    }
  }

  const pendingInvites = invites.filter((i) => i.isPending);

  return (
    <div>
      <PageHeader
        title="Telegram"
        subtitle="Получатели уведомлений и одноразовые приглашения"
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['recipients', 'Получатели'],
            ['invites', 'Приглашения'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? 'primary' : 'secondary'}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <ErrorBox message={error} />
      {message ? (
        <p className="mb-4 text-sm text-emerald-700">{message}</p>
      ) : null}

      {tab === 'recipients' ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-3">Имя</th>
                <th className="px-3 py-3">Роль</th>
                <th className="px-3 py-3">chat_id</th>
                <th className="px-3 py-3">Активен</th>
                <th className="px-3 py-3">Пауза до</th>
                <th className="px-3 py-3">Создан</th>
                <th className="px-3 py-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <td className="px-3 py-3">
                    <Input
                      className="min-w-[10rem]"
                      defaultValue={r.name}
                      key={`${r.id}-${r.updatedAt}-name`}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== r.name) {
                          void patchRecipient(
                            r.id,
                            { name: next },
                            'Имя обновлено',
                          );
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <span
                        className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(r.role)}`}
                      >
                        {telegramRoleLabel(r.role)}
                      </span>
                      <Select
                        className="min-w-[9rem]"
                        value={r.role}
                        onChange={(e) =>
                          void patchRecipient(
                            r.id,
                            { role: e.target.value },
                            'Роль обновлена',
                          )
                        }
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {telegramRoleLabel(role)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{r.chatId}</td>
                  <td className="px-3 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={r.isActive}
                        onChange={(e) =>
                          void patchRecipient(
                            r.id,
                            { isActive: e.target.checked },
                            e.target.checked
                              ? 'Получатель включён'
                              : 'Получатель отключён',
                          )
                        }
                      />
                      <span className="text-xs text-[var(--muted)]">
                        {r.isActive ? 'да' : 'нет'}
                      </span>
                    </label>
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)]">
                    {r.mutedUntil ? formatDateTime(r.mutedUntil) : '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)]">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="danger"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => void deleteRecipient(r.id)}
                    >
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recipients.length === 0 ? (
            <Empty>
              Пока нет получателей. Создайте приглашение и откройте ссылку в
              Telegram.
            </Empty>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Роль">
                <Select
                  className="min-w-[12rem]"
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as TelegramStaffRole)
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {telegramRoleLabel(role)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button disabled={busy} onClick={() => void createInvite()}>
                Пригласить
              </Button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Код одноразовый, действует 24 часа. Человек открывает ссылку или
              пишет боту <code>/start КОД</code>.
            </p>
          </Card>

          {createdInvite ? (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-medium">Новое приглашение</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-[var(--bg)] px-3 py-2 text-lg tracking-widest">
                  {createdInvite.code}
                </code>
                <Button
                  variant="secondary"
                  onClick={() => void copyText(createdInvite.code)}
                >
                  Копировать код
                </Button>
              </div>
              {createdInvite.deepLink ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={createdInvite.deepLink}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm text-[var(--accent)] underline"
                  >
                    {createdInvite.deepLink}
                  </a>
                  <Button
                    variant="secondary"
                    onClick={() => void copyText(createdInvite.deepLink!)}
                  >
                    Копировать ссылку
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-amber-800">
                  Deep link недоступен (бот ещё не стартовал или не задан
                  TELEGRAM_BOT_USERNAME). Используйте код: /start{' '}
                  {createdInvite.code}
                </p>
              )}
              <p className="text-xs text-[var(--muted)]">
                Роль: {telegramRoleLabel(createdInvite.role)} · до{' '}
                {formatDateTime(createdInvite.expiresAt)}
              </p>
            </Card>
          ) : null}

          <Card className="overflow-x-auto">
            <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-medium">
              Ожидают активации ({pendingInvites.length})
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-3">Код</th>
                  <th className="px-3 py-3">Роль</th>
                  <th className="px-3 py-3">Истекает</th>
                  <th className="px-3 py-3">Ссылка</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="px-3 py-3 font-mono tracking-wider">
                      {inv.code}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeClass(inv.role)}`}
                      >
                        {telegramRoleLabel(inv.role)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--muted)]">
                      {formatDateTime(inv.expiresAt)}
                    </td>
                    <td className="px-3 py-3">
                      {inv.deepLink ? (
                        <button
                          type="button"
                          className="text-left text-xs text-[var(--accent)] underline"
                          onClick={() => void copyText(inv.deepLink!)}
                        >
                          копировать
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs text-[var(--danger)]"
                        onClick={() => void revokeInvite(inv.id)}
                      >
                        Отозвать
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingInvites.length === 0 ? (
              <Empty>Нет активных приглашений</Empty>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}

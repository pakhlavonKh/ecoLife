import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
const LANGS = ['ru', 'uz'] as const;

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
  const { t } = useTranslation();
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
      setMessage(t('telegram.inviteCreated'));
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
      setMessage(t('telegram.inviteRevoked'));
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
    if (!confirm(t('telegram.confirmDeleteRecipient'))) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await telegramApi.deleteRecipient(id);
      await reload();
      setMessage(t('telegram.recipientDeleted'));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t('telegram.copied'));
    } catch {
      setError(t('telegram.copyFailed'));
    }
  }

  const pendingInvites = invites.filter((i) => i.isPending);

  return (
    <div>
      <PageHeader
        title={t('telegram.title')}
        subtitle={t('telegram.subtitle')}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['recipients', 'telegram.tabRecipients'],
            ['invites', 'telegram.tabInvites'],
          ] as const
        ).map(([key, labelKey]) => (
          <Button
            key={key}
            variant={tab === key ? 'primary' : 'secondary'}
            onClick={() => setTab(key)}
          >
            {t(labelKey)}
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
                <th className="px-3 py-3">{t('telegram.colName')}</th>
                <th className="px-3 py-3">{t('telegram.colRole')}</th>
                <th className="px-3 py-3">{t('telegram.colLanguage')}</th>
                <th className="px-3 py-3">{t('telegram.colChatId')}</th>
                <th className="px-3 py-3">{t('telegram.colActive')}</th>
                <th className="px-3 py-3">{t('telegram.colMutedUntil')}</th>
                <th className="px-3 py-3">{t('telegram.colCreated')}</th>
                <th className="px-3 py-3">{t('telegram.colActions')}</th>
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
                            t('telegram.nameUpdated'),
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
                            t('telegram.roleUpdated'),
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
                  <td className="px-3 py-3">
                    <Select
                      className="min-w-[8rem]"
                      value={r.language ?? 'ru'}
                      onChange={(e) =>
                        void patchRecipient(
                          r.id,
                          { language: e.target.value },
                          t('telegram.languageUpdated'),
                        )
                      }
                    >
                      {LANGS.map((lng) => (
                        <option key={lng} value={lng}>
                          {t(`labels.language.${lng}`)}
                        </option>
                      ))}
                    </Select>
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
                              ? t('telegram.recipientEnabled')
                              : t('telegram.recipientDisabled'),
                          )
                        }
                      />
                      <span className="text-xs text-[var(--muted)]">
                        {r.isActive ? t('common.yes') : t('common.no')}
                      </span>
                    </label>
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--muted)]">
                    {r.mutedUntil
                      ? formatDateTime(r.mutedUntil)
                      : t('common.emDash')}
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
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recipients.length === 0 ? (
            <Empty>{t('telegram.emptyRecipients')}</Empty>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('common.role')}>
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
                {t('telegram.invite')}
              </Button>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {t('telegram.inviteHint')}
            </p>
          </Card>

          {createdInvite ? (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-medium">
                {t('telegram.newInviteTitle')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-[var(--bg)] px-3 py-2 text-lg tracking-widest">
                  {createdInvite.code}
                </code>
                <Button
                  variant="secondary"
                  onClick={() => void copyText(createdInvite.code)}
                >
                  {t('telegram.copyCode')}
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
                    {t('telegram.copyLink')}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-amber-800">
                  {t('telegram.deepLinkUnavailable', {
                    code: createdInvite.code,
                  })}
                </p>
              )}
              <p className="text-xs text-[var(--muted)]">
                {t('telegram.inviteMeta', {
                  role: telegramRoleLabel(createdInvite.role),
                  datetime: formatDateTime(createdInvite.expiresAt),
                })}
              </p>
            </Card>
          ) : null}

          <Card className="overflow-x-auto">
            <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-medium">
              {t('telegram.pendingTitle', { count: pendingInvites.length })}
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-3">{t('common.code')}</th>
                  <th className="px-3 py-3">{t('telegram.colRole')}</th>
                  <th className="px-3 py-3">{t('telegram.colExpires')}</th>
                  <th className="px-3 py-3">{t('telegram.colLink')}</th>
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
                          {t('common.copy')}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--muted)]">
                          {t('common.emDash')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-xs text-[var(--danger)]"
                        onClick={() => void revokeInvite(inv.id)}
                      >
                        {t('telegram.revoke')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingInvites.length === 0 ? (
              <Empty>{t('telegram.emptyInvites')}</Empty>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}

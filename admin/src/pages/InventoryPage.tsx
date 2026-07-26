import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryApi } from '../api/adminApi';
import { getErrorMessage } from '../api/client';
import type { Category, PriceMatrix, Room } from '../api/types';
import {
  Button,
  Card,
  ErrorBox,
  Field,
  Input,
  PageHeader,
  TextArea,
} from '../components/ui';
import { formatMoney } from '../lib/format';

export function InventoryPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'categories' | 'prices' | 'rooms'>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [matrix, setMatrix] = useState<PriceMatrix | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function reload() {
    const [c, r, m] = await Promise.all([
      inventoryApi.categories(),
      inventoryApi.rooms(),
      inventoryApi.priceMatrix(),
    ]);
    setCategories(c.data);
    setRooms(r.data);
    setMatrix(m.data);
  }

  useEffect(() => {
    void reload().catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function saveCategory(cat: Category, patch: Partial<Category>) {
    setError('');
    setMessage('');
    try {
      await inventoryApi.updateCategory(cat.id, patch);
      await reload();
      setMessage(t('inventory.categoryUpdated'));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function saveRoom(room: Room, patch: Record<string, unknown>) {
    setError('');
    setMessage('');
    try {
      await inventoryApi.updateRoom(room.id, patch);
      await reload();
      setMessage(t('inventory.roomUpdated', { number: room.number }));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function saveTier(
    categoryId: string,
    capacity: number,
    pricePerNight: string,
  ) {
    setError('');
    setMessage('');
    try {
      await inventoryApi.upsertTier({ categoryId, capacity, pricePerNight });
      await reload();
      setMessage(t('inventory.priceSaved'));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['categories', 'inventory.tabCategories'],
            ['prices', 'inventory.tabPrices'],
            ['rooms', 'inventory.tabRooms'],
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
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {tab === 'categories' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onSave={(patch) => void saveCategory(cat, patch)}
            />
          ))}
        </div>
      ) : null}

      {tab === 'prices' ? (
        <div className="space-y-4">
          {matrix?.matrix.map((group) => (
            <Card key={group.categoryId} className="overflow-x-auto">
              <div className="border-b border-[var(--line)] px-4 py-3 font-medium">
                {t('inventory.categoryHeading', {
                  name: group.categoryName,
                  code: group.categoryCode,
                })}
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      {t('inventory.colCapacity')}
                    </th>
                    <th className="px-3 py-2 text-left">
                      {t('inventory.colPricePerNight')}
                    </th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.tiers.map((tier) => (
                    <TierRow
                      key={tier.id}
                      capacity={tier.capacity}
                      price={tier.pricePerNight}
                      onSave={(price) =>
                        void saveTier(
                          group.categoryId,
                          tier.capacity,
                          price,
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === 'rooms' ? (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--line)] bg-[var(--bg)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-3">{t('inventory.colRoom')}</th>
                <th className="px-3 py-3">{t('inventory.colCottage')}</th>
                <th className="px-3 py-3">{t('inventory.colCategoryShort')}</th>
                <th className="px-3 py-3">{t('inventory.colBeds')}</th>
                <th className="px-3 py-3">{t('inventory.colTier')}</th>
                <th className="px-3 py-3">{t('inventory.colOverride')}</th>
                <th className="px-3 py-3">{t('inventory.colActive')}</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr
                  key={room.id}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <td className="px-3 py-2 font-medium">{room.number}</td>
                  <td className="px-3 py-2">{room.cottageName}</td>
                  <td className="px-3 py-2">{room.categoryCode}</td>
                  <td className="px-3 py-2">{room.capacity}</td>
                  <td className="px-3 py-2">
                    {formatMoney(room.tierPrice)}
                  </td>
                  <td className="px-3 py-2">
                    <OverrideCell
                      value={room.priceOverride}
                      onSave={(priceOverride) =>
                        void saveRoom(room, { priceOverride })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={room.isActive}
                        onChange={(e) =>
                          void saveRoom(room, { isActive: e.target.checked })
                        }
                      />
                      {room.isActive ? t('common.yes') : t('common.no')}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}

function CategoryCard({
  category,
  onSave,
}: {
  category: Category;
  onSave: (patch: Partial<Category>) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);
  const [depositPercent, setDepositPercent] = useState(
    String(category.depositPercent),
  );
  const [images, setImages] = useState(category.images.join('\n'));
  const [isActive, setIsActive] = useState(category.isActive);

  useEffect(() => {
    setName(category.name);
    setDescription(category.description);
    setDepositPercent(String(category.depositPercent));
    setImages(category.images.join('\n'));
    setIsActive(category.isActive);
  }, [category]);

  return (
    <Card className="p-4">
      <div className="mb-3 text-xs uppercase tracking-wide text-[var(--muted)]">
        {category.code}
      </div>
      <div className="space-y-3">
        <Field label={t('inventory.fieldName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('inventory.fieldDescription')}>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label={t('inventory.fieldDepositPercent')}>
          <Input
            type="number"
            min={0}
            max={100}
            value={depositPercent}
            onChange={(e) => setDepositPercent(e.target.value)}
          />
        </Field>
        <Field label={t('inventory.fieldImages')}>
          <TextArea
            value={images}
            onChange={(e) => setImages(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {t('inventory.fieldActiveFemale')}
        </label>
        <Button
          onClick={() =>
            onSave({
              name,
              description,
              depositPercent: Number(depositPercent),
              images: images
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
              isActive,
            })
          }
        >
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

function TierRow({
  capacity,
  price,
  onSave,
}: {
  capacity: number;
  price: string;
  onSave: (price: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(price);
  useEffect(() => setValue(price), [price]);
  return (
    <tr className="border-t border-[var(--line)]">
      <td className="px-3 py-2">{capacity}</td>
      <td className="px-3 py-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-48"
        />
      </td>
      <td className="px-3 py-2">
        <Button variant="secondary" onClick={() => onSave(value)}>
          {t('common.save')}
        </Button>
      </td>
    </tr>
  );
}

function OverrideCell({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => setLocal(value ?? ''), [value]);
  return (
    <div className="flex items-center gap-2">
      <Input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={t('common.emDash')}
        className="w-28"
      />
      <Button
        variant="ghost"
        onClick={() => onSave(local.trim() === '' ? null : local.trim())}
      >
        {t('common.ok')}
      </Button>
    </div>
  );
}

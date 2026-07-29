import {
  NotificationEvent,
  PrismaClient,
  TelegramStaffRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Default routing matrix from BOT_ROLES.md §4 (true = enabled). */
const NOTIFICATION_MATRIX: Record<
  NotificationEvent,
  Partial<Record<TelegramStaffRole, boolean>>
> = {
  [NotificationEvent.booking_created]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.payment_received]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.booking_checked_in]: {
    admin: true,
    manager: true,
  },
  [NotificationEvent.booking_checked_out]: {
    admin: true,
    manager: true,
    cleaner: true,
  },
  [NotificationEvent.booking_transferred]: {
    owner: true,
    admin: true,
    manager: true,
    cleaner: true,
  },
  [NotificationEvent.booking_updated]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.booking_cancelled]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.system_hold_expired]: {
    admin: true,
  },
  [NotificationEvent.system_late_payment_review]: {
    admin: true,
  },
  [NotificationEvent.system_payment_failed]: {
    admin: true,
  },
  [NotificationEvent.system_room_locked]: {
    owner: true,
    admin: true,
    manager: true,
  },
  [NotificationEvent.digest_morning]: {
    owner: true,
    admin: true,
    manager: true,
    cleaner: true,
  },
};

const ALL_STAFF_ROLES: TelegramStaffRole[] = [
  TelegramStaffRole.owner,
  TelegramStaffRole.admin,
  TelegramStaffRole.manager,
  TelegramStaffRole.cleaner,
];

/** Default age-based prices (UZS / person / night). */
const LUX_PRICES = {
  priceAdult: '800000.00',
  priceChild: '400000.00',
  priceInfant: '0.00',
};
const STANDART_PRICES = {
  priceAdult: '600000.00',
  priceChild: '300000.00',
  priceInfant: '0.00',
};

type RoomSeed = {
  number: string;
  capacity: number;
  category: 'lux' | 'standart';
};

type CottageSeed = {
  name: string;
  sortOrder: number;
  rooms: RoomSeed[];
};

const INVENTORY: CottageSeed[] = [
  {
    name: 'Seshanba kottej',
    sortOrder: 1,
    rooms: [
      { number: '201', capacity: 7, category: 'lux' },
      { number: '202', capacity: 7, category: 'lux' },
      { number: '203', capacity: 7, category: 'lux' },
      { number: '204', capacity: 7, category: 'lux' },
      { number: '205', capacity: 7, category: 'standart' },
    ],
  },
  {
    name: 'Chorshanba kottej',
    sortOrder: 2,
    rooms: [
      { number: '301', capacity: 10, category: 'lux' },
      { number: '302', capacity: 12, category: 'lux' },
      { number: '303', capacity: 10, category: 'lux' },
      { number: '304', capacity: 12, category: 'lux' },
      { number: '305', capacity: 9, category: 'standart' },
      { number: '306', capacity: 9, category: 'standart' },
    ],
  },
  {
    name: 'Payshanba kottej',
    sortOrder: 3,
    rooms: [
      { number: '401', capacity: 2, category: 'standart' },
      { number: '402', capacity: 2, category: 'standart' },
      { number: '403', capacity: 2, category: 'standart' },
      { number: '404', capacity: 2, category: 'standart' },
      { number: '405', capacity: 2, category: 'standart' },
      { number: '406', capacity: 2, category: 'standart' },
      { number: '407', capacity: 2, category: 'standart' },
      { number: '408', capacity: 2, category: 'standart' },
    ],
  },
  {
    name: 'Juma kottej',
    sortOrder: 4,
    rooms: [
      { number: '501', capacity: 9, category: 'lux' },
      { number: '502', capacity: 10, category: 'lux' },
      { number: '503', capacity: 9, category: 'lux' },
      { number: '504', capacity: 10, category: 'lux' },
      { number: '505', capacity: 9, category: 'lux' },
      { number: '506', capacity: 9, category: 'lux' },
    ],
  },
  {
    name: 'Shanba kottej',
    sortOrder: 5,
    rooms: [
      { number: '601', capacity: 4, category: 'lux' },
      { number: '602', capacity: 2, category: 'standart' },
      { number: '603', capacity: 7, category: 'lux' },
      { number: '604', capacity: 4, category: 'lux' },
      { number: '605', capacity: 7, category: 'lux' },
      { number: '606', capacity: 2, category: 'standart' },
    ],
  },
  {
    name: 'Yakshanba kottej',
    sortOrder: 6,
    rooms: [
      { number: '701', capacity: 2, category: 'standart' },
      { number: '702', capacity: 2, category: 'standart' },
      { number: '703', capacity: 2, category: 'standart' },
      { number: '704', capacity: 2, category: 'standart' },
      { number: '705', capacity: 2, category: 'standart' },
      { number: '706', capacity: 2, category: 'standart' },
      { number: '707', capacity: 2, category: 'standart' },
      { number: '708', capacity: 2, category: 'standart' },
      { number: '709', capacity: 2, category: 'standart' },
      { number: '710', capacity: 2, category: 'standart' },
    ],
  },
];

const EXPECTED = {
  cottages: 6,
  rooms: 41,
  luxRooms: 18,
  luxBeds: 150,
  standartRooms: 23,
  standartBeds: 65,
  totalBeds: 215,
};

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@ecolife.local';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_PASSWORD is required to seed in production');
    }
    // Dev-only fallback — never used when NODE_ENV=production.
    console.warn(
      'ADMIN_PASSWORD unset; using temporary dev password ChangeMeAdmin123!',
    );
  }
  const resolvedPassword = password ?? 'ChangeMeAdmin123!';
  const passwordHash = await argon2.hash(resolvedPassword, {
    type: argon2.argon2id,
  });

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      name: 'Admin',
      role: 'admin',
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      name: 'Admin',
      role: 'admin',
      isActive: true,
    },
  });

  console.log(`Admin user: ${admin.email}`);
  return admin;
}

async function seedCategories() {
  const lux = await prisma.roomCategory.upsert({
    where: { code: 'lux' },
    update: {
      name: 'Люкс',
      depositPercent: 50,
      ...LUX_PRICES,
      isActive: true,
    },
    create: {
      code: 'lux',
      name: 'Люкс',
      description: '',
      depositPercent: 50,
      ...LUX_PRICES,
      images: [],
      isActive: true,
    },
  });

  const standart = await prisma.roomCategory.upsert({
    where: { code: 'standart' },
    update: {
      name: 'Стандарт',
      depositPercent: 30,
      ...STANDART_PRICES,
      isActive: true,
    },
    create: {
      code: 'standart',
      name: 'Стандарт',
      description: '',
      depositPercent: 30,
      ...STANDART_PRICES,
      images: [],
      isActive: true,
    },
  });

  console.log(
    `Categories: lux (deposit ${lux.depositPercent}%, adult ${LUX_PRICES.priceAdult} / child ${LUX_PRICES.priceChild} / infant ${LUX_PRICES.priceInfant}), standart (deposit ${standart.depositPercent}%, adult ${STANDART_PRICES.priceAdult} / child ${STANDART_PRICES.priceChild} / infant ${STANDART_PRICES.priceInfant})`,
  );

  return { lux, standart };
}

async function seedInventory(categories: {
  lux: { id: string };
  standart: { id: string };
}) {
  for (const cottageSeed of INVENTORY) {
    const existing = await prisma.cottage.findFirst({
      where: { name: cottageSeed.name },
    });

    const cottage = existing
      ? await prisma.cottage.update({
          where: { id: existing.id },
          data: {
            sortOrder: cottageSeed.sortOrder,
            isActive: true,
          },
        })
      : await prisma.cottage.create({
          data: {
            name: cottageSeed.name,
            sortOrder: cottageSeed.sortOrder,
            isActive: true,
          },
        });

    for (const roomSeed of cottageSeed.rooms) {
      const categoryId =
        roomSeed.category === 'lux' ? categories.lux.id : categories.standart.id;

      await prisma.room.upsert({
        where: { number: roomSeed.number },
        update: {
          cottageId: cottage.id,
          capacity: roomSeed.capacity,
          categoryId,
          isActive: true,
        },
        create: {
          cottageId: cottage.id,
          number: roomSeed.number,
          capacity: roomSeed.capacity,
          categoryId,
          isActive: true,
        },
      });
    }
  }
}

async function seedNotificationRules() {
  let upserted = 0;
  for (const event of Object.values(NotificationEvent)) {
    const enabledRoles = NOTIFICATION_MATRIX[event] ?? {};
    for (const role of ALL_STAFF_ROLES) {
      const enabled = enabledRoles[role] === true;
      await prisma.notificationRule.upsert({
        where: {
          event_role: { event, role },
        },
        update: { enabled },
        create: { event, role, enabled },
      });
      upserted += 1;
    }
  }
  console.log(`Notification rules: ${upserted} rows (default matrix §4)`);
}

async function seedTelegramRecipientsFromEnv() {
  const raw = process.env.TELEGRAM_ADMIN_CHAT_IDS ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    console.log('Telegram recipients: none (TELEGRAM_ADMIN_CHAT_IDS empty)');
    return;
  }

  let created = 0;
  let kept = 0;
  for (const id of ids) {
    let chatId: bigint;
    try {
      chatId = BigInt(id);
    } catch {
      console.warn(`Skipping invalid TELEGRAM_ADMIN_CHAT_IDS entry: ${id}`);
      continue;
    }

    const existing = await prisma.telegramRecipient.findUnique({
      where: { chatId },
    });
    if (existing) {
      kept += 1;
      continue;
    }

    await prisma.telegramRecipient.create({
      data: {
        chatId,
        name: 'Migrated from env',
        role: TelegramStaffRole.admin,
        isActive: true,
      },
    });
    created += 1;
  }

  console.log(
    `Telegram recipients from env: ${created} created, ${kept} already present`,
  );
}

async function verifySanity() {
  const cottages = await prisma.cottage.count();
  const rooms = await prisma.room.findMany({
    include: { category: true },
  });

  const luxRooms = rooms.filter((r) => r.category.code === 'lux');
  const standartRooms = rooms.filter((r) => r.category.code === 'standart');
  const luxBeds = luxRooms.reduce((sum, r) => sum + r.capacity, 0);
  const standartBeds = standartRooms.reduce((sum, r) => sum + r.capacity, 0);
  const totalBeds = luxBeds + standartBeds;

  const actual = {
    cottages,
    rooms: rooms.length,
    luxRooms: luxRooms.length,
    luxBeds,
    standartRooms: standartRooms.length,
    standartBeds,
    totalBeds,
  };

  console.log('');
  console.log('=== Seed sanity check ===');
  console.log(`Cottages:       ${actual.cottages} (expected ${EXPECTED.cottages})`);
  console.log(`Rooms:          ${actual.rooms} (expected ${EXPECTED.rooms})`);
  console.log(
    `LUX:            ${actual.luxRooms} rooms / ${actual.luxBeds} beds (expected ${EXPECTED.luxRooms}/${EXPECTED.luxBeds})`,
  );
  console.log(
    `STANDART:       ${actual.standartRooms} rooms / ${actual.standartBeds} beds (expected ${EXPECTED.standartRooms}/${EXPECTED.standartBeds})`,
  );
  console.log(
    `Total beds:     ${actual.totalBeds} (expected ${EXPECTED.totalBeds})`,
  );

  const mismatches: string[] = [];
  for (const key of Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>) {
    if (actual[key] !== EXPECTED[key]) {
      mismatches.push(`${key}: got ${actual[key]}, expected ${EXPECTED[key]}`);
    }
  }

  if (mismatches.length > 0) {
    console.error('SANITY CHECK FAILED:');
    for (const line of mismatches) console.error(`  - ${line}`);
    process.exitCode = 1;
    throw new Error('Seed sanity totals do not match §4.1');
  }

  console.log('Sanity check: OK');
  return actual;
}

async function main() {
  console.log('Seeding EcoLife inventory (§4.1)...');

  await seedAdmin();
  const categories = await seedCategories();
  await seedInventory(categories);
  await seedNotificationRules();
  await seedTelegramRecipientsFromEnv();
  await verifySanity();

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

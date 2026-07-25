import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Obvious placeholder UZS amounts — replace via admin before go-live. */
const PLACEHOLDER_PRICE = '1000000.00';

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

const PRICE_TIERS: Array<{ category: 'lux' | 'standart'; capacity: number }> = [
  { category: 'lux', capacity: 4 },
  { category: 'lux', capacity: 7 },
  { category: 'lux', capacity: 9 },
  { category: 'lux', capacity: 10 },
  { category: 'lux', capacity: 12 },
  { category: 'standart', capacity: 2 },
  { category: 'standart', capacity: 7 },
  { category: 'standart', capacity: 9 },
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
      isActive: true,
    },
    create: {
      code: 'lux',
      name: 'Люкс',
      description: '',
      depositPercent: 50,
      images: [],
      isActive: true,
    },
  });

  const standart = await prisma.roomCategory.upsert({
    where: { code: 'standart' },
    update: {
      name: 'Стандарт',
      depositPercent: 30,
      isActive: true,
    },
    create: {
      code: 'standart',
      name: 'Стандарт',
      description: '',
      depositPercent: 30,
      images: [],
      isActive: true,
    },
  });

  console.log(
    `Categories: lux (deposit ${lux.depositPercent}%), standart (deposit ${standart.depositPercent}%)`,
  );

  return { lux, standart };
}

async function seedPriceTiers(categories: {
  lux: { id: string };
  standart: { id: string };
}) {
  for (const tier of PRICE_TIERS) {
    const categoryId =
      tier.category === 'lux' ? categories.lux.id : categories.standart.id;

    await prisma.priceTier.upsert({
      where: {
        categoryId_capacity: {
          categoryId,
          capacity: tier.capacity,
        },
      },
      update: {
        pricePerNight: PLACEHOLDER_PRICE,
      },
      create: {
        categoryId,
        capacity: tier.capacity,
        pricePerNight: PLACEHOLDER_PRICE,
      },
    });
  }

  console.log(
    `Price tiers: ${PRICE_TIERS.length} rows (placeholder ${PLACEHOLDER_PRICE} UZS each)`,
  );
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
  await seedPriceTiers(categories);
  await seedInventory(categories);
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

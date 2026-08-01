/**
 * Wipe test bookings + customers (and dependent rows).
 * Keeps inventory, admins, telegram config, price/categories.
 *
 * Usage:
 *   node scripts/wipe-test-data.mjs            # dry-run counts
 *   node scripts/wipe-test-data.mjs --execute  # delete
 */
import { PrismaClient } from '@prisma/client';

const execute = process.argv.includes('--execute');
const prisma = new PrismaClient();

async function counts() {
  const [bookings, customers, payments, bookingRooms, roomLocks, auditRelated] =
    await Promise.all([
      prisma.booking.count(),
      prisma.customer.count(),
      prisma.payment.count(),
      prisma.bookingRoom.count(),
      prisma.roomLock.count(),
      prisma.auditLog.count({
        where: { entity: { in: ['booking', 'customer', 'payment', 'room_lock'] } },
      }),
    ]);
  return { bookings, customers, payments, bookingRooms, roomLocks, auditRelated };
}

async function main() {
  const before = await counts();
  console.log('Before:', before);

  if (!execute) {
    console.log('Dry-run only. Re-run with --execute to delete.');
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const payments = await tx.payment.deleteMany({});
    const roomLocks = await tx.roomLock.deleteMany({});
    // booking_rooms cascade from bookings, but delete explicitly for clarity
    const bookingRooms = await tx.bookingRoom.deleteMany({});
    const bookings = await tx.booking.deleteMany({});
    const customers = await tx.customer.deleteMany({});
    const auditRelated = await tx.auditLog.deleteMany({
      where: { entity: { in: ['booking', 'customer', 'payment', 'room_lock'] } },
    });
    return {
      payments: payments.count,
      roomLocks: roomLocks.count,
      bookingRooms: bookingRooms.count,
      bookings: bookings.count,
      customers: customers.count,
      auditRelated: auditRelated.count,
    };
  });

  const after = await counts();
  console.log('Deleted:', result);
  console.log('After:', after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

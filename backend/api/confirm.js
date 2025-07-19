// api/confirm.js
import mongoose from 'mongoose';
import dayjs from 'dayjs';

export default function (Room, PendingBooking, adminChatId) {
  return async (ctx) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.error('MongoDB not connected');
        return ctx.reply('❌ Database connection error');
      }

      const chatId = ctx.chat.id;
      if (chatId !== Number(adminChatId)) {
        console.log(`Unauthorized confirm attempt from chatId: ${chatId}`);
        return ctx.reply('❌ Unauthorized');
      }

      const parts = ctx.message.text.split(' ');
      if (parts.length !== 3) {
        console.log('Invalid /confirm command format');
        return ctx.reply('❌ Usage: /confirm <roomId> <YYYY-MM-DD>');
      }

      const [, roomId, date] = parts;
      const dateStr = dayjs(date).format('YYYY-MM-DD');
      if (!dayjs(date).isValid()) {
        console.log(`Invalid date format: ${date}`);
        return ctx.reply('❌ Invalid date format');
      }

      const room = await Room.findOne({ id: roomId });
      if (!room) {
        console.log(`Room not found: ${roomId}`);
        return ctx.reply('❌ Room not found');
      }

      if (room.bookings.includes(dateStr)) {
        console.log(`Room ${roomId} already booked on ${dateStr}`);
        return ctx.reply('⚠️ Room already booked on this date');
      }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const pendingBooking = await PendingBooking.findOne({ roomId, date: dateStr }).session(session);
          if (!pendingBooking) {
            console.log(`No pending booking for room ${roomId} on ${dateStr}`);
            return ctx.reply('❌ No pending booking found');
          }

          room.bookings.push(dateStr);
          await room.save({ session });
          await PendingBooking.deleteOne({ _id: pendingBooking._id }).session(session);
          ctx.reply(`✅ Booking confirmed for room "${room.name.ru}" on ${dateStr}`);
        });
      } finally {
        session.endSession();
      }
    } catch (err) {
      console.error('Error in confirmHandler:', err.message, err.stack);
      ctx.reply('❌ Error processing command');
    }
  };
}
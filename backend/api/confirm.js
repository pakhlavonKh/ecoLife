// confirm.js
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

      // Normalize and parse command
      const commandText = ctx.message.text.replace(/\s+/g, ' ').trim();
      console.log('Raw command text:', commandText); // Debug log
      const parts = commandText.split(' ');
      console.log('Split parts:', parts, 'Length:', parts.length); // Debug log
      if (parts.length !== 4) {
        console.log('Invalid /confirm command format');
        return ctx.reply('❌ Usage: /confirm <roomId> <checkIn> <checkOut>');
      }

      const [, roomId, checkInStr, checkOutStr] = parts;
      const checkIn = dayjs(checkInStr);
      const checkOut = dayjs(checkOutStr);

      if (!checkIn.isValid() || !checkOut.isValid() || !checkIn.isBefore(checkOut)) {
        console.log(`Invalid date range: ${checkInStr} - ${checkOutStr}`);
        return ctx.reply('❌ Invalid date range');
      }

      const room = await Room.findOne({ id: roomId });
      if (!room) {
        console.log(`Room not found: ${roomId}`);
        return ctx.reply('❌ Room not found');
      }

      // Check for booking conflicts
      const datesToBook = [];
      let current = checkIn.clone();
      while (current.isBefore(checkOut)) {
        const dateStr = current.format('YYYY-MM-DD');
        if (room.bookings.includes(dateStr)) {
          console.log(`Room ${roomId} already booked on ${dateStr}`);
          return ctx.reply(`⚠️ Room already booked on ${dateStr}`);
        }
        datesToBook.push(dateStr);
        current = current.add(1, 'day');
      }

      // Find pending booking
      console.log('Querying PendingBooking with:', {
        roomId,
        checkIn: checkIn.format('YYYY-MM-DD'),
        checkOut: checkOut.format('YYYY-MM-DD'),
      }); // Debug log
      const pendingBooking = await PendingBooking.findOne({
        roomId,
        checkIn: checkIn.format('YYYY-MM-DD'),
        checkOut: checkOut.format('YYYY-MM-DD'),
      });
      console.log('Found pendingBooking:', pendingBooking); // Debug log

      if (!pendingBooking) {
        console.log(`No pending booking for ${roomId} from ${checkInStr} to ${checkOutStr}`);
        return ctx.reply('❌ No matching pending booking found');
      }

      // Confirm booking
      room.bookings.push(...datesToBook);
      await room.save();
      await PendingBooking.deleteOne({ _id: pendingBooking._id });

      ctx.reply(`✅ Booking confirmed for room "${room.name.ru}" from ${checkInStr} to ${checkOutStr}`);
    } catch (err) {
      console.error('Error in confirmHandler:', err.message, err.stack);
      ctx.reply('❌ Error processing command');
    }
  };
}
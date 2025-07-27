// booking.js
import Joi from 'joi';
import dayjs from 'dayjs';
import mongoose from 'mongoose';

export default function (Room, PendingBooking, bot, adminChatId) {
  return async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.error('MongoDB not connected');
        return res.status(500).json({ error: 'Database connection error' });
      }

      const schema = Joi.object({
        name: Joi.string().min(2).required(),
        phone: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/).required(),
        roomId: Joi.string().required(),
        checkIn: Joi.date().iso().required(),
        checkOut: Joi.date().iso().greater(Joi.ref('checkIn')).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('Validation error in /api/booking:', error.details);
        return res.status(400).json({ error: `Validation error: ${error.details[0].message}` });
      }

      const { name, phone, roomId, checkIn, checkOut } = value;
      const checkInStr = dayjs(checkIn).format('YYYY-MM-DD');
      const checkOutStr = dayjs(checkOut).format('YYYY-MM-DD');

      const room = await Room.findOne({ id: roomId });
      if (!room) {
        console.log(`Room not found: ${roomId}`);
        return res.status(404).json({ error: 'Room not found' });
      }

      const stayDates = [];
      let dateCursor = dayjs(checkIn);
      while (dateCursor.isBefore(checkOut, 'day')) {
        const dateStr = dateCursor.format('YYYY-MM-DD');
        if (room.bookings.includes(dateStr)) {
          console.log(`Room ${roomId} already booked on ${dateStr}`);
          return res.status(400).json({ error: `Room already booked on ${dateStr}` });
        }
        stayDates.push(dateStr);
        dateCursor = dateCursor.add(1, 'day');
      }

      const pendingBooking = new PendingBooking({
        name,
        phone,
        roomId,
        checkIn: checkInStr,
        checkOut: checkOutStr,
      });
      console.log('PendingBooking before save:', pendingBooking.toObject());
      await pendingBooking.save();
      console.log('PendingBooking saved:', pendingBooking.toObject());

      const message = `📢 New booking request:
🏠 Room: ${room.name.ru}
📅 Dates: ${checkInStr} → ${checkOutStr}
👤 Name: ${name}
📞 Phone: ${phone}`;
      await bot.telegram.sendMessage(adminChatId, message, {
        reply_markup: {
          inline_keyboard: [[
            {
              text: 'Confirm Booking',
              callback_data: `confirm:${roomId}:${checkInStr}:${checkOutStr}`,
            },
          ]],
        },
      });

      res.json({ message: 'Booking request sent' });
    } catch (err) {
      console.error('Error in bookHandler:', err.message, err.stack);
      res.status(500).json({ error: 'Failed to process booking request' });
    }
  };
}
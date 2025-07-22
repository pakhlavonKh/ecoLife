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
        phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
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

      // Check if any date in range is already booked
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

      // Save pending booking
      const pendingBooking = new PendingBooking({
        name,
        phone,
        roomId,
        date: checkInStr,
        checkOut: checkOutStr,
      });
      await pendingBooking.save();

      // Send Telegram message
      const message = `📢 New booking request:
🏠 Room: ${room.name.ru}
📅 Dates: ${checkInStr} → ${checkOutStr}
👤 Name: ${name}
📞 Phone: ${phone}

To confirm: /confirm roomId:${roomId}, ${checkInStr} ${checkOutStr}`;
      await bot.telegram.sendMessage(adminChatId, message);

      res.json({ message: 'Booking request sent' });
    } catch (err) {
      console.error('Error in bookHandler:', err.message, err.stack);
      res.status(500).json({ error: 'Failed to process booking request' });
    }
  };
}

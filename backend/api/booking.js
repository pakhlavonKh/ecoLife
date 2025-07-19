// api/booking.js
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
        date: Joi.date().iso().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('Validation error in /api/book:', error.details);
        return res.status(400).json({ error: `Validation error: ${error.details[0].message}` });
      }

      const { name, phone, roomId, date } = value;
      const dateStr = dayjs(date).format('YYYY-MM-DD');

      const room = await Room.findOne({ id: roomId });
      if (!room) {
        console.log(`Room not found: ${roomId}`);
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.bookings.includes(dateStr)) {
        console.log(`Room ${roomId} already booked on ${dateStr}`);
        return res.status(400).json({ error: 'Room already booked on this date' });
      }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const pendingBooking = new PendingBooking({ name, phone, roomId, date: dateStr });
          await pendingBooking.save({ session });

          const message = `New booking request:\nRoom: ${room.name.ru}\nDate: ${dateStr}\nName: ${name}\nPhone: ${phone}\nUse /confirm ${roomId} ${dateStr} to confirm`;
          await bot.telegram.sendMessage(adminChatId, message);
        });
        res.json({ message: 'Booking request sent' });
      } finally {
        session.endSession();
      }
    } catch (err) {
      console.error('Error in bookHandler:', err.message, err.stack);
      res.status(500).json({ error: 'Failed to process booking request' });
    }
  };
}
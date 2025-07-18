import Joi from 'joi';
import dayjs from 'dayjs';
import mongoose from 'mongoose';

export default function (Room) {
  return async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.error('MongoDB not connected');
        return res.status(500).json({ error: 'Database connection error' });
      }

      const schema = Joi.object({
        date: Joi.date().iso().required(),
        guests: Joi.number().integer().min(1).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('Validation error in /api/search:', error.details);
        return res.status(400).json({ error: `Validation error: ${error.details[0].message}` });
      }

      const { date, guests } = value;
      const dateStr = dayjs(date).format('YYYY-MM-DD');
      console.log(`Querying rooms for date: ${dateStr}, guests: ${guests}`);

      const availableRooms = await Room.find({
        capacity: { $gte: guests },
        bookings: { $ne: dateStr },
      });

      if (!availableRooms.length) {
        console.log('No rooms found for the given criteria');
        return res.status(200).json([]);
      }

      console.log(`Found ${availableRooms.length} available rooms`);
      res.json(availableRooms);
    } catch (err) {
      console.error('Error in searchHandler:', err.message, err.stack);
      res.status(500).json({ error: 'Failed to fetch available rooms. Please try again.' });
    }
  };
}
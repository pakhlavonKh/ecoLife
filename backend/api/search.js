import Joi from 'joi';
import dayjs from 'dayjs';
import mongoose from 'mongoose';

export default function searchHandler(Room) {
  return async (req, res) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        console.error('❌ MongoDB not connected');
        return res.status(500).json({ error: 'Database connection error' });
      }
      
      console.log('📥 Raw req.body:', req.body); 
      // Validate input
      const schema = Joi.object({
        checkIn: Joi.date().iso().required(),
        checkOut: Joi.date().iso().required(),
        guests: Joi.number().integer().min(1).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('❌ Validation error in /api/search:', error.details);
        return res.status(400).json({ error: `Validation error: ${error.details[0].message}` });
      }

      const { checkIn, checkOut, guests } = value;
      const checkInStr = dayjs(checkIn).format('YYYY-MM-DD');
      const checkOutStr = dayjs(checkOut).format('YYYY-MM-DD');

      // Generate all dates in range
      const stayDates = [];
      let current = dayjs(checkIn);
      const end = dayjs(checkOut);

      while (current.isBefore(end)) {
        stayDates.push(current.format('YYYY-MM-DD'));
        current = current.add(1, 'day');
      }

      console.log(`🔍 Checking rooms for ${guests} guests from ${checkInStr} to ${checkOutStr} (${stayDates.length} nights)`);

      // Find available rooms (no overlap with stayDates)
      const availableRooms = await Room.find({
        capacity: { $gte: guests },
        $or: [
          { bookings: { $exists: false } },
          { bookings: { $not: { $elemMatch: { $in: stayDates } } } },
        ],
      });

      console.log(`✅ Found ${availableRooms.length} available rooms`);
      res.json(availableRooms);
    } catch (err) {
      console.error('❌ Error in searchHandler:', err.message, err.stack);
      res.status(500).json({ error: 'Failed to fetch available rooms. Please try again.' });
    }
  };
}

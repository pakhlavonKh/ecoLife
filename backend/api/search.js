import Joi from 'joi';
import dayjs from 'dayjs';

export default function (Room) {
  return async (req, res) => {
    try {
      const schema = Joi.object({
        date: Joi.date().iso().required(),
        guests: Joi.number().integer().min(1).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const { date, guests } = value;
      const dateStr = dayjs(date).format('YYYY-MM-DD');

      const availableRooms = await Room.find({
        capacity: { $gte: guests },
        bookings: { $ne: dateStr },
      });

      res.json(availableRooms);
    } catch (err) {
      console.error('Error in searchHandler:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
// export default function (rooms) {
//   return (req, res) => {
//     const { date, guests } = req.body;

//     if (!date || !guests) {
//       return res.status(400).json({ error: 'Date and guest count required' });
//     }

//     const availableRooms = rooms.filter(room =>
//       room.capacity >= guests && !room.bookings.includes(date)
//     );

//     res.json(availableRooms);
//   };
// }
import Joi from 'joi';

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
      const availableRooms = await Room.find({
        capacity: { $gte: guests },
        bookings: { $ne: date },
      });
      res.json(availableRooms);
    } catch (err) {
      console.error('Error in searchHandler:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
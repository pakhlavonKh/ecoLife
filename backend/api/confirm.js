// export default function (rooms) {
//   return (ctx) => {
//     const parts = ctx.message.text.split(' ');
//     if (parts.length !== 3) {
//       return ctx.reply('❌ Usage: /confirm <roomId> <YYYY-MM-DD>');
//     }

//     const [_, roomId, date] = parts;
//     const room = rooms.find(r => r.id === roomId);

//     if (!room) {
//       return ctx.reply('❌ Room not found');
//     }

//     if (room.bookings.includes(date)) {
//       return ctx.reply('⚠️ Room already booked for this date');
//     }

//     room.bookings.push(date);
//     ctx.reply(`✅ Booking confirmed for Room "${room.name}" on ${date}`);
//   };
// }
import Joi from 'joi';

export default function (Room, PendingBooking, ADMIN_CHAT_ID) {
  return async (ctx) => {
    try {
      if (ctx.chat.id !== parseInt(ADMIN_CHAT_ID)) {
        return ctx.reply('❌ Unauthorized');
      }
      const parts = ctx.message.text.split(' ');
      if (parts.length !== 3) {
        return ctx.reply('❌ Usage: /confirm <roomId> <YYYY-MM-DD>');
      }
      const [_, roomId, date] = parts;
      const schema = Joi.object({
        roomId: Joi.string().required(),
        date: Joi.date().iso().required(),
      });
      const { error } = schema.validate({ roomId, date });
      if (error) return ctx.reply(`❌ Invalid input: ${error.details[0].message}`);

      const room = await Room.findOne({ id: roomId });
      if (!room) return ctx.reply('❌ Room not found');
      if (room.bookings.includes(date)) return ctx.reply('⚠️ Room already booked for this date');
      room.bookings.push(date);
      await room.save();
      await PendingBooking.deleteOne({ roomId, date });
      ctx.reply(`✅ Booking confirmed for Room "${room.name}" on ${date}`);
    } catch (err) {
      console.error('Error in confirmHandler:', err);
      ctx.reply('❌ An error occurred while processing the confirmation');
    }
  };
}
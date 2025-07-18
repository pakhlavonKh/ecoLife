import Joi from 'joi';
import mongoose from 'mongoose';

export default function (Room, PendingBooking, bot, ADMIN_CHAT_ID) {
  return async (req, res) => {
    try {
      const schema = Joi.object({
        name: Joi.string().min(2).required(),
        phone: Joi.string().pattern(/^\+?\d{10,15}$/).required(),
        roomId: Joi.string().required(),
        date: Joi.date().iso().required(),
      });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const { name, phone, roomId, date } = value;
      const room = await Room.findOne({ id: roomId });
      if (!room) return res.status(404).json({ error: 'Room not found' });
      if (room.bookings.includes(date)) return res.status(400).json({ error: 'Already booked' });

      await new PendingBooking({ name, phone, roomId, date }).save();

      // Get admin's language
      const admin = await mongoose.model('Admin').findOne({ chatId: parseInt(ADMIN_CHAT_ID) });
      const lang = admin ? admin.language : 'ru';
      
      const translations = {
        ru: `🛎️ Новый запрос на бронирование:
👤 Имя: ${name}
📞 Телефон: ${phone}
🏨 Комната: ${room.name.ru}
📅 Дата: ${date}
✅ Для подтверждения введите: /confirm ${roomId} ${date}`,
        uz: `🛎️ Yangi bron qilish so‘rovi:
👤 Ism: ${name}
📞 Telefon: ${phone}
🏨 Xona: ${room.name.uz}
📅 Sana: ${date}
✅ Tasdiqlash uchun kiriting: /confirm ${roomId} ${date}`,
      };

      await bot.telegram.sendMessage(ADMIN_CHAT_ID, translations[lang]);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('Error in bookHandler:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
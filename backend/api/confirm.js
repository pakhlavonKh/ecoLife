import Joi from 'joi';

export default function (Room, PendingBooking, ADMIN_CHAT_ID) {
  return async (ctx) => {
    try {
      const lang = await getUserLanguage(ctx.chat.id);
      if (ctx.chat.id !== parseInt(ADMIN_CHAT_ID)) {
        return ctx.reply(translations[lang].unauthorized);
      }
      const parts = ctx.message.text.split(' ');
      if (parts.length !== 3) {
        return ctx.reply(translations[lang].confirmUsage);
      }
      const [_, roomId, date] = parts;
      const schema = Joi.object({
        roomId: Joi.string().required(),
        date: Joi.date().iso().required(),
      });
      const { error } = schema.validate({ roomId, date });
      if (error) return ctx.reply(`❌ ${translations[lang].error}: ${error.details[0].message}`);

      const room = await Room.findOne({ id: roomId });
      if (!room) return ctx.reply(translations[lang].roomNotFound);
      if (room.bookings.includes(date)) return ctx.reply(translations[lang].roomBooked);
      room.bookings.push(date);
      await room.save();
      await PendingBooking.deleteOne({ roomId, date });
      ctx.reply(translations[lang].bookingConfirmed.replace('%s', room.name[lang]).replace('%s', date));
    } catch (err) {
      console.error('Error in confirmHandler:', err);
      ctx.reply(translations[lang].error);
    }
  };
}

// Helper function to get user language (duplicated here for completeness, but should be shared)
const translations = {
  ru: {
    unauthorized: '❌ Неавторизован. Пожалуйста, авторизуйтесь с помощью /start.',
    confirmUsage: '❌ Использование: /confirm <roomId> <ГГГГ-ММ-ДД>',
    roomNotFound: '❌ Комната не найдена',
    roomBooked: '⚠️ Комната уже забронирована на эту дату',
    bookingConfirmed: '✅ Бронирование подтверждено для комнаты "%s" на %s',
    error: '❌ Произошла ошибка при обработке команды',
  },
  uz: {
    unauthorized: '❌ Avtorizatsiya qilinmagan. Iltimos, /start orqali avtorizatsiya qiling.',
    confirmUsage: '❌ Foydalanish: /confirm <roomId> <YYYY-MM-DD>',
    roomNotFound: '❌ Xona topilmadi',
    roomBooked: '⚠️ Xona ushbu sanada allaqachon band qilingan',
    bookingConfirmed: '✅ "%s" xonasi uchun %s sanasida bron qilindi',
    error: '❌ Buyruqni qayta ishlashda xatolik yuz berdi',
  },
};

async function getUserLanguage(chatId) {
  const admin = await mongoose.model('Admin').findOne({ chatId });
  return admin ? admin.language : 'ru'; // Default to Russian
}
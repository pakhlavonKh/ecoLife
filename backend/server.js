/* eslint-env node */
import express from 'express';
import cors from 'cors';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import searchHandler from './api/search.js';
import bookHandler from './api/booking.js';
import confirmHandler from './api/confirm.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- Database Setup ---
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const RoomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: {
    ru: String,
    uz: String,
  },
  description: {
    ru: String,
    uz: String,
  },
  capacity: Number,
  bookings: [String],
});
const PendingBookingSchema = new mongoose.Schema({
  name: String,
  phone: String,
  roomId: String,
  date: String,
});
const AdminSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  name: String,
  password: String,
  language: { type: String, default: 'ru' },
});
const Room = mongoose.model('Room', RoomSchema);
const PendingBooking = mongoose.model('PendingBooking', PendingBookingSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// --- Localization ---
const translations = {
  ru: {
    welcome: 'Добро пожаловать! Введите ваше имя и пароль (формат: /start Имя Пароль).',
    invalidCredentials: 'Неверное имя или пароль. Попробуйте снова: /start Имя Пароль',
    alreadyAuthenticated: 'Вы уже авторизованы!',
    languagePrompt: 'Выберите язык: /language ru (Русский) или /language uz (Oʻzbek)',
    languageSet: 'Язык установлен: %s',
    unauthorized: '❌ Неавторизован. Пожалуйста, авторизуйтесь с помощью /start.',
    confirmUsage: '❌ Использование: /confirm <roomId> <ГГГГ-ММ-ДД>',
    roomNotFound: '❌ Комната не найдена',
    roomBooked: '⚠️ Комната уже забронирована на эту дату',
    bookingConfirmed: '✅ Бронирование подтверждено для комнаты "%s" на %s',
    error: '❌ Произошла ошибка при обработке команды',
    getId: 'Ваш ID чата: %s',
  },
  uz: {
    welcome: 'Xush kelibsiz! Ismingiz va parolingizni kiriting (format: /start Ism Parol).',
    invalidCredentials: 'Noto‘g‘ri ism yoki parol. Qayta urinib ko‘ring: /start Ism Parol',
    alreadyAuthenticated: 'Siz allaqachon avtorizatsiya qilingansiz!',
    languagePrompt: 'Tilni tanlang: /language ru (Ruscha) yoki /language uz (O‘zbek)',
    languageSet: 'Til o‘rnatildi: %s',
    unauthorized: '❌ Avtorizatsiya qilinmagan. Iltimos, /start orqali avtorizatsiya qiling.',
    confirmUsage: '❌ Foydalanish: /confirm <roomId> <YYYY-MM-DD>',
    roomNotFound: '❌ Xona topilmadi',
    roomBooked: '⚠️ Xona ushbu sanada allaqachon band qilingan',
    bookingConfirmed: '✅ "%s" xonasi uchun %s sanasida bron qilindi',
    error: '❌ Buyruqni qayta ishlashda xatolik yuz berdi',
    getId: 'Sizning chat ID: %s',
  },
};

// --- Telegram Bot Setup ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.error('Missing BOT_TOKEN or ADMIN_CHAT_ID');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const authenticatedAdmins = new Set();

// --- Helper: Get User Language ---
async function getUserLanguage(chatId) {
  const admin = await Admin.findOne({ chatId });
  return admin ? admin.language : 'ru';
}

// --- Admin Authentication ---
bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id;
  if (authenticatedAdmins.has(chatId)) {
    const lang = await getUserLanguage(chatId);
    return ctx.reply(translations[lang].alreadyAuthenticated);
  }

  const parts = ctx.message.text.split(' ');
  if (parts.length !== 3) {
    return ctx.reply(translations.ru.welcome);
  }

  const [_, name, password] = parts;
  const admin = await Admin.findOne({ name });
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return ctx.reply(translations.ru.invalidCredentials);
  }

  if (admin.chatId !== chatId) {
    admin.chatId = chatId;
    await admin.save();
  }

  authenticatedAdmins.add(chatId);
  const lang = await getUserLanguage(chatId);
  ctx.reply(`${translations[lang].welcome}\n${translations[lang].languagePrompt}`);
});

// --- Language Selection ---
bot.command('language', async (ctx) => {
  const chatId = ctx.chat.id;
  if (!authenticatedAdmins.has(chatId)) {
    const lang = await getUserLanguage(chatId);
    return ctx.reply(translations[lang].unauthorized);
  }

  const parts = ctx.message.text.split(' ');
  if (parts.length !== 2 || !['ru', 'uz'].includes(parts[1])) {
    const lang = await getUserLanguage(chatId);
    return ctx.reply(translations[lang].languagePrompt);
  }

  const newLang = parts[1];
  await Admin.updateOne({ chatId }, { language: newLang });
  const langName = newLang === 'ru' ? 'Русский' : 'O‘zbek';
  ctx.reply(translations[newLang].languageSet.replace('%s', langName));
});

// --- Telegram Bot Commands ---
bot.command('getid', async (ctx) => {
  const lang = await getUserLanguage(ctx.chat.id);
  ctx.reply(translations[lang].getId.replace('%s', ctx.chat.id));
});

bot.command('confirm', confirmHandler(Room, PendingBooking, ADMIN_CHAT_ID));

// --- API Routes ---
app.post('/api/search', searchHandler(Room));
app.post('/api/book', bookHandler(Room, PendingBooking, bot, ADMIN_CHAT_ID));

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start the Server ---
const PORT = process.env.PORT || 5000;
bot.launch().catch(err => {
  console.error('Failed to launch bot:', err);
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
  bot.stop('SIGTERM');
  mongoose.connection.close(() => process.exit(0));
});
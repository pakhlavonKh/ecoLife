/* eslint-env node */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import searchHandler from './api/search.js';
import bookHandler from './api/booking.js';
import confirmHandler from './api/confirm.js';

dotenv.config();

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

// --- Validate Environment Variables ---
const requiredEnvVars = ['MONGO_URI', 'BOT_TOKEN', 'ADMIN_CHAT_ID', 'PORT'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// --- Health Check Endpoint ---
app.get('/health', (req, res) => {
  console.log('Received request to /health');
  res.status(200).json({ status: 'OK', message: 'Server is running', timestamp: new Date().toISOString() });
});

// --- Database Setup with Retry ---
const connectWithRetry = () => {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
      console.error('MongoDB connection error:', err.message, err.stack);
      console.log('Retrying MongoDB connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};
connectWithRetry();

// --- Schemas ---
const RoomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { ru: String, uz: String },
  description: { ru: String, uz: String },
  capacity: Number,
  bookings: [String],
}, { timestamps: true });
RoomSchema.index({ capacity: 1, bookings: 1 });

const PendingBookingSchema = new mongoose.Schema({
  name: String,
  phone: String,
  roomId: String,
  date: String,
}, { timestamps: true });

const AdminSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  name: String,
  password: String,
  language: { type: String, default: 'ru' },
}, { timestamps: true });

const Room = mongoose.model('Room', RoomSchema);
const PendingBooking = mongoose.model('PendingBooking', PendingBookingSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// --- Localization ---
const translations = {
  ru: {
    welcome: 'Добро пожаловать! Введите ваше имя и пароль (формат: /login Имя Пароль).',
    invalidCredentials: 'Неверное имя или пароль. Попробуйте снова: /login Имя Пароль',
    alreadyAuthenticated: 'Вы уже авторизованы!',
    languagePrompt: 'Выберите язык: /language ru (Русский) или /language uz (Oʻzbek)',
    languageSet: 'Язык установлен: %s',
    unauthorized: '❌ Неавторизован. Пожалуйста, авторизуйтесь с помощью /login.',
    confirmUsage: '❌ Использование: /confirm <roomId> <ГГГГ-ММ-ДД>',
    roomNotFound: '❌ Комната не найдена',
    roomBooked: '⚠️ Комната уже забронирована на эту дату',
    bookingConfirmed: '✅ Бронирование подтверждено для комнаты "%s" на %s',
    error: '❌ Произошла ошибка при обработке команды',
    getId: 'Ваш ID чата: %s',
  },
  uz: {
    welcome: 'Xush kelibsiz! Ismingiz va parolingizni kiriting (format: /login Ism Parol).',
    invalidCredentials: 'Noto‘g‘ri ism yoki parol. Qayta urinib ko‘ring: /login Ism Parol',
    alreadyAuthenticated: 'Siz allaqachon avtorizatsiya qilingansiz!',
    languagePrompt: 'Tilni tanlang: /language ru (Ruscha) yoki /language uz (O‘zbek)',
    languageSet: 'Til o‘rnatildi: %s',
    unauthorized: '❌ Avtorizatsiya qilinmagan. Iltimos, /login orqali avtorizatsiya qiling.',
    confirmUsage: '❌ Foydalanish: /confirm <roomId> <YYYY-MM-DD>',
    roomNotFound: '❌ Xona topilmadi',
    roomBooked: '⚠️ Xona ushbu sanada allaqachon band qilingan',
    bookingConfirmed: '✅ "%s" xonasi uchun %s sanasida bron qilindi',
    error: '❌ Buyruqni qayta ishlashda xatolik yuz berdi',
    getId: 'Sizning chat ID: %s',
  },
};

// --- Telegram Bot Setup ---
const bot = new Telegraf(process.env.BOT_TOKEN);
const authenticatedAdmins = new Set();
const onboardingState = new Map(); // chatId -> { stage: 'language' | 'login', language?: 'ru'|'uz' }

async function getUserLanguage(chatId) {
  const admin = await Admin.findOne({ chatId });
  return admin ? admin.language : 'ru';
}

// --- Start Command ---
bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id;
  if (authenticatedAdmins.has(chatId)) {
    const lang = await getUserLanguage(chatId);
    return ctx.reply(translations[lang].alreadyAuthenticated);
  }
  onboardingState.set(chatId, { stage: 'language' });
  ctx.reply('Choose language: /language ru or /language uz');
});

// --- Language Command ---
bot.command('language', async (ctx) => {
  const chatId = ctx.chat.id;
  const parts = ctx.message.text.split(' ');
  if (parts.length !== 2 || !['ru', 'uz'].includes(parts[1])) {
    return ctx.reply('❌ Invalid language. Use /language ru or /language uz');
  }

  const selectedLang = parts[1];
  const state = onboardingState.get(chatId);

  if (state && state.stage === 'language') {
    onboardingState.set(chatId, { stage: 'login', language: selectedLang });
    return ctx.reply(translations[selectedLang].welcome);
  }

  if (authenticatedAdmins.has(chatId)) {
    await Admin.updateOne({ chatId }, { language: selectedLang });
    const langName = selectedLang === 'ru' ? 'Русский' : 'O‘zbek';
    return ctx.reply(translations[selectedLang].languageSet.replace('%s', langName));
  }

  ctx.reply('Please start with /start');
});

// --- Login Command ---
bot.command('login', async (ctx) => {
  const chatId = ctx.chat.id;
  const state = onboardingState.get(chatId);
  if (!state || state.stage !== 'login') {
    return ctx.reply('Please start with /start and select language first.');
  }

  const [_, name, password] = ctx.message.text.split(' ');
  if (!name || !password) {
    return ctx.reply(translations[state.language].welcome);
  }

  const admin = await Admin.findOne({ name });
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return ctx.reply(translations[state.language].invalidCredentials);
  }

  admin.chatId = chatId;
  admin.language = state.language;
  await admin.save();

  authenticatedAdmins.add(chatId);
  onboardingState.delete(chatId);

  ctx.reply(`${translations[state.language].welcome}\n✅ You are now logged in. Available commands:\n/confirm\n/getid`);
});

// --- Get Chat ID ---
bot.command('getid', async (ctx) => {
  const lang = await getUserLanguage(ctx.chat.id);
  ctx.reply(translations[lang].getId.replace('%s', ctx.chat.id));
});

// --- Confirm Command ---
bot.command('confirm', confirmHandler(Room, PendingBooking, process.env.ADMIN_CHAT_ID));

// --- API Routes ---
app.post('/api/search', (req, res, next) => {
  console.log('Received request to /api/search:', req.body);
  searchHandler(Room)(req, res, next);
});
app.post('/api/book', (req, res, next) => {
  console.log('Received request to /api/book:', req.body);
  bookHandler(Room, PendingBooking, bot, process.env.ADMIN_CHAT_ID)(req, res, next);
});

// --- Catch-All Route ---
app.use((req, res) => {
  console.log(`Received unknown request: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error('Server error:', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
bot.launch().catch(err => {
  console.error('Failed to launch bot:', err.message, err.stack);
  process.exit(1);
});
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// --- Graceful Shutdown ---
process.on('SIGTERM', () => {
  bot.stop('SIGTERM');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

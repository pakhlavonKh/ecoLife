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

// Validate Environment Variables
const requiredEnvVars = ['MONGO_URI', 'BOT_TOKEN', 'ADMIN_CHAT_ID', 'PORT'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Health Check Endpoint
app.get('/health', (req, res) => {
  console.log('Received request to /health');
  res.status(200).json({ status: 'OK', message: 'Server is running', timestamp: new Date().toISOString() });
});

// Database Setup with Retry
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

// Schemas
const RoomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { ru: String, uz: String },
  description: { ru: String, uz: String },
  capacity: Number,
  bookings: [String],
}, { timestamps: true });
RoomSchema.index({ capacity: 1, bookings: 1 });

const PendingBookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  roomId: { type: String, required: true },
  checkIn: { type: String, required: true },
  checkOut: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
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

// Localization
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
    listPending: 'Список ожидающих бронирований:\n%s',
    noPending: 'Нет ожидающих бронирований.',
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
    listPending: 'Kutayotgan bronlar ro‘yxati:\n%s',
    noPending: 'Kutayotgan bronlar yo‘q.',
  },
};

// Telegram Bot Setup
const bot = new Telegraf(process.env.BOT_TOKEN);
const authenticatedAdmins = new Set();
const onboardingState = new Map();

async function getUserLanguage(chatId) {
  const admin = await Admin.findOne({ chatId });
  return admin ? admin.language : 'ru';
}

// Start Command
bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id;
  if (authenticatedAdmins.has(chatId)) {
    const lang = await getUserLanguage(chatId);
    return ctx.reply(translations[lang].alreadyAuthenticated);
  }
  onboardingState.set(chatId, { stage: 'language' });
  ctx.reply('Choose language: /language ru or /language uz');
});

// Language Command
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

// Login Command
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

  ctx.reply(`${translations[state.language].welcome}\n✅ You are now logged in. Available commands:\n/confirm\n/getid\n/listpending`);
});

// Get Chat ID
bot.command('getid', async (ctx) => {
  const lang = await getUserLanguage(ctx.chat.id);
  ctx.reply(translations[lang].getId.replace('%s', ctx.chat.id));
});

// List Pending Bookings
bot.command('listpending', async (ctx) => {
  const chatId = ctx.chat.id;
  if (!authenticatedAdmins.has(chatId)) {
    const lang = await getUserLanguage(chatId);
    return ctx.reply(translations[lang].unauthorized);
  }

  const bookings = await PendingBooking.find({});
  const lang = await getUserLanguage(chatId);
  if (bookings.length === 0) {
    return ctx.reply(translations[lang].noPending);
  }
  const message = bookings
    .map((b) => `Room: ${b.roomId}, Dates: ${b.checkIn} → ${b.checkOut}, Name: ${b.name}`)
    .join('\n');
  ctx.reply(translations[lang].listPending.replace('%s', message));
});

// Confirm Command
bot.command('confirm', confirmHandler(Room, PendingBooking, process.env.ADMIN_CHAT_ID));

// Inline Button Handler
bot.on('callback_query', async (ctx) => {
  const [action, roomId, checkInStr, checkOutStr] = ctx.callbackQuery.data.split(':');
  const chatId = ctx.chat.id;
  if (!authenticatedAdmins.has(chatId)) {
    const lang = await getUserLanguage(chatId);
    return ctx.reply(translations[lang].unauthorized);
  }

  if (action === 'confirm') {
    try {
      const checkIn = dayjs(checkInStr);
      const checkOut = dayjs(checkOutStr);
      if (!checkIn.isValid() || !checkOut.isValid() || !checkIn.isBefore(checkOut)) {
        return ctx.reply('❌ Invalid date range');
      }

      const room = await Room.findOne({ id: roomId });
      if (!room) {
        return ctx.reply('❌ Room not found');
      }

      const datesToBook = [];
      let current = checkIn.clone();
      while (current.isBefore(checkOut)) {
        const dateStr = current.format('YYYY-MM-DD');
        if (room.bookings.includes(dateStr)) {
          return ctx.reply(`⚠️ Room already booked on ${dateStr}`);
        }
        datesToBook.push(dateStr);
        current = current.add(1, 'day');
      }

      const pendingBooking = await PendingBooking.findOne({
        roomId,
        checkIn: checkInStr,
        checkOut: checkOutStr,
      });
      if (!pendingBooking) {
        return ctx.reply('❌ No matching pending booking found');
      }

      room.bookings.push(...datesToBook);
      await room.save();
      await PendingBooking.deleteOne({ _id: pendingBooking._id });

      const lang = await getUserLanguage(chatId);
      ctx.reply(`✅ Booking confirmed for room "${room.name[lang]}" from ${checkInStr} to ${checkOutStr}`);
    } catch (err) {
      console.error('Error in callback handler:', err.message, err.stack);
      ctx.reply('❌ Error processing command');
    }
  }
  ctx.answerCbQuery();
});

// API Routes
app.post('/api/search', (req, res, next) => {
  console.log('Received request to /api/search:', req.body);
  searchHandler(Room)(req, res, next);
});
app.post('/api/booking', (req, res, next) => {
  console.log('Received request to /api/booking:', req.body);
  bookHandler(Room, PendingBooking, bot, process.env.ADMIN_CHAT_ID)(req, res, next);
});

// Catch-All Route
app.use((req, res) => {
  console.log(`Received unknown request: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start Server
const PORT = process.env.PORT || 5000;
bot.launch().catch(err => {
  console.error('Failed to launch bot:', err.message, err.stack);
  process.exit(1);
});
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  bot.stop('SIGTERM');
  mongoose.connection.close(() => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});
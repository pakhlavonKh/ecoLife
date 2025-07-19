/* eslint-env node */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/room-reservation';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

async function seedDatabase() {
  try {
    // Validate environment variables
    const requiredEnvVars = ['MONGO_URI', 'ADMIN_CHAT_ID', 'ADMIN_PASSWORD'];
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingEnvVars.length > 0) {
      throw new Error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    }
    if (isNaN(ADMIN_CHAT_ID)) {
      throw new Error('ADMIN_CHAT_ID must be a valid number');
    }
    if (ADMIN_PASSWORD.length < 8) {
      throw new Error('ADMIN_PASSWORD must be at least 8 characters long');
    }

    // Connect to MongoDB with retry
    let retries = 3;
    let attempt = 1;
    while (retries > 0) {
      try {
        console.log(`Attempting MongoDB connection (attempt ${attempt}/${retries}) with URI: ${MONGO_URI}`);
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');
        break;
      } catch (err) {
        console.error(`MongoDB connection error (attempt ${attempt}/${retries}):`, err.message, err.stack);
        retries--;
        attempt++;
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Seed Rooms
    await Room.deleteMany({});
    await Room.insertMany([
      {
        id: '1',
        name: { ru: 'Стандартный одноместный номер', uz: 'Standart bir kishilik xona' },
        description: {
          ru: 'Уютный одноместный номер с современными удобствами и красивым видом.',
          uz: 'Zamonaviy qulayliklar va chiroyli manzarali qulay bir kishilik xona.',
        },
        capacity: 1,
        bookings: [],
      },
      {
        id: '2',
        name: { ru: 'Двухместный номер с балконом', uz: 'Balkonli ikki kishilik xona' },
        description: {
          ru: 'Просторный номер с балконом для двоих, современными удобствами и уютной атмосферой.',
          uz: 'Ikkita kishi uchun balkonli keng xona, zamonaviy qulayliklar va qulay muhit.',
        },
        capacity: 2,
        bookings: [],
      },
      {
        id: '3',
        name: { ru: 'Семейный люкс', uz: 'Oila uchun lyuks' },
        description: {
          ru: 'Идеальный вариант для семьи: две спальни, гостиная и балкон.',
          uz: 'Oila uchun ideal variant: ikkita yotoqxona, mehmonxona va balkon.',
        },
        capacity: 4,
        bookings: [],
      },
    ]);
    console.log('Rooms seeded');

    // Seed Admin
    await Admin.deleteMany({});
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await new Admin({
      chatId: parseInt(ADMIN_CHAT_ID),
      name: 'AdminName',
      password: hashedPassword,
      language: 'ru',
    }).save();
    console.log('Admin seeded');
  } catch (err) {
    console.error('Seeding error:', err.message, err.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

seedDatabase();
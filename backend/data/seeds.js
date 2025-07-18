/* eslint-env node */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/room-reservation';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'your_secure_password';

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

const AdminSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  name: String,
  password: String,
  language: { type: String, default: 'ru' },
});

const Room = mongoose.model('Room', RoomSchema);
const Admin = mongoose.model('Admin', AdminSchema);

async function seedDatabase() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    if (!ADMIN_CHAT_ID || isNaN(ADMIN_CHAT_ID)) {
      throw new Error('ADMIN_CHAT_ID must be set to a valid number in .env');
    }

    await Room.deleteMany({});
    await Room.insertMany([
      {
        id: '1',
        name: { ru: 'Стандартный одноместный номер', uz: 'Standart bir kishilik xona' },
        description: {
          ru: 'Уютный одноместный номер с современными удобствами и красивым видом.',
          uz: 'Zamonaviy qulayliklar va chiroyli manzarali qulay bir kishilik xona.',
        },
        capacity: 2,
        bookings: [],
      },
      {
        id: '2',
        name: { ru: 'Двухместный номер с балконом', uz: 'Balkonli ikki kishilik xona' },
        description: {
          ru: 'Просторный номер с балконом для двоих, современными удобствами и уютной атмосферой.',
          uz: 'Ikkita kishi uchun balkonli keng xona, zamonaviy qulayliklar va qulay muhit.',
        },
        capacity: 4,
        bookings: [],
      },
      {
        id: '3',
        name: { ru: 'Семейный люкс', uz: 'Oila uchun lyuks' },
        description: {
          ru: 'Идеальный вариант для семьи: две спальни, гостиная и балкон.',
          uz: 'Oila uchun ideal variant: ikkita yotoqxona, mehmonxona va balkon.',
        },
        capacity: 6,
        bookings: [],
      },
    ]);
    console.log('Rooms seeded');

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
    console.error('Seeding error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

seedDatabase();
import mongoose from 'mongoose';
mongoose.connect('mongodb://localhost:27017/room-reservation', { useNewUrlParser: true, useUnifiedTopology: true });

const RoomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  capacity: Number,
  bookings: [String],
});
const Room = mongoose.model('Room', RoomSchema);

async function seedRooms() {
  await Room.deleteMany({});
  await Room.insertMany([
    { id: '1', name: 'Single Room', capacity: 2, bookings: [] },
    { id: '2', name: 'Double Room', capacity: 4, bookings: [] },
  ]);
  console.log('Rooms seeded');
  mongoose.connection.close();
}
seedRooms();

import bcrypt from 'bcrypt';
mongoose.connect('mongodb://localhost:27017/room-reservation', { useNewUrlParser: true, useUnifiedTopology: true });

const AdminSchema = new mongoose.Schema({
  chatId: { type: Number, required: true, unique: true },
  name: String,
  password: String,
  language: String,
});
const Admin = mongoose.model('Admin', AdminSchema);

async function seedAdmin() {
  await Admin.deleteMany({});
  const hashedPassword = await bcrypt.hash('your_secure_password', 10);
  await new Admin({
    chatId: your_admin_chat_id, // Replace with actual ADMIN_CHAT_ID
    name: 'AdminName',
    password: hashedPassword,
    language: 'ru',
  }).save();
  console.log('Admin seeded');
  mongoose.connection.close();
}
seedAdmin();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

mongoose.connect('mongodb://localhost:27017/chat-app');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));
app.use(express.static('public'));

// Register/Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  let user = await User.findOne({ username });

  if (!user) {
    return res.status(401).send('User not found');
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).send('Incorrect password');
  }

  req.session.user = user;
  res.status(200).json({ success: true });
});


// Middleware to protect routes
app.use((req, res, next) => {
  if (req.url.includes('chat.html') && !req.session.user) return res.redirect('/');
  next();
});

// API to fetch messages by code
app.get('/messages/:room', async (req, res) => {
  const messages = await Message.find({ room: req.params.room });
  res.json(messages);
});

// API to delete messages
app.delete('/messages/:room', async (req, res) => {
  await Message.deleteMany({ room: req.params.room });
  res.sendStatus(200);
});

io.on('connection', (socket) => {
  socket.on('joinRoom', async ({ room, user }) => {
    socket.join(room);
    socket.room = room;
    socket.user = user;
  });

  socket.on('chatMessage', async (msg) => {
    const message = new Message({ room: socket.room, sender: socket.user, text: msg });
    await message.save();
    io.to(socket.room).emit('message', { sender: socket.user, text: msg, timestamp: message.timestamp });
  });
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const existingUser = await User.findOne({ username });
  if (existingUser) return res.status(409).send('User already exists');

  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashed });
  await user.save();
  req.session.user = user;
  res.redirect('/home.html');
});

app.delete('/messages/:room', async (req, res) => {
  await Message.deleteMany({ room: req.params.room });
  res.sendStatus(200);
});

require('dotenv').config();

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});


server.listen(3000, () => console.log('Server running at http://localhost:3000'));

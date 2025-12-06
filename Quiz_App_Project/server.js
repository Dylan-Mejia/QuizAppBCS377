// server.js
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const path = require('path');
const jwt = require('jsonwebtoken');

const User = require('./models/User');
const GameSession = require('./models/GameSession');
const { LOCAL_QUESTIONS, sampleQuestions } = require('./questions/localQuestions');
const { sampleNonRepeatingSet } = require('./utils/avoidSameSet');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // Serve HTML/CSS/JS

// Configure mongoose to not throw on connection errors
mongoose.connect(process.env.MONGO_URI, {
  connectTimeoutMS: 5000,
  socketTimeoutMS: 5000
}).catch(err => {
  console.error('MongoDB connection error:', err.message);
});

// ERROR HANDLER HELPER - MUST COME BEFORE ROUTES
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// JWT helpers
function signToken(user) {
  return jwt.sign({ uid: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const token = req.cookies['token'];
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.uid = payload.uid;
    next();
  } catch {
    res.status(401).json({ error: 'unauthenticated' });
  }
}

// AUTH
app.post('/api/auth/signup', asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, displayName, recentPlayedSets: [] });
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ email, displayName });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const bcrypt = require('bcryptjs');
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ email: user.email, displayName: user.displayName });
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.uid);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json({ email: user.email, displayName: user.displayName });
}));

// GAME: start
app.post('/api/game/start', auth, asyncHandler(async (req, res) => {
  const { numQuestions = 10, source = 'local', category } = req.body;
  const user = await User.findById(req.uid);
  if (!user) return res.status(404).json({ error: 'user not found' });

  let questions = [];
  if (source === 'local') {
    const lastSet = user.recentPlayedSets.find(s => s.source === 'local');
    const lastIds = lastSet ? lastSet.questionIds : null;
    questions = await sampleNonRepeatingSet(sampleQuestions, numQuestions, lastIds);
  } else if (source === 'opentdb') {
    // Later phase: fetch from OpenTDB
    // const url = `https://opentdb.com/api.php?amount=${numQuestions}${category ? `&category=${category}` : ''}&type=multiple`;
    // const data = await fetch(url).then(r => r.json());
    // questions = normalizeOpenTDB(data.results); // implement normalization
    return res.status(501).json({ error: 'OpenTDB not implemented yet' });
  }

  const session = await GameSession.create({
    userId: user._id,
    source,
    questionIds: questions.map(q => q.id),
    answers: [],
    numQuestions
  });

  res.json({ gameSessionId: session._id.toString(), questions });
}));

// GAME: answer
app.post('/api/game/answer', auth, asyncHandler(async (req, res) => {
  const { gameSessionId, questionId, selectedAnswer } = req.body;
  const session = await GameSession.findById(gameSessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const q = LOCAL_QUESTIONS.find(q => q.id === questionId);
  if (!q) return res.status(404).json({ error: 'question not found' });

  const isCorrect = selectedAnswer === q.answer;
  session.answers.push({
    questionId,
    correctAnswer: q.answer,
    selectedAnswer,
    isCorrect
  });
  await session.save();
  res.json({ isCorrect });
}));

// GAME: finish
app.post('/api/game/finish', auth, asyncHandler(async (req, res) => {
  const { gameSessionId } = req.body;
  const session = await GameSession.findById(gameSessionId);
  if (!session) return res.status(404).json({ error: 'session not found' });

  const score = session.answers.filter(a => a.isCorrect).length;
  session.score = score;
  session.finishedAt = new Date();

  // Duration (optional)
  session.durationMs = session.finishedAt - session.startedAt;
  await session.save();

  // Save recent set to user to avoid repetition
  const user = await User.findById(session.userId);
  if (user) {
    const setRecord = {
      source: session.source,
      questionIds: session.questionIds,
      playedAt: new Date()
    };
    // Keep only last 5 sets
    user.recentPlayedSets = [setRecord, ...user.recentPlayedSets].slice(0, 5);
    await user.save();
  }

  res.json({ score, numQuestions: session.numQuestions });
}));

app.get('/api/game/session/:id', auth, asyncHandler(async (req, res) => {
  const session = await GameSession.findById(req.params.id);
  if (!session) return res.status(404).json({ error: 'not found' });
  res.json(session);
}));

// Profile
app.get('/api/user/history', auth, asyncHandler(async (req, res) => {
  const sessions = await GameSession.find({ userId: req.uid }).sort({ startedAt: -1 }).limit(20);
  res.json(sessions);
}));

// Leaderboard (top 10 by score, latest first tie-break)
app.get('/api/leaderboard', asyncHandler(async (req, res) => {
  const sessions = await GameSession.find({ score: { $ne: null } })
    .sort({ score: -1, finishedAt: -1 })
    .limit(10)
    .populate('userId', 'displayName');
  const leaderboard = sessions.map(s => ({
    displayName: s.userId?.displayName || 'Anonymous',
    score: s.score,
    numQuestions: s.numQuestions,
    finishedAt: s.finishedAt
  }));
  res.json(leaderboard);
}));

// ERROR HANDLER MIDDLEWARE (MUST BE LAST)
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on :${PORT}`));


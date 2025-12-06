const mongoose = require('mongoose');

const PlayedSetSchema = new mongoose.Schema({
  source: { type: String, enum: ['local', 'opentdb'], required: true },
  questionIds: [String],
  playedAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true },
  recentPlayedSets: [PlayedSetSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);


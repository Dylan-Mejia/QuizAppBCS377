const mongoose = require('mongoose');

const AnswerSchema = new mongoose.Schema({
  questionId: String,
  correctAnswer: String,
  selectedAnswer: String,
  isCorrect: Boolean
});

const GameSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  source: { type: String, enum: ['local', 'opentdb'], required: true },
  questionIds: [String],
  answers: [AnswerSchema],
  score: Number,
  numQuestions: Number,
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
  durationMs: Number
});

module.exports = mongoose.model('GameSession', GameSessionSchema);

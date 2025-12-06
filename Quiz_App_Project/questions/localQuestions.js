const fs = require('fs');
const path = require('path');

const questionsPath = path.join(__dirname, '../data/questions.json');
const raw = fs.readFileSync(questionsPath, 'utf8');
const QUESTIONS = JSON.parse(raw);

// Normalize with ids (use index as id)
const LOCAL_QUESTIONS = QUESTIONS.map((q, idx) => ({
  id: String(idx),
  question: q.question,
  options: [
    { key: 'A', text: q.A },
    { key: 'B', text: q.B },
    { key: 'C', text: q.C },
    { key: 'D', text: q.D },
  ],
  answer: q.answer // 'A'|'B'|'C'|'D'
}));

function sampleQuestions(n) {
  const indices = [...LOCAL_QUESTIONS.keys()];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, n).map(i => LOCAL_QUESTIONS[i]);
}

module.exports = { LOCAL_QUESTIONS, sampleQuestions };


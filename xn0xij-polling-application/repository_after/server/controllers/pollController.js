const { polls, voters, generatePollId, calculatePercentages } = require('../utils/pollUtils');

const createPoll = (req, res) => {
  const { question, options } = req.body;

  if (!question || question.trim() === '') {
    return res.status(400).json({ error: 'Question is required' });
  }

  if (!options || !Array.isArray(options)) {
    return res.status(400).json({ error: 'Options must be an array' });
  }

  if (options.length < 2) {
    return res.status(400).json({ error: 'Poll must have at least 2 options' });
  }

  if (options.length > 5) {
    return res.status(400).json({ error: 'Poll cannot have more than 5 options' });
  }

  for (const option of options) {
    if (!option || option.trim() === '') {
      return res.status(400).json({ error: 'Empty option strings are not allowed' });
    }
  }

  const pollId = generatePollId();
  polls[pollId] = {
    question: question.trim(),
    options: options.map(opt => opt.trim()),
    votes: new Array(options.length).fill(0)
  };

  res.status(201).json({ pollId });
};

const getPoll = (req, res) => {
  const { id } = req.params;
  const poll = polls[id];

  if (!poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  const percentages = calculatePercentages(poll.votes);

  res.json({
    question: poll.question,
    options: poll.options,
    votes: poll.votes,
    percentages
  });
};

const vote = (req, res) => {
  const { id } = req.params;
  const { optionIndex } = req.body;
  const poll = polls[id];

  if (!poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  // Get voter identifier from header or IP
  const voterId = req.headers['x-voter-id'] || req.ip || req.connection.remoteAddress;
  
  // Check if voter has already voted on this poll
  if (!voters[id]) {
    voters[id] = new Set();
  }
  
  if (voters[id].has(voterId)) {
    return res.status(403).json({ error: 'Already voted' });
  }

  if (typeof optionIndex !== 'number' || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
    return res.status(400).json({ error: 'Invalid option' });
  }

  poll.votes[optionIndex]++;
  voters[id].add(voterId);

  const percentages = calculatePercentages(poll.votes);

  res.json({
    question: poll.question,
    options: poll.options,
    votes: poll.votes,
    percentages
  });
};

const getResults = (req, res) => {
  const { id } = req.params;
  const poll = polls[id];

  if (!poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  const percentages = calculatePercentages(poll.votes);

  res.json({
    question: poll.question,
    options: poll.options,
    votes: poll.votes,
    percentages
  });
};

module.exports = { createPoll, getPoll, vote, getResults };

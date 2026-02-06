const polls = {};

const generatePollId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return polls[id] ? generatePollId() : id;
};

const calculatePercentages = (votes) => {
  const total = votes.reduce((sum, v) => sum + v, 0);
  
  if (total === 0) {
    return votes.map(() => 0);
  }

  const exactPercentages = votes.map(v => (v / total) * 100);
  const roundedPercentages = exactPercentages.map(p => Math.floor(p));
  
  let sum = roundedPercentages.reduce((a, b) => a + b, 0);
  const remainders = exactPercentages.map((p, i) => ({
    index: i,
    remainder: p - roundedPercentages[i]
  }));
  
  remainders.sort((a, b) => b.remainder - a.remainder);
  
  for (let i = 0; i < 100 - sum; i++) {
    roundedPercentages[remainders[i].index]++;
  }

  return roundedPercentages;
};

module.exports = { polls, generatePollId, calculatePercentages };

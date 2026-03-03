const PREFIX = 'op';
const OWNER_ID = process.env.OWNER_ID; // developer ID for owner‑only commands

// global pull rates (percentages, must sum to 100)
const PULL_RATES = {
  D: 40,
  C: 30,
  B: 20,
  A: 5,
  S: 3,
  SS: 1.5,
  UR: 0.5
};

// pity constants
const PITY_TARGET = 250;
// when pity is active, these are the conditional probabilities among S/SS/UR
const PITY_DISTRIBUTION = {
  S: 80,
  SS: 18,
  UR: 2
};

module.exports = {
  PREFIX,
  OWNER_ID,
  PULL_LIMIT: 7,
  PULL_RESET_HOURS: 8,
  PULL_RATES,
  PITY_TARGET,
  PITY_DISTRIBUTION
};

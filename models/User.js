const mongoose = require('mongoose');
const { Schema } = mongoose;

// schema for an owned card entry (mastery level is implied by the cardId)
const UserCardSchema = new Schema({
  cardId: { type: String, required: true },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 }
}, { _id: false });

const UserSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  pullsRemaining: { type: Number, default: 8 },
  lastReset: { type: Date, default: Date.now },
  pityCount: { type: Number, default: 0 },
  ownedCards: { type: [UserCardSchema], default: [] },
  history: { type: [String], default: [] },
  balance: { type: Number, default: 500 },
  resetTokens: { type: Number, default: 5 },
  // inventory for future shop/consumables
  items: { type: [{ itemId: String, quantity: Number }], default: [] },
  packs: { type: [{ packType: String, quantity: Number }], default: [] },
  // active team (up to 3 cardIds)
  team: { type: [String], default: [] },
  // infinite sail progress tracker
  isailProgress: { type: Number, default: 1 },
  lastIsailFail: { type: Date, default: null },
  lastIsailEnemies: { type: [String], default: [] }
});

module.exports = mongoose.model('User', UserSchema);

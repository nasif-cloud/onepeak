const User = require('../models/User');
const { cards } = require('../data/cards');

module.exports = {
  name: 'start',
  description: 'Register an account with the One Piece bot',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    let user = await User.findOne({ userId });
    if (user) {
      const reply = 'You already have an account.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Give the starter (first pullable card in dataset)
    const starter = cards.find(c => c.pullable);
    user = new User({
      userId,
      pullsRemaining: 8,
      lastReset: new Date(),
      pityCount: 0,
      ownedCards: starter ? [{ cardId: starter.id, level: 1, xp: 0 }] : [],
      history: starter ? [starter.id] : [],
      balance: 500,
      resetTokens: 5
    });
    await user.save();

    const reply = starter
      ? `Account created! You received **${starter.character}** as a starter.`
      : 'Account created! (no starter available)';
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply, ephemeral: true });
  }
};

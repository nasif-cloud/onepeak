const User = require('../models/User');
const { searchCards, findBestOwnedCard } = require('../utils/cards');
const { cards } = require('../data/cards');

module.exports = {
  name: 'upgrade',
  description: 'Upgrade one of your cards to next mastery',
  options: [{ name: 'query', type: 3, description: 'Card you own', required: true }],
  async execute({ message, interaction, args }) {
    const query = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account to upgrade cards.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const base = await findBestOwnedCard(userId, query);
    if (!base) {
      const reply = `No card found matching "${query}".`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const ownedEntry = user.ownedCards.find(e => e.cardId === base.id);
    if (!ownedEntry) {
      const reply = `You don't own **${base.character}** mastery ${base.mastery}.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    if (base.mastery >= base.mastery_total) {
      const reply = `**${base.character}** is already at maximum mastery.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // find next mastery card definition
    const next = cards.find(c => c.character === base.character && c.mastery === base.mastery + 1);
    if (!next) {
      const reply = `No higher mastery found for **${base.character}**.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // perform upgrade: remove old, add new at level1 xp0
    user.ownedCards = user.ownedCards.filter(e => e.cardId !== base.id);
    user.ownedCards.push({ cardId: next.id, level: 1, xp: 0 });
    if (!user.history.includes(next.id)) user.history.push(next.id);
    await user.save();

    const reply = `Upgraded **${base.character}** from mastery ${base.mastery} -> ${next.mastery}.`;
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  }
};
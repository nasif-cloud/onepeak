const User = require('../models/User');
const { cards } = require('../data/cards');

module.exports = {
  name: 'autoteam',
  description: 'Automatically choose your best active team (max 3 cards)',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const ownedDefs = (user.ownedCards || [])
      .map(e => cards.find(c => c.id === e.cardId))
      .filter(c => c);

    // filter out boost cards
    let eligibles = ownedDefs.filter(c => c.type !== 'Boost');
    if (eligibles.length === 0) {
      const reply = 'You don\'t have any combat/tank/special cards to form a team.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // sort by raw power descending
    eligibles.sort((a, b) => b.power - a.power);

    // ensure at least one tank if user owns any tanks
    const tanks = eligibles.filter(c => c.type === 'Tank');
    if (tanks.length && !eligibles.slice(0, 3).some(c => c.type === 'Tank')) {
      const bestTank = tanks.sort((a, b) => b.power - a.power)[0];
      // remove existing instance & push back into slice
      eligibles = eligibles.filter(c => c.id !== bestTank.id);
      eligibles.splice(2, 0, bestTank);
    }

    const selected = eligibles.slice(0, 3);
    user.team = selected.map(c => c.id);
    await user.save();

    const reply = 'Your team has been set to the strongest possible cards!';
    if (message) return message.reply(reply);
    return interaction.reply({ content: reply });
  }
};

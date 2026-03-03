const { EmbedBuilder } = require('discord.js');
const { searchCards, findBestOwnedCard } = require('../utils/cards');
const User = require('../models/User');

module.exports = {
  name: 'info',
  description: 'Show ownership and history of a card',
  options: [{ name: 'query', type: 3, description: 'Card name', required: true }],
  async execute({ message, interaction, args }) {
    const query = message ? args.join(' ') : interaction.options.getString('query');
    const userId = message ? message.author.id : interaction.user.id;
    
    const cardDef = await findBestOwnedCard(userId, query);
    if (!cardDef) {
      const reply = `No card found matching "${query}".`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    let userEntry = null;
    let userDoc = null;
    if (message || interaction) {
      const user = await User.findOne({ userId });
      if (user) {
        userDoc = user;
        userEntry = user.ownedCards.find(e => e.cardId === cardDef.id) || null;
      }
    }

    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();
    const { buildCardEmbed } = require('../utils/cards');
    const embed = buildCardEmbed(cardDef, userEntry, avatarUrl, userDoc);

    // ownership is already shown inside the card embed via the 'Owned' field

    // include mastery navigation buttons (same as card view)
    const cardCmd = require('./card');
    const components = [cardCmd.makeComponents(cardDef)];

    if (message) return message.channel.send({ embeds: [embed], components });
    return interaction.reply({ embeds: [embed], components });
  }
};
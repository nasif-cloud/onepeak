const User = require('../models/User');
const { cards } = require('../data/cards');
const { EmbedBuilder } = require('discord.js');
const { rods } = require('../data/rods');
const { applyDefaultEmbedStyle } = require('../utils/embedStyle');

module.exports = {
  name: 'start',
  description: 'Register an account with the One Piece bot',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    let user = await User.findOne({ userId });
    if (user) {
      const reply = 'You already have an account.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Give the starter (first pullable card in dataset)
    const starter = cards.find(c => c.pullable);
    const basicRod = rods.find(r => r.id === 'basic_rod');
    user = new User({
      userId,
      pullsRemaining: 8,
      lastReset: new Date(),
      pityCount: 0,
      ownedCards: starter ? [{ cardId: starter.id, level: 1, xp: 0 }] : [],
      history: starter ? [starter.id] : [],
      balance: 500,
      resetTokens: 5,
      currentRod: 'basic_rod'
    });
    await user.save();

    const embed = new EmbedBuilder()
      .setTitle('Account Created!')
      .setDescription(
        `You received **${starter.character}** as a starter.\n\nYou also received ${basicRod.emoji} **${basicRod.name}** for fishing!`
      );
    applyDefaultEmbedStyle(embed, discordUser);

    if (message) return message.reply({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};

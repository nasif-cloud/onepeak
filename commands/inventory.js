const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const { levelers } = require('../data/levelers');
const { rods } = require('../data/rods');

module.exports = {
  name: 'inventory',
  description: 'Show your items and packs',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const username = message ? message.author.username : interaction.user.username;
    const avatarUrl = message ? message.author.displayAvatarURL() : interaction.user.displayAvatarURL();

    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `op start` or /start to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Get current rod for items display
    const currentRod = rods.find(r => r.id === user.currentRod);
    const rodDisplay = currentRod ? `${currentRod.emoji} ${currentRod.name}` : '❓ Unknown Rod';
    
    // Build items with rod at top (no x1 for rod)
    let itemsList = currentRod ? `${currentRod.emoji} ${currentRod.name}` : '';
    const levelerItems = (user.items || []).map(i => {
      const leveler = levelers.find(l => l.id === i.itemId);
      return leveler ? `${leveler.emoji} ${leveler.name} x${i.quantity}` : `${i.itemId} x${i.quantity}`;
    }).join('\n');
    itemsList = itemsList ? itemsList + (levelerItems ? '\n' + levelerItems : '') : levelerItems || 'None';
    
    const packsObj = user.packInventory || {};
    const packs = Object.keys(packsObj).length
      ? Object.entries(packsObj).map(([name, qty]) => `${name} x${qty}`).join('\n')
      : 'None';

    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle(`${username}'s Inventory`)
      .setThumbnail(avatarUrl)
      .addFields(
        { name: 'Items', value: itemsList, inline: false },
        { name: 'Packs', value: packs, inline: false }
      );

    if (message) return message.channel.send({ embeds: [embed] });
    return interaction.reply({ embeds: [embed] });
  }
};

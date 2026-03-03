const User = require('../models/User');
const { cards } = require('../data/cards');
const { OWNER_ID } = require('../config');

function parseMention(mention) {
  if (!mention) return null;
  const m = mention.match(/^<@!?(\d+)>$/);
  return m ? m[1] : null;
}

async function list({ message }) {
  if (message.author.id !== OWNER_ID) {
    return message.reply('You are not permitted to run owner commands.');
  }

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setTitle('Owner Commands')
    .setColor(0xFF0000)
    .setDescription('Available prefix commands for the bot owner/developer')
    .addFields(
      { name: 'op owner give <type> <amount> <@user>', value: 'Types: beli, resettoken, card\nif type is card then <amount> should be the cardId', inline: false },
      { name: 'op owner resetdata <@user>', value: 'Deletes the user record so they must /start again', inline: false },
      { name: 'op ownerlist', value: 'Show this list', inline: false }
    );
  return message.channel.send({ embeds: [embed] });
}

async function execute({ message, args }) {
  if (message.author.id !== OWNER_ID) {
    return message.reply('You are not permitted to run owner commands.');
  }

  const sub = args[0];
  if (!sub) {
    return message.reply('Usage: op owner <give|resetdata> ...');
  }

  if (sub === 'give') {
    const type = args[1];
    const amountArg = args[2];
    const mention = args[3];
    const targetId = parseMention(mention);
    if (!type || !amountArg || !targetId) {
      return message.reply('Usage: op owner give <type> <amount> <@user>');
    }

    let target = await User.findOne({ userId: targetId });
    if (!target) {
      return message.reply('Target user does not have an account.');
    }

    if (type === 'beli') {
      const amt = parseInt(amountArg, 10);
      if (isNaN(amt)) return message.reply('Amount must be a number');
      await User.findOneAndUpdate({ userId: targetId }, { $inc: { balance: amt } });
      return message.reply(`Given ¥${amt} to <@${targetId}>`);
    }

    if (type === 'resettoken') {
      const amt = parseInt(amountArg, 10);
      if (isNaN(amt)) return message.reply('Amount must be a number');
      await User.findOneAndUpdate({ userId: targetId }, { $inc: { resetTokens: amt } });
      return message.reply(`Given ${amt} reset token(s) to <@${targetId}>`);
    }

    if (type === 'card') {
      const cardId = amountArg;
      // check existence
      const cardDef = cards.find(c => c.id === cardId);
      if (!cardDef) return message.reply(`No card with id ${cardId} exists`);
      // check ownership first
      if (target.ownedCards.some(e => e.cardId === cardId)) {
        return message.reply('User already owns that card, gift cancelled.');
      }
      target.ownedCards.push({ cardId, level: 1, xp: 0 });
      if (!target.history.includes(cardId)) target.history.push(cardId);
      await target.save();
      return message.reply(`Added card ${cardId} to <@${targetId}>'s collection`);
    }

    return message.reply('Unknown give type; valid types are beli, resettoken, card');
  }

  if (sub === 'resetdata') {
    const mention = args[1];
    const targetId = parseMention(mention);
    if (!targetId) return message.reply('Usage: op owner resetdata <@user>');

    await User.deleteOne({ userId: targetId });
    return message.reply(`Deleted data for <@${targetId}>`);
  }

  return message.reply('Unrecognized owner subcommand.');
}

module.exports = { list, execute };

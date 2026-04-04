const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { levelers } = require('../data/levelers');
const { cards } = require('../data/cards');
const { rods } = require('../data/rods');
const { applyDefaultEmbedStyle } = require('../utils/embedStyle');

// Map to store fishing state per user
const fishingStates = new Map();

module.exports = {
  name: 'fish',
  description: 'Go fishing for levelers and cards',
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    const discordUser = message ? message.author : interaction.user;
    const user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You don\'t have an account. Run `/start` to register.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Check cooldown
    if (user.lastFishFail && Date.now() - user.lastFishFail.getTime() < 10000) {
      const remaining = Math.ceil((10000 - (Date.now() - user.lastFishFail.getTime())) / 1000);
      const reply = `You scared the fish away! Wait ${remaining} seconds before fishing again.`;
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // Interactive version for both message and slash commands
    const currentRodData = rods.find(r => r.id === user.currentRod);
    const embed = new EmbedBuilder()
      .setTitle(null)
      .setDescription('**Waiting for a nibble...**');
    if (currentRodData && currentRodData.thumbnail) {
      embed.setThumbnail(currentRodData.thumbnail);
    }
    applyDefaultEmbedStyle(embed, discordUser);

    let replyMsg;
    if (message) {
      replyMsg = await message.reply({ embeds: [embed], components: [] });
    } else {
      await interaction.reply({ embeds: [embed], components: [] });
      replyMsg = null;
    }

    // Random delay 1-10 seconds
    const delay = Math.random() * 9000 + 1000;
    setTimeout(async () => {
      // Check if still valid
      if (!message && !interaction.replied) return;

      // Start the progress bar
      let position = 0;
      const barLength = 8;
      const updateBar = () => {
        const bar = Array(barLength).fill('□');
        bar[position] = '■';
        bar[3] = position === 3 ? '◉' : '◯'; // Mark center filled when matched
        return bar.join('');
      };

      const embed2 = new EmbedBuilder()
        .setTitle(null)
        .setDescription(`**Catch it!**\n\nProgress: ${updateBar()}\n\nAim for the center (◉)! Click the button when the ■ is on the ◉ for the best catch!`);
      
      // Get user's rod and set thumbnail
      const currentRodData2 = rods.find(r => r.id === user.currentRod);
      if (currentRodData2 && currentRodData2.thumbnail) {
        embed2.setThumbnail(currentRodData2.thumbnail);
      }
      applyDefaultEmbedStyle(embed2, discordUser);

      const button = new ButtonBuilder()
        .setCustomId(`fish_catch:${userId}`)
        .setLabel('Reel In!')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      if (message) {
        await replyMsg.edit({ embeds: [embed2], components: [row] });
      } else {
        await interaction.editReply({ embeds: [embed2], components: [row] });
      }

      // Start moving the tick
      const interval = setInterval(async () => {
        position = (position + 1) % barLength;
        const newBar = Array(barLength).fill('□');
        newBar[position] = '■';
        newBar[3] = position === 3 ? '◉' : '◯'; // Mark center filled when matched
        embed2.setDescription(`Progress: ${newBar.join('')}\n\nAim for the center (◉)! Click the button when the ■ is on the ◉ for the best catch!`);
        try {
          if (message) {
            await replyMsg.edit({ embeds: [embed2], components: [row] });
          } else {
            await interaction.editReply({ embeds: [embed2], components: [row] });
          }
        } catch (e) {
          // Message might be deleted or something
          clearInterval(interval);
          fishingStates.delete(userId);
        }
      }, Math.random() * 1500 + 1500); // 1.5 to 3 seconds

      // Store additional info for message-based commands
      fishingStates.set(userId, { 
        interval, 
        position: () => position, 
        clear: () => clearInterval(interval),
        message: replyMsg,
        interaction: interaction
      });
    }, delay);
  },

  // Function to handle the catch
  async handleCatch(interaction, userId) {
    const state = fishingStates.get(userId);
    if (!state) return;

    state.clear();
    fishingStates.delete(userId);

    // Fetch user once for the whole function
    const user = await User.findOne({ userId });

    const position = state.position();
    const distance = Math.abs(position - 3); // Center is 3 for 8 positions

    let outcome;
    let luckModifier = 1;
    if (distance === 0) {
      outcome = 'Perfect catch!';
      luckModifier = 1.3;
    } else if (distance === 1) {
      outcome = 'Good catch!';
    } else {
      outcome = 'The fish got away!';
      // Set cooldown
      await User.findOneAndUpdate({ userId }, { lastFishFail: new Date() });
    }

    const embed = new EmbedBuilder()
      .setTitle(null)
      .setDescription(`${outcome}`);
    applyDefaultEmbedStyle(embed, interaction.user);

    // Get user's rod and set thumbnail
    const currentRodData = rods.find(r => r.id === user.currentRod);
    if (currentRodData && currentRodData.thumbnail) {
      embed.setThumbnail(currentRodData.thumbnail);
    }

    if (outcome === 'The fish got away!') {
      return interaction.update({ embeds: [embed], components: [] });
    }

    // Determine number of items based on rod and catch quality
    let itemCount = 1;
    const currentRodId = user.currentRod;
    if (currentRodId === 'gold_rod') {
      // Gold rod: 50% of 2 items, 10% of 3 items
      const rand = Math.random();
      if (rand < 0.1) itemCount = 3;
      else if (rand < 0.6) itemCount = 2;
    } else if (currentRodId === 'white_rod') {
      // White rod: 100% of 2 items, 30% of 3 items
      const rand = Math.random();
      if (rand < 0.3) itemCount = 3;
      else itemCount = 2;
    }

    // Determine loot
    const isCard = Math.random() < 0.1; // 10% chance for card
    const lootLines = [];

    if (isCard) {
      // Pull only U1 cards
      const cardKeys = Object.keys(cards).filter(key => {
        const card = cards[key];
        return card.mastery === 1; // Only U1 cards
      });
      
      if (cardKeys.length > 0) {
        const randomKey = cardKeys[Math.floor(Math.random() * cardKeys.length)];
        const card = cards[randomKey];
        
        // Check if user owns U2 or U3
        let targetCardId = randomKey;
        let targetMastery = 1;
        
        // Look for higher mastery versions
        for (let i = 2; i <= 4; i++) {
          const higherCard = Object.keys(cards).find(k => {
            const c = cards[k];
            return c.character === card.character && c.mastery === i;
          });
          if (higherCard && user.ownedCards.some(oc => oc.cardId === higherCard)) {
            targetCardId = higherCard;
            targetMastery = i;
          }
        }
        
        const targetCard = cards[targetCardId];
        const emoji = targetCard.emoji || '🃏';
        lootLines.push(`${emoji} ${targetCard.character} (U${targetMastery})`);
        
        // Add to ownedCards or update existing
        const existing = user.ownedCards.find(c => c.cardId === targetCardId);
        if (existing) {
          existing.level = Math.max(existing.level, 1);
        } else {
          user.ownedCards.push({ cardId: targetCardId, level: 1, xp: 0 });
        }
      }
    } else {
      // Add multiple levelers based on rod
      for (let i = 0; i < itemCount; i++) {
        const randomLeveler = levelers[Math.floor(Math.random() * levelers.length)];
        lootLines.push(`${randomLeveler.emoji} ${randomLeveler.name}`);
        
        // Add to items
        const existingItem = user.items.find(it => it.itemId === randomLeveler.id);
        if (existingItem) {
          existingItem.quantity += 1;
        } else {
          user.items.push({ itemId: randomLeveler.id, quantity: 1 });
        }
      }
    }

    embed.addFields({ name: 'Loot', value: lootLines.join('\n') });
    await user.save();

    return interaction.update({ embeds: [embed], components: [] });
  }
};
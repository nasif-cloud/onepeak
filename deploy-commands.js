require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');

const commands = [];
// core commands
commands.push({ name: 'start', description: 'Register an account with the One Piece bot' });
commands.push({ name: 'pull', description: 'Pull a random card (uses 1 pull)' });
commands.push({
  name: 'info',
  description: 'Show ownership info for a card',
  options: [{ name: 'query', type: 3, description: 'Partial or full card name', required: true }]
});
commands.push({
  name: 'upgrade',
  description: 'Upgrade one of your cards to the next mastery',
  options: [{ name: 'query', type: 3, description: 'Card you own (name)', required: true }]
});

// balance command
commands.push({ name: 'balance', description: "Show your current Beli and reset tokens" });

// team management (view/add/remove) - active team limited to 3 cards
commands.push({
  name: 'team',
  description: 'Manage your active team',
  options: [
    { name: 'view', type: 1, description: 'View your current team' },
    { name: 'add', type: 1, description: 'Add a card to your team', options: [{ name: 'query', type: 3, description: 'Card name', required: true }] },
    { name: 'remove', type: 1, description: 'Remove a card from your team', options: [{ name: 'query', type: 3, description: 'Card name', required: true }] }
  ]
});

// inventory lookup
commands.push({ name: 'inventory', description: 'Show your items and packs' });

// autoteam command
commands.push({ name: 'autoteam', description: 'Automatically set your team to top 3 cards' });
// infinite sail battle
commands.push({ name: 'isail', description: 'Challenge the Infinite Sail' });

const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const rest = new REST({ version: '10' }).setToken(token);

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // dev guild

async function deploy() {
  try {
    if (!clientId || !guildId) return console.log('CLIENT_ID and GUILD_ID must be set in .env');
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

deploy();

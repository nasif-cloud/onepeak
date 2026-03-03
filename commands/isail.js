// I changed the title, keep it that way. the enrgy icon is: <:energy:1478051414558118052>

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const { cards: cardDefs } = require('../data/cards');
const marines = require('../data/marines');
// stats computations (level & boosts) are resolved via a shared helper
// so that `info` and `isail` always produce identical values.
const { resolveStats } = require('../utils/statResolver');



function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// status emoji mapping
const STATUS_EMOJIS = {
  stun: '🌀',
  freeze: '❄️',
  cut: '🔪',
  bleed: '🩸'
};

// apply a status effect to an entity (card or marine)
function addStatus(entity, type, duration) {
  if (!entity.status) entity.status = [];
  entity.status.push({ type, remaining: duration });
}

// at the beginning of a user turn, apply cut effects and decrement durations
function applyStartOfTurnEffects(state) {
  state.cards.forEach(c => {
    if (!c.status) return;
    c.status = c.status.filter(st => {
      if (st.type === 'cut') {
        c.currentHP = Math.max(0, c.currentHP - 1);
        appendLog(state, `${c.def.character} suffers cut for -1 HP!`);
      }
      st.remaining -= 1;
      return st.remaining > 0;
    });
  });
}

// when a card with an effect hits a target, apply it
function applyCardEffect(attacker, target, state) {
  const def = attacker.def;
  if (!def.effect) return;
  const dur = def.effectDuration || 1;
  switch (def.effect) {
    case 'stun':
      addStatus(target, 'stun', dur);
      appendLog(state, `${target.rank || target.def?.character || 'Enemy'} is stunned!`);
      break;
    case 'freeze':
      addStatus(target, 'freeze', dur);
      appendLog(state, `${target.rank || target.def?.character || 'Enemy'} is frozen!`);
      break;
    case 'cut':
      addStatus(target, 'cut', dur);
      appendLog(state, `${target.rank || target.def?.character || 'Enemy'} is cut!`);
      break;
    case 'bleed':
      addStatus(target, 'bleed', dur);
      appendLog(state, `${target.rank || target.def?.character || 'Enemy'} is bleeding!`);
      break;
    case 'team_stun':
      // target is expected to be array of enemies
      if (Array.isArray(target)) {
        target.forEach(t => {
          addStatus(t, 'stun', dur);
        });
        appendLog(state, `All enemies are stunned!`);
      }
      break;
  }
}


// compute damage for a card action (attack or special)
function calculateUserDamage(card, type, user) {
  // Use the resolved `scaled` stats prepared at battle start; do not
  // re-query card definitions or ownedCards inside the main loop.
  const scaled = card.scaled || {};

  if (type === 'special') {
    if (card.def.special_attack && scaled.special_attack) {
      const min = scaled.special_attack.min;
      const max = scaled.special_attack.max;
      // ensure min<=max
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      const dmg = randomInt(low, high);
      return dmg < low ? low : dmg;
    }
    if (scaled.attack_min != null && scaled.attack_max != null) {
      const low = Math.min(scaled.attack_min, scaled.attack_max);
      const high = Math.max(scaled.attack_min, scaled.attack_max);
      return randomInt(low, high);
    }
    return 0;
  }
  if (scaled.attack_min != null && scaled.attack_max != null) {
    const low = Math.min(scaled.attack_min, scaled.attack_max);
    const high = Math.max(scaled.attack_min, scaled.attack_max);
    return randomInt(low, high);
  }
  return 0;
}


// map for card-type emojis (same as team command)
const TYPE_EMOJIS = {
  Combat: '<:combat:1478019288668438528>',
  Tank: '<:tank:1478019541580648539>',
  Special: '<:special:1478020172496506932>'
};

// key: message.id -> state object
const battleStates = new Map();

const OWNER_ID = process.env.OWNER_ID;

function hpBar(current, max) {
  if (max <= 0) return '';
  const segments = 10;
  const filled = Math.round((current / max) * segments);
  const empty = segments - filled;
  return '▬'.repeat(filled) + '▭'.repeat(empty);
}

function energyDisplay(energy) {
  if (energy <= 0) return '0';
  return '<:energy:1478051414558118052>'.repeat(energy);
}

// return an array of marine objects for the given progress level
function getMarinesForLevel(stage, prevRanks = []) {
  const maxIdx = marines.length - 1;
  // determine count range by stage (keeps encounter sizes reasonable)
  let minCount = 1, maxCount = 1;
  if (stage <= 5) { minCount = maxCount = 1; }
  else if (stage <= 15) { minCount = 1; maxCount = 2; }
  else { minCount = 2; maxCount = 3; }

  // HP target benchmarks (keeps difficulty scaling similar to prior logic)
  let targetHP;
  if (stage <= 10) targetHP = 30;
  else if (stage <= 20) targetHP = 80;
  else targetHP = 150;

  // allow higher rank pool as stage increases
  const rankMaxIdx = Math.min(maxIdx, Math.floor(stage / 2) + 1);

  // point budget system: stage * 5 points to "buy" marines
  const budget = Math.max(1, Math.floor(stage * 5));

  // cost function: higher-rank marines cost more (index+1)
  const costFor = (idx) => idx + 1;

  let best = null;
  for (let t = 0; t < 400; t++) {
    const count = randomInt(minCount, maxCount);
    const group = [];
    let remaining = budget;
    let attempts = 0;
    while (group.length < count && attempts < 30) {
      attempts++;
      const idx = randomInt(0, rankMaxIdx);
      const c = marines[idx];
      const cost = costFor(idx);
      if (cost > remaining) continue;
      group.push({ rank: c.rank, speed: c.speed, atk: c.atk, maxHP: c.hp, currentHP: c.hp, status: [] });
      remaining -= cost;
    }
    if (!group.length) continue;

    const totalHP = group.reduce((sum, m) => sum + m.maxHP, 0);
    const score = Math.abs(totalHP - targetHP) + remaining; // prefer using budget and matching HP

    // skip if the rank list matches previous exactly (order ignored)
    const ranks = group.map(m => m.rank).sort().join(',');
    const prevKey = prevRanks.slice().sort().join(',');
    if (prevKey && ranks === prevKey) continue;

    if (!best || score < best.score) {
      best = { group, score };
      if (score === 0) break;
    }
  }

  return best ? best.group : [];
}

function buildEmbed(state, user) {
  // Ensure the battle uses the pre-resolved stats prepared at start.
  // `state.cards` already contains a `scaled` object created from the DB
  // instance via `resolveStats`. Just clamp currentHP to the resolved max.
  state.cards.forEach(c => {
    if (!c.scaled) return;
    const oldMax = c.maxHP;
    c.maxHP = c.scaled.health;
    if (c.currentHP > c.maxHP) c.currentHP = c.maxHP;
  });

  const embed = new EmbedBuilder()
    .setColor('#EEEEEE')
    .setTitle('Adventure: Infinite Sailing')
    .setDescription(`Progress: Level ${user.isailProgress}`);
  // set any image override (special attack gif) or default art
  if (state.embedImage) {
    embed.setImage(state.embedImage);
  }

  // enemy marines
  const marineLines = state.marines.map((m, i) =>
    `${i + 1}. ${m.rank} ${hpBar(m.currentHP, m.maxHP)} (${m.currentHP}/${m.maxHP})`
  );
  embed.addFields({ name: 'Enemy Marines', value: marineLines.join('\n') });

  // cards field
  const lines = state.cards.map((c, i) => {
    // show status emoji in place of rank/type if present
    let prefix = '';
    if (c.status && c.status.length) {
      const emoji = STATUS_EMOJIS[c.status[0].type] || '';
      prefix = `${emoji} `;
    } else {
      const rankText = c.def.rank ? `(${c.def.rank}) ` : '';
      prefix = rankText + (TYPE_EMOJIS[c.def.type] || '');
    }
    let line = `${i + 1}. ${prefix}${c.def.character} ${hpBar(c.currentHP, c.maxHP)} (${c.currentHP}/${c.maxHP}) ${energyDisplay(c.energy)}`;
    if (!c.alive) line += ' — **KO**';
    if (state.selected === i) line = `**> ${line}**`;
    return line;
  });
  embed.addFields({ name: 'Your Crew', value: lines.join('\n') });

  // action columns
  if (state.lastUserAction || state.lastMarineAction) {
    embed.addFields(
      { name: 'Your Action', value: state.lastUserAction || '—', inline: true },
      { name: 'Marine Action', value: state.lastMarineAction || '—', inline: true }
    );
  }

  // generic log/messages
  if (state.log) {
    embed.addFields({ name: 'Battle Log', value: state.log });
  }

  return embed;
}

function makeSelectionRow(state) {
  const row = new ActionRowBuilder();
  state.cards.forEach((c, i) => {
    const disabled = !c.alive || state.turn !== 'user' || c.energy === 0 || !!state.awaitingTarget;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`isail_select:${i}`)
        .setLabel(c.def.character)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    );
  });
  return row;
}

function makeActionRow(state) {
  if (state.selected === null || state.awaitingTarget) return null;
  const card = state.cards[state.selected];
  const row = new ActionRowBuilder();
  // Attack
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('isail_action:attack')
      .setLabel('Attack')
      .setStyle(ButtonStyle.Primary)
  );
  // Special Attack (only if definition provides one and energy is available)
  if (card.def.special_attack && card.energy >= 3) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('isail_action:special')
        .setLabel('Special Attack')
        .setStyle(ButtonStyle.Primary)
    );
  }
  // Special ability (only actual Special-type cards have abilities)
  if (card.def.type === 'Special') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('isail_action:ability')
        .setLabel('Special Ability')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  // Forfeit
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('isail_action:forfeit')
      .setLabel('Forfeit')
      .setStyle(ButtonStyle.Danger)
  );
  return row;
}

async function updateBattleMessage(msg, state, user) {
  const embed = buildEmbed(state, user);
  const components = [makeSelectionRow(state)];
  if (state.awaitingTarget) {
    const targetRow = makeTargetRow(state);
    if (targetRow) components.push(targetRow);
  } else {
    const actionRow = makeActionRow(state);
    if (actionRow) components.push(actionRow);
  }
  // disable everything if finished
  if (state.finished) {
    components.forEach(r => r.components.forEach(b => b.setDisabled(true)));
    // add next isail button if victory
    if (state.victory) {
      const nextIsailRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('isail_next')
          .setLabel('Next Isail')
          .setStyle(ButtonStyle.Success)
      );
      components.push(nextIsailRow);
    }
  }
  await msg.edit({ embeds: [embed], components });
  // manage inactivity timer
  if (state.finished) {
    clearBattleTimeout(state);
  } else {
    setupTimeout(state, msg, user);
  }
}

function checkForDefeat(state) {
  return state.cards.every(c => !c.alive);
}

function makeTargetRow(state) {
  if (!state.awaitingTarget) return null;
  const row = new ActionRowBuilder();
  state.marines.forEach((m, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`isail_target:${i}`)
        .setLabel(`Enemy ${i + 1}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(m.currentHP <= 0)
    );
  });
  return row;
}

function rechargeEnergy(state) {
  state.cards.forEach(c => {
    if (!c.usedLastTurn && c.alive && c.energy < 3) {
      c.energy++;
    }
    // reset used flag for next round
    c.usedLastTurn = false;
  });
}

function marineAttack(state) {
  // each marine takes its turn
  const logs = [];
  state.marines.forEach(marine => {
    if (marine.currentHP <= 0) return;
    // choose target card (tank priority)
    let target = null;
    const tanks = state.cards.filter(c => c.alive && c.def.type === 'Tank');
    if (tanks.length) target = tanks[0];
    else {
      const alive = state.cards.filter(c => c.alive);
      if (alive.length) target = alive[Math.floor(Math.random() * alive.length)];
    }
    if (!target) return;
    const dmg = marine.atk;
    target.currentHP -= dmg;
    if (target.currentHP <= 0) {
      target.currentHP = 0;
      target.alive = false;
      target.energy = 0;
    }
    logs.push(`${marine.rank} attacked ${target.def.character} for ${dmg} damage!`);
  });
  state.lastMarineAction = logs.join('\n');
  state.turn = 'user';
}

function maybeSkipUserTurn(state) {
  if (state.turn !== 'user') return false;
  const available = state.cards.some(c => c.alive && c.energy > 0);
  if (!available) {
    // recharge and let marine attack
    rechargeEnergy(state);
    appendLog(state, 'No energy left; crew is recharging.');
    state.turn = 'marine';
    return true;
  }
  return false;
}

async function finalizeUserAction(state, msg, interaction) {
  // after resolving user action we continue on to marine turn; embedImage
  // should stay set until after the marine action update so it appears on the
  // same embed with both log lines.

  // victory if all marines are dead
  if (state.marines.every(m => m.currentHP <= 0)) {
    const user = await User.findOne({ userId: state.userId });
    await handleVictory(state, msg, user);
    battleStates.delete(msg.id);
    return true; // finished
  }

  // recharge and give turn to marine
  rechargeEnergy(state);
  state.turn = 'marine';
  state.selected = null;

  // marine takes a swing
  marineAttack(state);
  // check if all cards died
  if (checkForDefeat(state)) {
    const user = await User.findOne({ userId: state.userId });
    await handleDefeat(state, msg, user);
    battleStates.delete(msg.id);
    return true;
  }

  // back to the user – update now will show both user action and marine action
  const user = await User.findOne({ userId: state.userId });
  // apply cut effects at start of owner's turn
  applyStartOfTurnEffects(state);
  await updateBattleMessage(msg, state, user);

  // clear embed image afterwards so the next turn is blank
  state.embedImage = null;

  // if energy still zero this will auto-skip again
  await runSkipCycle(state, msg, user);
  return false;
}

async function runSkipCycle(state, msg, user) {
  // loop until either it's the user's turn with available energy or battle finishes
  while (!state.finished && state.turn === 'user') {
    if (maybeSkipUserTurn(state)) {
      // perform marine attack now that we've switched to marine
      marineAttack(state);
      if (checkForDefeat(state)) {
        await handleDefeat(state, msg, user);
        battleStates.delete(msg.id);
        return false; // battle ended
      }
      state.turn = 'user';
      await updateBattleMessage(msg, state, user);
      // continue to check again
      continue;
    }
    break;
  }
  return !state.finished;
}

async function handleVictory(state, msg, user) {
  clearBattleTimeout(state);
  // calculate rewards
  let belis = 0;
  const lvl = user.isailProgress;
  if (lvl <= 10) belis = randomInt(10, 100);
  else if (lvl <= 20) belis = randomInt(30, 150);
  else if (lvl <= 30) {
    belis = randomInt(50, 300);
    if (Math.random() < 0.10) {
      user.resetTokens = (user.resetTokens || 0) + 1;
      appendLog(state, 'You also found a **Reset Token**!');
    }
  }
  user.balance = (user.balance || 0) + belis;
  user.isailProgress = (user.isailProgress || 1) + 1;
  // store last enemy ranks to avoid repeat on next run
  state.marines && (user.lastIsailEnemies = state.marines.map(m => m.rank));

  // ===== XP & level-up handling =====
  // give each of the three active team members XP and handle level ups.
  const xpGain = 30;
  const levelUpLines = [];
  if (Array.isArray(user.team)) {
    user.team.slice(0, 3).forEach(cardId => {
      if (!cardId) return;
      // find the matching owned card entry; if missing create a placeholder.
      let entry = (user.ownedCards || []).find(e => e.cardId === cardId);
      if (!entry) {
        entry = { cardId, level: 1, xp: 0 };
        user.ownedCards = user.ownedCards || [];
        user.ownedCards.push(entry);
      }
      const prevLevel = entry.level || 1;
      entry.xp = (entry.xp || 0) + xpGain;
      // roll over multiple levels if XP exceeds threshold
      while (entry.xp >= 100) {
        entry.xp -= 100;
        entry.level = (entry.level || 1) + 1;
      }
      if (entry.level > prevLevel) {
        const def = cardDefs.find(c => c.id === cardId);
        const name = def ? def.character : cardId;
        levelUpLines.push(`**${name}** leveled up to **Level ${entry.level}**!`);
      }
    });
  }

  await user.save();
  // prepend victory message
  let prefix = `Victory! You earned **${belis}** Beli.`;
  prefix += `\nAll team members gained **${xpGain} XP**!`;
  if (levelUpLines.length) {
    prefix += '\n' + levelUpLines.join('\n');
  }
  state.log = prefix + (state.log ? '\n' + state.log : '');
  state.finished = true;
  state.victory = true;
  await updateBattleMessage(msg, state, user);
}

async function handleDefeat(state, msg, user) {
  clearBattleTimeout(state);
  user.lastIsailFail = new Date();
  await user.save();
  appendLog(state, 'Defeat. Better luck next time.');
  state.finished = true;
  await updateBattleMessage(msg, state, user);
}

function clearBattleTimeout(state) {
  if (state.timeout) {
    clearTimeout(state.timeout);
    state.timeout = null;
  }
}

function setupTimeout(state, msg, user) {
  clearBattleTimeout(state);
  if (state.turn === 'user' && !state.finished) {
    state.timeout = setTimeout(async () => {
      if (state.finished) return;
      state.log = 'Battle timed out due to inactivity.';
      state.finished = true;
      await updateBattleMessage(msg, state, user);
      battleStates.delete(msg.id);
    }, 30000);
  }
}

function appendLog(state, txt) {
  if (state.log) state.log += '\n' + txt;
  else state.log = txt;
}

module.exports = {
  name: 'isail',
  description: 'Begin the Infinite Sail interactive battle',
  options: [],
  async execute({ message, interaction }) {
    const userId = message ? message.author.id : interaction.user.id;
    let user = await User.findOne({ userId });
    if (!user) {
      const reply = 'You need an account first – run `op start` or /start.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }
    user.isailProgress = user.isailProgress || 1;
    user.lastIsailFail = user.lastIsailFail || null;

    // Check if user already has an active isail battle
    let activeIsail = null;
    for (const [msgId, state] of battleStates) {
      if (state.userId === userId && !state.finished) {
        activeIsail = msgId;
        break;
      }
    }
    
    if (activeIsail) {
      const reply = 'You already have an active Isail in progress. Finish it first (win, forfeit, or timeout).';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // cooldown check
    const now = new Date();
    if (userId !== OWNER_ID && user.lastIsailFail) {
      const diff = now - user.lastIsailFail;
      if (diff < 30_000) {
        const wait = Math.ceil((30_000 - diff) / 1000);
        const reply = `You must wait ${wait}s before attempting Infinite Sail again.`;
        if (message) return message.reply(reply);
        return interaction.reply({ content: reply, ephemeral: true });
      }
    }

    if (!Array.isArray(user.team) || user.team.length < 3) {
      const reply = 'Your team is not full (3 cards required).';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    const teamDefs = user.team.slice(0, 3).map(id => cardDefs.find(c => c.id === id)).filter(Boolean);
    if (teamDefs.length < 3) {
      const reply = 'One or more cards on your team could not be found.';
      if (message) return message.reply(reply);
      return interaction.reply({ content: reply, ephemeral: true });
    }

    // prepare resolvedTeam: each element represents the DB-owned instance
    // with final stats (level + boosts applied). `resolveStats` reads the
    // user's ownedCards to count Boost cards and returns the final stats.
    const resolvedTeam = teamDefs.map(def => {
      const entry = (user.ownedCards || []).find(e => e.cardId === def.id) || { cardId: def.id, level: 1, xp: 0 };
      const scaled = resolveStats(entry, user.ownedCards || []);
      return {
        def,
        userEntry: entry,
        scaled: scaled || {
          health: def.health,
          power: def.power,
          speed: def.speed,
          attack_min: def.attack_min,
          attack_max: def.attack_max,
          special_attack: def.special_attack ? { min: def.special_attack.min_atk || def.special_attack.min, max: def.special_attack.max_atk || def.special_attack.max } : undefined
        },
        currentHP: (scaled && scaled.health) || def.health,
        maxHP: (scaled && scaled.health) || def.health,
        energy: 3,
        alive: true,
        usedLastTurn: false,
        status: [] // status effects container
      };
    });

    const state = {
      userId,
      marines: getMarinesForLevel(user.isailProgress),
      cards: resolvedTeam,
      turn: null,
      log: '',
      selected: null,
      awaitingTarget: null, // when set, an action is pending
      finished: false,
      lastUserAction: '',
      lastMarineAction: '',
      timeout: null,
      embedImage: null
    };

    const userSpeed = Math.max(...state.cards.map(c => c.def.speed || 0));
    const marineSpeed = Math.max(...state.marines.map(m => m.speed || 0));
    state.turn = userSpeed >= marineSpeed ? 'user' : 'marine';

    // send initial message
    const embed = buildEmbed(state, user);
    const row = makeSelectionRow(state);
    const components = [row];
    let msg;
    if (message) {
      msg = await message.channel.send({ embeds: [embed], components });
    } else {
      msg = await interaction.reply({ embeds: [embed], components, fetchReply: true });
    }
    battleStates.set(msg.id, state);
    // start inactivity timeout for first turn
    await setupTimeout(state, msg, user);

    // if marine goes first, perform an immediate attack
    if (state.turn === 'marine') {
      marineAttack(state);
      // after marine attack, check defeat
      if (checkForDefeat(state)) {
        await handleDefeat(state, msg, user);
        battleStates.delete(msg.id);
        return;
      }
      state.turn = 'user';
      await updateBattleMessage(msg, state, user);
      // in case all cards have no energy, let skip cycle run automatically
      await runSkipCycle(state, msg, user);
    }
  },

  async handleButton(interaction, rawAction, cardId) {
    const msgId = interaction.message.id;
    const state = battleStates.get(msgId);
    
    // Handle next isail button
    if (rawAction === 'isail_next') {
      battleStates.delete(msgId);
      return module.exports.execute({ interaction });
    }
    
    if (!state) {
      return interaction.reply({ content: 'This battle session has expired.', ephemeral: true });
    }
    if (interaction.user.id !== state.userId) {
      return interaction.reply({ content: 'You are not part of this battle.', ephemeral: true });
    }

    // parse action
    const parts = rawAction.split('_');
    const type = parts[1]; // 'select' or 'action'

    // handle target choice if user is choosing which enemy to hit
    if (rawAction.startsWith('isail_target')) {
      const targetIdx = parseInt(cardId, 10);
      if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= state.marines.length) {
        return interaction.reply({ content: 'Invalid target.', ephemeral: true });
      }
      const action = state.awaitingTarget;
      state.awaitingTarget = null;
      const card = state.cards[state.selected];
      if (action === 'attack') {
        if (card.energy < 1) {
          return interaction.reply({ content: 'Not enough energy.', ephemeral: true });
        }
        card.energy -= 1;
        card.usedLastTurn = true;
        const user = await User.findOne({ userId: state.userId });
        const dmg = calculateUserDamage(card, 'attack', user);
        const m = state.marines[targetIdx];
        m.currentHP -= dmg;
        if (m.currentHP <= 0) m.currentHP = 0;
        // apply potential status effect from special attack (if any)
        applyCardEffect(card, m, state);
        state.lastUserAction = `${card.def.character} used Attack on ${m.rank} for ${dmg} damage! <:energy:1478051414558118052> -1`;
      } else if (action === 'special') {
        if (card.energy < 3) {
          return interaction.reply({ content: 'Not enough energy.', ephemeral: true });
        }
        card.energy -= 3;
        card.usedLastTurn = true;
        const user = await User.findOne({ userId: state.userId });
        // determine the actual range used
        // use the pre-resolved special attack range from the card state
        const rangeMin = card.scaled && card.scaled.special_attack ? card.scaled.special_attack.min : 0;
        const rangeMax = card.scaled && card.scaled.special_attack ? card.scaled.special_attack.max : 0;
        const dmg = calculateUserDamage(card, 'special', user);
        const m = state.marines[targetIdx];
        m.currentHP -= dmg;
        if (m.currentHP <= 0) m.currentHP = 0;
        // effect applies regardless of whether this was special or normal, but
        // most cards only have effects on special
        applyCardEffect(card, m, state);
        state.embedImage = card.def.special_attack ? card.def.special_attack.gif : null;
        state.lastUserAction = `${card.def.character} used ${card.def.special_attack ? card.def.special_attack.name : 'Special Attack'} for ${dmg} damage (range ${rangeMin}-${rangeMax})! <:energy:1478051414558118052> -3`;
      } else if (action === 'ability') {
        card.energy -= 1;
        card.usedLastTurn = true;
        const user = await User.findOne({ userId: state.userId });
        const dmg = calculateUserDamage(card, 'ability', user);
        const m = state.marines[targetIdx];
        m.currentHP -= dmg;
        if (m.currentHP <= 0) m.currentHP = 0;
        applyCardEffect(card, m, state);
        state.lastUserAction = `${card.def.character} used Special Ability on ${m.rank} for ${dmg} damage! <:energy:1478051414558118052> -1`;
      }
      state.selected = null;
      const finished = await finalizeUserAction(state, interaction.message, interaction);
      if (finished) battleStates.delete(msgId);
      return interaction.deferUpdate();
    }

    if (type === 'select') {
      const idx = parseInt(cardId, 10);
      if (isNaN(idx) || idx < 0 || idx >= state.cards.length) {
        return interaction.reply({ content: 'Invalid selection.', ephemeral: true });
      }
      // selection only allowed if it's user's turn and not finished
      if (state.finished || state.turn !== 'user') {
        return interaction.reply({ content: 'You cannot select now.', ephemeral: true });
      }
      const card = state.cards[idx];
      if (!card.alive) {
        return interaction.reply({ content: 'That card is knocked out.', ephemeral: true });
      }
      // check for stun/freeze effects
      if (card.status && card.status.length) {
        const st = card.status[0];
        if (st.type === 'stun' || st.type === 'freeze') {
          appendLog(state, `${card.def.character} is ${st.type === 'stun' ? 'stunned' : 'frozen'} and skips a turn!`);
          st.remaining -= 1;
          if (st.remaining <= 0) {
            card.status.shift();
          }
          // move on as if an action occurred
          state.selected = null;
          const finished = await finalizeUserAction(state, interaction.message, await User.findOne({ userId: state.userId }));
          if (finished) battleStates.delete(msgId);
          return interaction.deferUpdate();
        }
      }
      state.selected = idx;
      // no desktop art; gif-only display handled separately
      await updateBattleMessage(interaction.message, state, await User.findOne({ userId: state.userId }));
      return interaction.deferUpdate();
    }

    if (type === 'action') {
      const act = cardId;
      // do not respond if battle finished
      if (state.finished) {
        return interaction.reply({ content: 'The battle has already ended.', ephemeral: true });
      }
      const card = state.cards[state.selected];
      if (!card || !card.alive) {
        state.selected = null;
        await updateBattleMessage(interaction.message, state, await User.findOne({ userId: state.userId }));
        return interaction.reply({ content: 'Selected card is unavailable.', ephemeral: true });
      }
      if (state.turn !== 'user') {
        return interaction.reply({ content: 'It is not your turn.', ephemeral: true });
      }

      // process user action (with optional target selection)
      if (act === 'attack' || act === 'special' || act === 'ability') {
        const aliveEnemies = state.marines.filter(m => m.currentHP > 0);
        if (aliveEnemies.length > 1 && !state.awaitingTarget) {
          state.awaitingTarget = act;
          await updateBattleMessage(interaction.message, state, await User.findOne({ userId: state.userId }));
          return interaction.deferUpdate();
        }
        let targetIdx = 0;
        if (aliveEnemies.length === 1) {
          targetIdx = state.marines.findIndex(m => m.currentHP > 0);
        }
        // cost checks and energy deduction
        if (act === 'attack') {
          if (card.energy < 1) return interaction.reply({ content: 'Not enough energy for attack.', ephemeral: true });
          card.energy -= 1;
        } else if (act === 'special') {
          if (card.energy < 3) return interaction.reply({ content: 'Special attack requires 3 <:energy:1478051414558118052>.', ephemeral: true });
          card.energy -= 3;
          // set gif display
          if (card.def.special_attack && card.def.special_attack.gif) {
            state.embedImage = card.def.special_attack.gif;
          }
        } else if (act === 'ability') {
          if (card.def.type !== 'Special') return interaction.reply({ content: 'That card has no special ability.', ephemeral: true });
          if (card.energy < 1) return interaction.reply({ content: 'Not enough energy for ability (cost 1 <:energy:1478051414558118052>).', ephemeral: true });
          card.energy -= 1;
        }
        // bleed effect: -2 HP when performing energy-costing action
        if (card.status && card.status.length) {
          const bleed = card.status.find(s => s.type === 'bleed');
          if (bleed) {
            card.currentHP = Math.max(0, card.currentHP - 2);
            appendLog(state, `${card.def.character} bleeds for -2 HP!`);
            bleed.remaining -= 1;
            if (bleed.remaining <= 0) {
              card.status = card.status.filter(s => s !== bleed);
            }
          }
        }
        card.usedLastTurn = true;
        // recalc damage with user context so boosts are always included
        const user = await User.findOne({ userId: state.userId });
        const dmg = calculateUserDamage(card, act === 'ability' ? 'attack' : act, user);
        const m = state.marines[targetIdx];
        m.currentHP -= dmg;
        if (m.currentHP <= 0) m.currentHP = 0;
        // apply any status effect from the attacker's card
        applyCardEffect(card, m, state);
        const cost = act === 'attack' ? 1 : act === 'special' ? 3 : 1;
        if (act === 'special') {
          state.lastUserAction = `${card.def.character} used ${card.def.special_attack ? card.def.special_attack.name : 'Special Attack'} for ${dmg} damage! <:energy:1478051414558118052> -${cost}`;
        } else {
          const label = act === 'attack' ? 'Attack' : 'Special Ability';
          state.lastUserAction = `${card.def.character} used ${label} on ${m.rank} for ${dmg} damage! <:energy:1478051414558118052> -${cost}`;
        }
      } else if (act === 'forfeit') {
        state.lastUserAction = `${card.def.character} forfeited.`;
        const user = await User.findOne({ userId: state.userId });
        await handleDefeat(state, interaction.message, user);
        battleStates.delete(msgId);
        return interaction.update({ embeds: [buildEmbed(state, user)], components: [] });
      } else {
        return interaction.reply({ content: 'Unknown action.', ephemeral: true });
      }

      const finished = await finalizeUserAction(state, interaction.message, interaction);
      if (finished) battleStates.delete(msgId);
      return interaction.deferUpdate();

      // recharge and give turn to marine
      rechargeEnergy(state);
      state.turn = 'marine';
      state.selected = null;

      // marine takes a swing
      marineAttack(state);
      // check if all cards died
      if (checkForDefeat(state)) {
        const user = await User.findOne({ userId: state.userId });
        await handleDefeat(state, interaction.message, user);
        battleStates.delete(msgId);
        return interaction.deferUpdate();
      }

      // back to the user
      state.turn = 'user';
      const user = await User.findOne({ userId: state.userId });
      await updateBattleMessage(interaction.message, state, user);
      // if energy still zero this will auto-skip again
      await runSkipCycle(state, interaction.message, user);
      return interaction.deferUpdate();
    }

    // default fallback
    return interaction.reply({ content: 'Unsupported interaction.', ephemeral: true });
  }
};

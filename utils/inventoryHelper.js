const User = require('../models/User');

/**
 * Add (or subtract) an item from a user's inventory.
 * If the user doesn't exist it will be created.
 * If amount is negative and the resulting quantity falls to 0 or below,
 * the item entry will be removed.
 *
 * @param {String} userId
 * @param {String} itemId
 * @param {Number} amount
 * @returns {Promise<void>}
 */
async function addItem(userId, itemId, amount) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId });
  }

  const entry = user.items.find(i => i.itemId === itemId);
  if (entry) {
    entry.quantity += amount;
    if (entry.quantity <= 0) {
      user.items = user.items.filter(i => i.itemId !== itemId);
    }
  } else if (amount > 0) {
    user.items.push({ itemId, quantity: amount });
  }

  await user.save();
}

module.exports = { addItem };

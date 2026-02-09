const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/playlists.json');

const generateId = (existingIds = new Set()) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id;

  do {
    id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (existingIds.has(id));

  return id;
};

const isValidId = (id) =>
  typeof id === 'string' && /^[a-zA-Z0-9]{8}$/.test(id);

const validateParamId = (id) => {
  if (!isValidId(id)) {
    const err = new Error('Invalid ID format');
    err.status = 400;
    throw err;
  }
  return true;
};

const manualSort = (songs) => {
  const arr = [...songs];

  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length - i - 1; j++) {
      const a = arr[j];
      const b = arr[j + 1];

      let swap = false;

      if (a.score < b.score) {
        swap = true;
      } else if (a.score === b.score && a.addedAt > b.addedAt) {
        swap = true;
      }

      if (swap) {
        const tmp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = tmp;
      }
    }
  }

  return arr;
};

module.exports = { generateId, manualSort, isValidId, validateParamId  };

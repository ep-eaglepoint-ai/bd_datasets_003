function validateCard(card, callback) {
  setTimeout(function() {
    if (!card || !card.number || !card.expiry || !card.cvv) {
      callback(new Error('Missing card fields'), null);
      return;
    }

    var number = card.number.replace(/\s/g, '');

    if (!/^\d{13,19}$/.test(number)) {
      callback(null, false);
      return;
    }

    if (!luhnCheck(number)) {
      callback(null, false);
      return;
    }

    var parts = card.expiry.split('/');
    var month = parseInt(parts[0], 10);
    var year = parseInt(parts[1], 10);

    if (year < 100) {
      year += 2000;
    }

    var now = new Date();
    var expiry = new Date(year, month, 0);

    if (expiry < now) {
      callback(null, false);
      return;
    }

    if (!/^\d{3,4}$/.test(card.cvv)) {
      callback(null, false);
      return;
    }

    callback(null, true);
  }, 0);
}

function luhnCheck(number) {
  var sum = 0;
  var isEven = false;

  for (var i = number.length - 1; i >= 0; i--) {
    var digit = parseInt(number[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

module.exports = validateCard;

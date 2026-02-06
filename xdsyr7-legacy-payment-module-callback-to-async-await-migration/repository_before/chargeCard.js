var EventEmitter = require('events').EventEmitter;

var gateway = new EventEmitter();

function simulateGatewayCall(card, amount) {
  setTimeout(function() {
    if (Math.random() < 0.1) {
      gateway.emit('charge_failed', new Error('Card declined'));
    } else {
      gateway.emit('charge_complete', {
        chargeId: 'ch_' + Math.random().toString(36).substr(2, 9),
        amount: amount,
        last4: card.number.slice(-4)
      });
    }
  }, 100 + Math.random() * 200);
}

function chargeCard(card, amount, callback) {
  var timeoutId = null;

  gateway.on('charge_complete', function(result) {
    if (timeoutId) clearTimeout(timeoutId);
    callback(null, result);
  });

  gateway.on('charge_failed', function(error) {
    if (timeoutId) clearTimeout(timeoutId);
    callback(error, null);
  });

  timeoutId = setTimeout(function() {
    callback(new Error('Payment gateway timeout'), null);
  }, 30000);

  simulateGatewayCall(card, amount);
}

function refund(chargeId, callback) {
  setTimeout(function() {
    if (Math.random() < 0.05) {
      callback(new Error('Refund failed'), null);
    } else {
      callback(null, {
        refundId: 'rf_' + Math.random().toString(36).substr(2, 9)
      });
    }
  }, 50);
}

module.exports = chargeCard;
module.exports.refund = refund;

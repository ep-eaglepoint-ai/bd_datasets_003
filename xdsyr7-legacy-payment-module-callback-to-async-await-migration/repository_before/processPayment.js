const validateCard = require('./validateCard');
const chargeCard = require('./chargeCard');
const updateInventory = require('./updateInventory');
const sendReceipt = require('./sendReceipt');
const db = require('./db');

function processPayment(order, callback) {
  validateCard(order.card, function(err, isValid) {
    if (err) {
      callback(err, null);
      return;
    }
    if (!isValid) {
      callback(new Error('Invalid card'), null);
      return;
    }

    db.getConnection(function(err, connection) {
      if (err) {
        callback(err, null);
        return;
      }

      connection.beginTransaction(function(err) {
        if (err) {
          connection.release();
          callback(err, null);
          return;
        }

        checkInventory(connection, order.items, function(err, available) {
          if (err) {
            connection.rollback(function() {
              connection.release();
              callback(err, null);
            });
            return;
          }

          if (!available) {
            connection.rollback(function() {
              connection.release();
              callback(new Error('Insufficient inventory'), null);
            });
            return;
          }

          chargeCard(order.card, order.total, function(err, chargeResult) {
            if (err) {
              connection.rollback(function() {
                connection.release();
                callback(err, null);
              });
              return;
            }

            updateInventory(connection, order.items, function(err) {
              if (err) {
                refundCharge(chargeResult.chargeId, function() {
                  connection.rollback(function() {
                    connection.release();
                    callback(err, null);
                  });
                });
                return;
              }

              recordTransaction(connection, order, chargeResult, function(err, txRecord) {
                if (err) {
                  refundCharge(chargeResult.chargeId, function() {
                    connection.rollback(function() {
                      connection.release();
                      callback(err, null);
                    });
                  });
                  return;
                }

                connection.commit(function(err) {
                  if (err) {
                    refundCharge(chargeResult.chargeId, function() {
                      connection.rollback(function() {
                        connection.release();
                        callback(err, null);
                      });
                    });
                    return;
                  }

                  connection.release();

                  sendReceipt(order.email, txRecord, function(err) {
                    if (err) {
                      console.log('Receipt failed but payment succeeded', err);
                    }
                    callback(null, {
                      success: true,
                      transactionId: txRecord.id,
                      chargeId: chargeResult.chargeId
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

function checkInventory(connection, items, callback) {
  var remaining = items.length;
  var allAvailable = true;

  items.forEach(function(item) {
    connection.query(
      'SELECT quantity FROM inventory WHERE product_id = ? FOR UPDATE',
      [item.productId],
      function(err, results) {
        if (err) {
          callback(err, null);
          return;
        }
        if (results.length === 0 || results[0].quantity < item.quantity) {
          allAvailable = false;
        }
        remaining--;
        if (remaining === 0) {
          callback(null, allAvailable);
        }
      }
    );
  });
}

function recordTransaction(connection, order, chargeResult, callback) {
  connection.query(
    'INSERT INTO transactions (order_id, charge_id, amount, status, created_at) VALUES (?, ?, ?, ?, NOW())',
    [order.id, chargeResult.chargeId, order.total, 'completed'],
    function(err, result) {
      if (err) {
        callback(err, null);
        return;
      }
      callback(null, {
        id: result.insertId,
        order_id: order.id,
        charge_id: chargeResult.chargeId,
        amount: order.total,
        status: 'completed'
      });
    }
  );
}

function refundCharge(chargeId, callback) {
  var retries = 0;
  var maxRetries = 3;

  function attemptRefund() {
    require('./chargeCard').refund(chargeId, function(err, result) {
      if (err) {
        retries++;
        if (retries < maxRetries) {
          setTimeout(attemptRefund, 1000 * retries);
        } else {
          console.error('Refund failed after retries', err);
          callback(err);
        }
        return;
      }
      callback(null, result);
    });
  }

  attemptRefund();
}

module.exports = processPayment;

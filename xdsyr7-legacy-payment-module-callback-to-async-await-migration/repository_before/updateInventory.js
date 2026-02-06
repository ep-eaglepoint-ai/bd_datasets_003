function updateInventory(connection, items, callback) {
  var remaining = items.length;
  var hasError = false;

  items.forEach(function(item) {
    if (hasError) return;

    connection.query(
      'UPDATE inventory SET quantity = quantity - ?, updated_at = NOW() WHERE product_id = ? AND quantity >= ?',
      [item.quantity, item.productId, item.quantity],
      function(err, result) {
        if (hasError) return;

        if (err) {
          hasError = true;
          callback(err);
          return;
        }

        if (result.affectedRows === 0) {
          hasError = true;
          callback(new Error('Insufficient stock for product ' + item.productId));
          return;
        }

        remaining--;
        if (remaining === 0) {
          callback(null);
        }
      }
    );
  });
}

function restoreInventory(connection, items, callback) {
  var remaining = items.length;

  items.forEach(function(item) {
    connection.query(
      'UPDATE inventory SET quantity = quantity + ? WHERE product_id = ?',
      [item.quantity, item.productId],
      function(err) {
        if (err) {
          console.error('Failed to restore inventory for product', item.productId, err);
        }
        remaining--;
        if (remaining === 0) {
          callback();
        }
      }
    );
  });
}

module.exports = updateInventory;
module.exports.restore = restoreInventory;

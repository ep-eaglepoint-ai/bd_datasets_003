var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587', 10)
});

function generateReceiptHtml(transaction) {
  return '<h1>Receipt</h1>' +
    '<p>Transaction ID: ' + transaction.id + '</p>' +
    '<p>Amount: $' + (transaction.amount / 100).toFixed(2) + '</p>' +
    '<p>Date: ' + transaction.created_at + '</p>';
}

function sendReceipt(email, transaction, callback) {
  var retries = 0;
  var maxRetries = 3;

  function attemptSend() {
    transporter.sendMail({
      from: 'noreply@shop.com',
      to: email,
      subject: 'Your Receipt #' + transaction.id,
      html: generateReceiptHtml(transaction)
    }, function(err, info) {
      if (err) {
        retries++;
        if (retries < maxRetries) {
          setTimeout(attemptSend, 1000 * Math.pow(2, retries));
        } else {
          callback(err);
        }
        return;
      }
      callback(null, info);
    });
  }

  attemptSend();
}

module.exports = sendReceipt;

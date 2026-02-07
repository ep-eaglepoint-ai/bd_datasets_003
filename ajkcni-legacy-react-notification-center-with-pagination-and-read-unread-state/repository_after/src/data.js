var notifications = [];
var types = ["alert", "info", "success", "warning"];

for (var i = 1; i <= 50; i++) {
  notifications.push({
    id: i,
    message: "Notification " + i + ": System update pending action.",
    type: types[i % 4],
    timestamp: "2023-10-01T12:00:00.000Z",
    isRead: false
  });
}

module.exports = notifications;

var React = require('react');
// var PropTypes = require('prop-types');

class NotificationList extends React.Component {
  render() {
    var notifications = this.props.notifications;
    var onToggleRead = this.props.onToggleRead;

    if (notifications.length === 0) {
      return React.createElement('div', { className: 'notification-list-empty' }, 'No notifications');
    }

    return React.createElement('ul', { className: 'notification-list' },
      notifications.map(function(notification) {
        return React.createElement(NotificationItem, {
          key: notification.id,
          notification: notification,
          onToggleRead: onToggleRead
        });
      })
    );
  }
}

NotificationList.displayName = 'NotificationList';
// NotificationList.propTypes = {
//   notifications: PropTypes.array.isRequired,
//   onToggleRead: PropTypes.func.isRequired
// };

class NotificationItem extends React.Component {
  constructor(props) {
    super(props);
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  handleClick() {
    this.props.onToggleRead(this.props.notification.id);
  }

  handleKeyDown(e) {
    if (e.key === 'Enter') {
      this.handleClick();
    }
  }

  render() {
    var notification = this.props.notification;
    var statusClass = notification.isRead ? 'read' : 'unread';
    
    return React.createElement('li', {
      className: 'notification-item ' + statusClass,
      onClick: this.handleClick,
      onKeyDown: this.handleKeyDown,
      tabIndex: 0,
      role: 'button',
      'aria-pressed': notification.isRead
    },
      React.createElement('span', { className: 'notification-id' }, '#' + notification.id + ' '),
      React.createElement('span', { className: 'notification-message' }, notification.message),
      React.createElement('span', { className: 'notification-status' }, notification.isRead ? ' (Read)' : ' (Unread)')
    );
  }
}

NotificationItem.displayName = 'NotificationItem';
// NotificationItem.propTypes = {
//   notification: PropTypes.object.isRequired,
//   onToggleRead: PropTypes.func.isRequired
// };

module.exports = NotificationList;

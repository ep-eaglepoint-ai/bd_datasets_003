var React = require('react');
var NotificationList = require('./NotificationList');
var Pagination = require('./Pagination');
var initialData = require('./data');

var PAGE_SIZE = 5;

class NotificationCenter extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      notifications: initialData.map(function(n) {
        return Object.assign({}, n);
      }),
      currentPage: 1
    };
    this.handleToggleRead = this.handleToggleRead.bind(this);
    this.handleNextPage = this.handleNextPage.bind(this);
    this.handlePrevPage = this.handlePrevPage.bind(this);
  }

  handleToggleRead(id) {
    this.setState(function(prevState) {
      var newNotifications = prevState.notifications.map(function(n) {
        if (n.id === id) {
          var newNote = Object.assign({}, n);
          newNote.isRead = !n.isRead;
          return newNote;
        }
        return n;
      });
      return { notifications: newNotifications };
    });
  }

  handleNextPage() {
    this.setState(function(prevState) {
      var maxPage = Math.ceil(prevState.notifications.length / PAGE_SIZE);
      if (prevState.currentPage < maxPage) {
        return { currentPage: prevState.currentPage + 1 };
      }
      return null;
    });
  }

  handlePrevPage() {
    this.setState(function(prevState) {
      if (prevState.currentPage > 1) {
        return { currentPage: prevState.currentPage - 1 };
      }
      return null;
    });
  }

  render() {
    var currentPage = this.state.currentPage;
    var notifications = this.state.notifications;
    var totalPages = Math.ceil(notifications.length / PAGE_SIZE);

    var startIndex = (currentPage - 1) * PAGE_SIZE;
    var endIndex = startIndex + PAGE_SIZE;
    var currentNotifications = notifications.slice(startIndex, endIndex);

    return React.createElement('div', { className: 'notification-center' },
      React.createElement('h1', null, 'Notification Center'),
      React.createElement(NotificationList, {
        notifications: currentNotifications,
        onToggleRead: this.handleToggleRead
      }),
      React.createElement(Pagination, {
        currentPage: currentPage,
        totalPages: totalPages,
        onNext: this.handleNextPage,
        onPrev: this.handlePrevPage
      })
    );
  }
}

NotificationCenter.displayName = 'NotificationCenter';

module.exports = NotificationCenter;

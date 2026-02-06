var React = require('react');
var renderer = require('react-test-renderer');
var NotificationCenter = require('../repository_after/src/NotificationCenter');
var NotificationList = require('../repository_after/src/NotificationList');
var Pagination = require('../repository_after/src/Pagination');

// Mock data to control test environment
jest.mock('../repository_after/src/data', () => {
  var notifications = [];
  for (var i = 1; i <= 20; i++) {
    notifications.push({
      id: i,
      message: "Notification " + i,
      type: "info",
      timestamp: new Date().toISOString(),
      isRead: false
    });
  }
  return notifications;
});

describe('NotificationCenter', () => {
  test('renders the initial list of notifications', () => {
    const component = renderer.create(React.createElement(NotificationCenter));
    let tree = component.toJSON();
    expect(tree).toMatchSnapshot();
    
    // Check if we have 5 items (PAGE_SIZE)
    const root = component.root;
    const list = root.findByType(NotificationList);
    expect(list.props.notifications.length).toBe(5);
    expect(list.props.notifications[0].id).toBe(1);
  });

  test('supports pagination (Next / Previous) and maintains order', () => {
    const component = renderer.create(React.createElement(NotificationCenter));
    const root = component.root;
    
    // Initial page 1: IDs 1-5
    let list = root.findByType(NotificationList);
    expect(list.props.notifications.length).toBe(5);
    expect(list.props.notifications[0].id).toBe(1);
    expect(list.props.notifications[4].id).toBe(5);

    // Find Next button
    const pagination = root.findByType(Pagination);
    const nextBtn = pagination.findAllByType('button')[1]; // [Prev, Next]
    
    // Click Next -> Page 2: IDs 6-10
    nextBtn.props.onClick({ type: 'click' });
    
    list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(6);
    expect(list.props.notifications[4].id).toBe(10);
    
    // Click Next -> Page 3: IDs 11-15
    nextBtn.props.onClick({ type: 'click' });
    list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(11);
    
    // Click Prev -> Page 2: IDs 6-10 (verify order preserved when going back)
    const prevBtn = pagination.findAllByType('button')[0];
    prevBtn.props.onClick({ type: 'click' });
    
    list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(6);
    expect(list.props.notifications[4].id).toBe(10);
  });

  test('toggles read/unread state', () => {
    const component = renderer.create(React.createElement(NotificationCenter));
    const root = component.root;
    
    let list = root.findByType(NotificationList);
    const firstItem = list.findAllByType('li')[0]; 
    
    // Initial state: unread
    expect(firstItem.props.className).toContain('unread');
    
    // Click to toggle
    firstItem.props.onClick();
    
    // Re-find item to check update
    list = root.findByType(NotificationList);
    const updatedFirstItem = list.findAllByType('li')[0];
    expect(updatedFirstItem.props.className).toContain('read');
    
    // Toggle back
    updatedFirstItem.props.onClick();
    
    // Check again
    list = root.findByType(NotificationList);
    const finalFirstItem = list.findAllByType('li')[0];
    expect(finalFirstItem.props.className).toContain('unread');
  });

  test('preserves read/unread state across pagination changes', () => {
    const component = renderer.create(React.createElement(NotificationCenter));
    const root = component.root;
    
    // Mark item 1 as read
    let list = root.findByType(NotificationList);
    let firstItem = list.findAllByType('li')[0];
    firstItem.props.onClick();
    
    // Mark item 2 as read
    let secondItem = list.findAllByType('li')[1];
    secondItem.props.onClick();
    
    // Verify both read
    list = root.findByType(NotificationList);
    expect(list.findAllByType('li')[0].props.className).toContain('read');
    expect(list.findAllByType('li')[1].props.className).toContain('read');
    
    // Go to next page
    const pagination = root.findByType(Pagination);
    const nextBtn = pagination.findAllByType('button')[1];
    nextBtn.props.onClick({ type: 'click' });
    
    // Go back to first page
    const prevBtn = pagination.findAllByType('button')[0];
    prevBtn.props.onClick({ type: 'click' });
    
    // Verify items 1 and 2 are still read
    list = root.findByType(NotificationList);
    const items = list.findAllByType('li');
    expect(items[0].props.className).toContain('read');
    expect(items[1].props.className).toContain('read');
    expect(items[2].props.className).toContain('unread'); // Item 3 should still be unread
  });

  test('handles keyboard navigation (Tab + Enter) for pagination', () => {
    const component = renderer.create(React.createElement(NotificationCenter));
    const root = component.root;
    const pagination = root.findByType(Pagination);
    const nextBtn = pagination.findAllByType('button')[1];
    
    // Tab key implies focus, but here we test the keydown handler directly
    // checking for 'Enter' key specifically.
    nextBtn.props.onKeyDown({ key: 'Enter', type: 'keydown' });
    
    let list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(6); // Changed page
    
    // Ensure random key doesn't trigger action
    nextBtn.props.onKeyDown({ key: 'a', type: 'keydown' });
    list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(6); // Still on page 2
  });
  
  test('handles keyboard navigation (Tab + Enter) for items', () => {
      const component = renderer.create(React.createElement(NotificationCenter));
      const root = component.root;
      let list = root.findByType(NotificationList);
      let firstItem = list.findAllByType('li')[0];
      
      // Enter key marks as read
      firstItem.props.onKeyDown({ key: 'Enter' });
      
      list = root.findByType(NotificationList);
      expect(list.findAllByType('li')[0].props.className).toContain('read');
  });
  
  test('renders correct total pages', () => {
    // 20 items / 5 per page = 4 pages
    const component = renderer.create(React.createElement(NotificationCenter));
    const root = component.root;
    const pagination = root.findByType(Pagination);
    const info = pagination.findByType('span');
    expect(info.children).toContain('Page 1 of 4');
  });

  test('robustness: handles rapid interactions without crashing or invalid state', () => {
    const component = renderer.create(React.createElement(NotificationCenter));
    const root = component.root;
    const pagination = root.findByType(Pagination);
    const nextBtn = pagination.findAllByType('button')[1];
    const prevBtn = pagination.findAllByType('button')[0];

    // Rapid page switching
    for (let i = 0; i < 10; i++) {
        nextBtn.props.onClick({ type: 'click' });
        prevBtn.props.onClick({ type: 'click' });
    }
    
    // Should still be on page 1
    let list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(1);
  });

  test('robustness: ignores invalid pagination actions (boundary checks)', () => {
    const component = renderer.create(React.createElement(NotificationCenter));
    const root = component.root;
    const pagination = root.findByType(Pagination);
    const prevBtn = pagination.findAllByType('button')[0];
    
    // Try to go back from page 1
    prevBtn.props.onClick({ type: 'click' });
    
    // Should still be on page 1
    let list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(1);
    
    // Go to last page (Page 4)
    const nextBtn = pagination.findAllByType('button')[1];
    nextBtn.props.onClick({ type: 'click' }); // Page 2
    nextBtn.props.onClick({ type: 'click' }); // Page 3
    nextBtn.props.onClick({ type: 'click' }); // Page 4
    
    // Try to go forward from last page
    nextBtn.props.onClick({ type: 'click' });
    
    // Should still be on page 4
    list = root.findByType(NotificationList);
    expect(list.props.notifications[0].id).toBe(16);
  });
});

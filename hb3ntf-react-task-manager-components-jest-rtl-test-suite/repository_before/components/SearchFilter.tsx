import React, { useState, useEffect } from 'react';

interface SearchFilterProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: { status?: string; priority?: string }) => void;
  debounceMs?: number;
}

const STATUSES = ['all', 'todo', 'in_progress', 'done'];
const PRIORITIES = ['all', 'low', 'medium', 'high'];

export const SearchFilter: React.FC<SearchFilterProps> = ({ onSearch, onFilterChange, debounceMs = 300 }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchQuery);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [searchQuery, debounceMs, onSearch]);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    onFilterChange({
      status: newStatus === 'all' ? undefined : newStatus,
      priority: priority === 'all' ? undefined : priority,
    });
  };

  const handlePriorityChange = (newPriority: string) => {
    setPriority(newPriority);
    onFilterChange({
      status: status === 'all' ? undefined : status,
      priority: newPriority === 'all' ? undefined : newPriority,
    });
  };

  const handleClear = () => {
    setSearchQuery('');
    setStatus('all');
    setPriority('all');
    onSearch('');
    onFilterChange({});
  };

  return (
    <div role="search">
      <div>
        <label htmlFor="search">Search tasks</label>
        <input id="search" type="text" value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title..." />
      </div>
      <div>
        <label htmlFor="status-filter">Status</label>
        <select id="status-filter" value={status} onChange={(e) => handleStatusChange(e.target.value)}>
          {STATUSES.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="priority-filter">Priority</label>
        <select id="priority-filter" value={priority} onChange={(e) => handlePriorityChange(e.target.value)}>
          {PRIORITIES.map(p => (
            <option key={p} value={p}>{p === 'all' ? 'All Priorities' : p}</option>
          ))}
        </select>
      </div>
      <button onClick={handleClear}>Clear Filters</button>
    </div>
  );
};

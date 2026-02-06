'use client';

import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/lib/store';
import { AuditLog } from '@/lib/schemas';

export function AuditLogs() {
  const { auditLogs, items, categories, locations } = useInventoryStore();
  const [filterEntityType, setFilterEntityType] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  
  const filteredLogs = useMemo(() => {
    let result = [...auditLogs].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    if (filterEntityType !== 'all') {
      result = result.filter(log => log.entityType === filterEntityType);
    }
    
    if (filterAction !== 'all') {
      result = result.filter(log => log.action === filterAction);
    }
    
    return result;
  }, [auditLogs, filterEntityType, filterAction]);
  
  const getEntityName = (log: AuditLog) => {
    switch (log.entityType) {
      case 'item':
        const item = items.find(i => i.id === log.entityId);
        return item?.name || (log.changes as any)?.name || log.entityId;
      case 'category':
        const category = categories.find(c => c.id === log.entityId);
        return category?.name || (log.changes as any)?.name || log.entityId;
      case 'location':
        const location = locations.find(l => l.id === log.entityId);
        return location?.name || (log.changes as any)?.name || log.entityId;
      default:
        return log.entityId;
    }
  };
  
  const getActionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-green-100 text-green-800';
      case 'update': return 'bg-blue-100 text-blue-800';
      case 'delete': return 'bg-red-100 text-red-800';
      case 'restore': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Audit Logs</h2>
      
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Types</option>
              <option value="item">Items</option>
              <option value="category">Categories</option>
              <option value="location">Locations</option>
              <option value="movement">Movements</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="restore">Restore</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Logs List */}
      <div className="bg-white rounded-lg shadow">
        {filteredLogs.length > 0 ? (
          <div className="divide-y">
            {filteredLogs.map(log => (
              <div key={log.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                        {log.entityType}
                      </span>
                    </div>
                    <p className="font-medium mt-1">{getEntityName(log)}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                {log.action === 'update' && (log.changes as any)?.changes && (
                  <div className="mt-2 text-sm bg-gray-50 p-2 rounded">
                    <p className="font-medium text-gray-700">Changes:</p>
                    <pre className="text-xs text-gray-600 overflow-auto">
                      {JSON.stringify((log.changes as any).changes, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-8 text-center text-gray-500">
            No audit logs recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}

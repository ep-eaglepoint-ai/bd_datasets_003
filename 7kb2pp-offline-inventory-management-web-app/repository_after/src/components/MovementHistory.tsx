'use client';

import { useState, useMemo } from 'react';
import { useInventoryStore } from '@/lib/store';
import { StockMovement, MovementType } from '@/lib/schemas';
import { ArrowDownRight, ArrowUpRight, RefreshCw, ArrowLeftRight } from 'lucide-react';

export function MovementHistory() {
  const { movements, items } = useInventoryStore();
  const [filterType, setFilterType] = useState<MovementType | 'all'>('all');
  const [filterItemId, setFilterItemId] = useState<string>('');
  
  const filteredMovements = useMemo(() => {
    let result = [...movements].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    if (filterType !== 'all') {
      result = result.filter(m => m.type === filterType);
    }
    
    if (filterItemId) {
      result = result.filter(m => m.itemId === filterItemId);
    }
    
    return result;
  }, [movements, filterType, filterItemId]);
  
  const getItemName = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    return item?.name || 'Unknown Item';
  };
  
  const getMovementIcon = (type: MovementType) => {
    switch (type) {
      case 'inbound': return <ArrowDownRight className="text-green-500" size={20} />;
      case 'outbound': return <ArrowUpRight className="text-red-500" size={20} />;
      case 'adjustment': return <RefreshCw className="text-blue-500" size={20} />;
      case 'correction': return <RefreshCw className="text-yellow-500" size={20} />;
      case 'transfer': return <ArrowLeftRight className="text-purple-500" size={20} />;
      default: return null;
    }
  };
  
  const getMovementColor = (type: MovementType) => {
    switch (type) {
      case 'inbound': return 'bg-green-100 text-green-800';
      case 'outbound': return 'bg-red-100 text-red-800';
      case 'adjustment': return 'bg-blue-100 text-blue-800';
      case 'correction': return 'bg-yellow-100 text-yellow-800';
      case 'transfer': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Stock Movements</h2>
      
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as MovementType | 'all')}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">All Types</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="adjustment">Adjustment</option>
              <option value="correction">Correction</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
            <select
              value={filterItemId}
              onChange={(e) => setFilterItemId(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Items</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Movement List */}
      <div className="bg-white rounded-lg shadow">
        {filteredMovements.length > 0 ? (
          <div className="divide-y">
            {filteredMovements.map(movement => (
              <div key={movement.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getMovementIcon(movement.type)}
                    <div>
                      <p className="font-medium">{getItemName(movement.itemId)}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(movement.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs ${getMovementColor(movement.type)}`}>
                        {movement.type}
                      </span>
                      <p className="text-sm mt-1">
                        <span className="text-gray-500">{movement.previousQuantity}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium">{movement.newQuantity}</span>
                        <span className="ml-1 text-gray-500">
                          ({movement.quantity >= 0 ? '+' : ''}{movement.quantity})
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                
                {movement.reason && (
                  <p className="mt-2 text-sm text-gray-600 pl-8">
                    Reason: {movement.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-8 text-center text-gray-500">
            No stock movements recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}

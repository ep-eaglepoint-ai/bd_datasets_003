'use client';

import { useEffect, useState } from 'react';
import { useInventoryStore, selectFilteredItems, selectTotalValue, selectInventoryHealth, selectLowStockItems } from '@/lib/store';
import { InventoryList } from '@/components/InventoryList';
import { Dashboard } from '@/components/Dashboard';
import { ItemForm } from '@/components/ItemForm';
import { CategoryManager } from '@/components/CategoryManager';
import { LocationManager } from '@/components/LocationManager';
import { MovementHistory } from '@/components/MovementHistory';
import { AuditLogs } from '@/components/AuditLogs';
import { ExportImport } from '@/components/ExportImport';
import AdvancedAnalytics from '@/components/AdvancedAnalytics';
import { RecoveryDialog } from '@/components/RecoveryDialog';
import { BulkOperations } from '@/components/BulkOperations';
import { MetricsExplainer } from '@/components/MetricsExplainer';
import { TransferForm } from '@/components/TransferForm';
import { CorrectionForm } from '@/components/CorrectionForm';
import { Package, BarChart3, FolderTree, MapPin, History, FileText, Download, Menu, X, TrendingUp, Edit3, HelpCircle, ArrowLeftRight, RefreshCw } from 'lucide-react';

type TabType = 'dashboard' | 'analytics' | 'inventory' | 'bulk' | 'categories' | 'locations' | 'movements' | 'audit' | 'export' | 'explainer';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showRecovery, setShowRecovery] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  
  const { initialize, isLoading, error, loadRecoveryState, needsRecovery, addValuationSnapshot } = useInventoryStore();
  
  useEffect(() => {
    const checkRecovery = async () => {
      const needs = await needsRecovery();
      if (needs) {
        setShowRecovery(true);
      } else {
        initialize();
      }
    };
    checkRecovery();
  }, [initialize, needsRecovery]);
  
  const handleRecover = async () => {
    await loadRecoveryState();
    await initialize();
    setShowRecovery(false);
  };
  
  const handleDismissRecovery = async () => {
    await initialize();
    setShowRecovery(false);
  };
  
  const handleEditItem = (itemId: string) => {
    setEditingItemId(itemId);
    setShowItemForm(true);
  };
  
  const handleCloseForm = () => {
    setShowItemForm(false);
    setEditingItemId(null);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading inventory data...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-red-600">
          <p className="text-xl font-semibold">Error loading data</p>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }
  
  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={20} /> },
    { id: 'analytics', label: 'Analytics', icon: <TrendingUp size={20} /> },
    { id: 'inventory', label: 'Inventory', icon: <Package size={20} /> },
    { id: 'bulk', label: 'Bulk Operations', icon: <Edit3 size={20} /> },
    { id: 'categories', label: 'Categories', icon: <FolderTree size={20} /> },
    { id: 'locations', label: 'Locations', icon: <MapPin size={20} /> },
    { id: 'movements', label: 'Movements', icon: <History size={20} /> },
    { id: 'audit', label: 'Audit Logs', icon: <FileText size={20} /> },
    { id: 'export', label: 'Export/Import', icon: <Download size={20} /> },
    { id: 'explainer', label: 'How Metrics Work', icon: <HelpCircle size={20} /> },
  ];
  
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Recovery Dialog */}
      {showRecovery && (
        <RecoveryDialog
          onRecover={handleRecover}
          onDismiss={handleDismissRecovery}
        />
      )}
      
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-white shadow-lg transition-all duration-300 flex flex-col`}>
        <div className="p-4 border-b flex items-center justify-between">
          {sidebarOpen && (
            <h1 className="text-xl font-bold text-gray-800">Inventory</h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {tabs.map(tab => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {tab.icon}
                  {sidebarOpen && <span>{tab.label}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        
        {sidebarOpen && (
          <div className="p-4 border-t text-sm text-gray-500">
            <p>Offline Mode Active</p>
            <p className="text-xs mt-1">All data stored locally</p>
          </div>
        )}
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'analytics' && <AdvancedAnalytics />}
        
        {activeTab === 'inventory' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Inventory Items</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTransferForm(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <ArrowLeftRight size={18} />
                  Transfer
                </button>
                <button
                  onClick={() => setShowCorrectionForm(true)}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={18} />
                  Correction
                </button>
                <button
                  onClick={() => setShowItemForm(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Item
                </button>
              </div>
            </div>
            <InventoryList onEditItem={handleEditItem} />
          </div>
        )}
        
        {activeTab === 'bulk' && <BulkOperations />}
        {activeTab === 'categories' && <CategoryManager />}
        {activeTab === 'locations' && <LocationManager />}
        {activeTab === 'movements' && <MovementHistory />}
        {activeTab === 'audit' && <AuditLogs />}
        {activeTab === 'export' && <ExportImport />}
        {activeTab === 'explainer' && <MetricsExplainer />}
      </main>
      
      {/* Item Form Modal */}
      {showItemForm && (
        <ItemForm
          itemId={editingItemId}
          onClose={handleCloseForm}
        />
      )}
      
      {/* Transfer Form Modal */}
      {showTransferForm && (
        <TransferForm onClose={() => setShowTransferForm(false)} />
      )}
      
      {/* Correction Form Modal */}
      {showCorrectionForm && (
        <CorrectionForm onClose={() => setShowCorrectionForm(false)} />
      )}
    </div>
  );
}

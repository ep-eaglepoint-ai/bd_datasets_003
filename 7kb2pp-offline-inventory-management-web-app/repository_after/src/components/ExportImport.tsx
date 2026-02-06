'use client';

import { useState, useRef } from 'react';
import { useInventoryStore } from '@/lib/store';
import { ExportDataSchema } from '@/lib/schemas';
import { Download, Upload, FileJson, FileText, AlertCircle, BarChart3, TrendingUp } from 'lucide-react';

export function ExportImport() {
  const { exportData, exportCSV, exportValuationSummary, exportAnalyticsSnapshot, bulkImport } = useInventoryStore();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleExportJSON = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleExportCSV = () => {
    const csv = exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleExportValuation = () => {
    const data = exportValuationSummary();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valuation-summary-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleExportAnalytics = () => {
    const data = exportAnalyticsSnapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-snapshot-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImportError(null);
    setImportSuccess(false);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate the imported data
      const validated = ExportDataSchema.parse(data);
      
      // Confirm before importing
      if (confirm('This will replace all existing data. Are you sure?')) {
        await bulkImport(validated);
        setImportSuccess(true);
      }
    } catch (error) {
      if (error instanceof Error) {
        setImportError(error.message);
      } else {
        setImportError('Invalid file format');
      }
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Export / Import</h2>
      
      {/* Export Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Export Data</h3>
        <p className="text-gray-600 mb-4">
          Download your inventory data for backup or transfer to another system.
        </p>
        
        <div className="flex gap-4">
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <FileJson size={20} />
            Export as JSON
          </button>
          
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileText size={20} />
            Export as CSV
          </button>
          
          <button
            onClick={handleExportValuation}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <BarChart3 size={20} />
            Valuation Summary
          </button>
          
          <button
            onClick={handleExportAnalytics}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            <TrendingUp size={20} />
            Analytics Snapshot
          </button>
        </div>
      </div>
      
      {/* Import Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Import Data</h3>
        <p className="text-gray-600 mb-4">
          Import data from a previously exported JSON file. This will replace all existing data.
        </p>
        
        {importError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            {importError}
          </div>
        )}
        
        {importSuccess && (
          <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg">
            Data imported successfully!
          </div>
        )}
        
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            id="import-file"
          />
          <label
            htmlFor="import-file"
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 cursor-pointer inline-flex"
          >
            <Upload size={20} />
            Import JSON File
          </label>
        </div>
      </div>
      
      {/* Data Backup Info */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-800 mb-2">About Offline Storage</h3>
        <p className="text-blue-700">
          All your inventory data is stored locally in your browser using IndexedDB. 
          This means your data persists even when offline, but it's tied to this browser and device.
        </p>
        <ul className="mt-3 text-blue-700 list-disc list-inside">
          <li>Regular exports are recommended for backup</li>
          <li>Use JSON export to transfer data to another device</li>
          <li>CSV export is useful for spreadsheet analysis</li>
          <li>Clearing browser data will delete your inventory</li>
        </ul>
      </div>
    </div>
  );
}

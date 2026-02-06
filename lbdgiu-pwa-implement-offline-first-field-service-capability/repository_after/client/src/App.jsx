import React, { useState } from 'react';
import SyncStatusIndicator from './components/SyncStatusIndicator';
import { purgeOldRecords, saveReportLocal } from './services/db';

function App() {
  const [isSaving, setIsSaving] = useState(false);

  // Run cleanup on mount
  React.useEffect(() => {
    purgeOldRecords();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData(e.target);
    const report = {
      id: crypto.randomUUID(),
      technician: formData.get('technician'),
      location: formData.get('location'),
      notes: formData.get('notes'),
      details: {
        equipmentStatus: formData.get('status'),
        timestamp: new Date().toISOString()
      }
    };

    try {
      // Save to IndexedDB
      await saveReportLocal(report);
      alert('Report saved locally! It will sync automatically when online.');
      e.target.reset();
    } catch (error) {
      console.error('Failed to save locally:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="app-container" style={{ padding: '20px', maxWidth: '600px' }}>
      <h1>Field Service Reporting</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <label>
          Technician Name:
          <input name="technician" required style={{ width: '100%', padding: '8px' }} />
        </label>

        <label>
          Job Location:
          <input name="location" required style={{ width: '100%', padding: '8px' }} />
        </label>

        <label>
          Equipment Status:
          <select name="status" style={{ width: '100%', padding: '8px' }}>
            <option value="operational">Operational</option>
            <option value="needs-repair">Needs Repair</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label>
          Work Notes:
          <textarea name="notes" rows="4" style={{ width: '100%', padding: '8px' }} />
        </label>

        <button
          type="submit"
          disabled={isSaving}
          style={{ padding: '10px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          {isSaving ? 'Saving...' : 'Save Report'}
        </button>
      </form>

      <SyncStatusIndicator />
    </div>
  );
}

export default App;
'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

interface RecoveryDialogProps {
  onRecover: () => Promise<void>;
  onDismiss: () => void;
}

export function RecoveryDialog({ onRecover, onDismiss }: RecoveryDialogProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryTime, setRecoveryTime] = useState<string>('');

  useEffect(() => {
    // Load recovery timestamp
    const loadRecoveryInfo = async () => {
      const recoveryState = await db.loadRecoveryState();
      if (recoveryState) {
        const date = new Date(recoveryState.timestamp);
        setRecoveryTime(date.toLocaleString());
      }
    };
    loadRecoveryInfo();
  }, []);

  const handleRecover = async () => {
    setIsRecovering(true);
    setError(null);
    try {
      await onRecover();
      await db.clearRecoveryState();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleDismiss = async () => {
    await db.clearRecoveryState();
    onDismiss();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="text-orange-500 flex-shrink-0" size={24} />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              Recovery Available
            </h2>
            <p className="text-gray-600 mb-2">
              We detected a previous session that may not have been saved properly.
            </p>
            {recoveryTime && (
              <p className="text-sm text-gray-500">
                Last saved: {recoveryTime}
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600"
            disabled={isRecovering}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleRecover}
            disabled={isRecovering}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRecovering ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Recovering...
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Recover Session
              </>
            )}
          </button>
          <button
            onClick={handleDismiss}
            disabled={isRecovering}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Dismiss
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Note: Choosing "Dismiss" will discard the recovery state and continue with the current database state.
        </p>
      </div>
    </div>
  );
}

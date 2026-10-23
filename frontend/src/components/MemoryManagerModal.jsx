import React, { useState, useEffect, useMemo } from 'react';
import {
  listMemories,
  createMemory,
  updateMemory,
  approveMemory,
  deleteMemory,
} from '../api/client';
import {
  broadcastMemoryMutated,
  subscribeToSyncEvents,
} from '../utils/crossTabSync.js';

const CATEGORY_META = {
  preference: {
    label: 'Preference',
    color: '#6366F1',
    bg: '#EEF2FF',
    darkBg: 'rgba(99, 102, 241, 0.15)',
    icon: '⚙️',
    description: 'Response styles, commute choices, alert thresholds',
  },
  health_environmental: {
    label: 'Health & Environmental',
    color: '#E11D48',
    bg: '#FFE4E6',
    darkBg: 'rgba(225, 29, 72, 0.15)',
    icon: '🫁',
    description: 'Asthma, allergies, vulnerabilities, sensitivity triggers',
  },
  location_reference: {
    label: 'Saved Location',
    color: '#0D9488',
    bg: '#CCFBF1',
    darkBg: 'rgba(13, 148, 136, 0.15)',
    icon: '📍',
    description: 'Home, work, school or transit landmark context',
  },
  routine_task: {
    label: 'Routine & Task',
    color: '#D97706',
    bg: '#FEF3C7',
    darkBg: 'rgba(217, 119, 6, 0.15)',
    icon: '🏃',
    description: 'Morning runs, school pick-ups, commute schedules',
  },
  approved_fact: {
    label: 'Approved Fact',
    color: '#2563EB',
    bg: '#DBEAFE',
    darkBg: 'rgba(37, 99, 235, 0.15)',
    icon: '✦',
    description: 'Explicit user-confirmed environmental facts',
  },
};

export default function MemoryManagerModal({
  isOpen,
  onClose,
  accessToken,
  isAuthenticated,
  userId,
  onOpenLogin,
}) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [storageMode, setStorageMode] = useState('guest'); // 'server' | 'guest' | 'offline_fallback'
  const [activeTab, setActiveTab] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newCategory, setNewCategory] = useState('preference');
  const [newFact, setNewFact] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);

  // Storage keys: server cache scoped to authenticated user ID
  const guestStorageKey = 'arise_guest_memories';
  const userMemoriesKey = userId ? `arise_user_memories_${userId}` : 'arise_server_memories_backup';

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  const fetchMemoriesList = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAuthenticated && accessToken) {
        const data = await listMemories(accessToken);
        const list = Array.isArray(data) ? data : [];
        setMemories(list);
        setStorageMode('server');
        try {
          localStorage.setItem(userMemoriesKey, JSON.stringify(list));
        } catch {}
      } else {
        const saved = localStorage.getItem(guestStorageKey);
        setMemories(saved ? JSON.parse(saved) : []);
        setStorageMode('guest');
      }
    } catch (err) {
      console.warn('Failed to load memories:', err);
      // Fallback to local storage if API call fails
      try {
        const backup = localStorage.getItem(userMemoriesKey) || localStorage.getItem('arise_server_memories_backup') || localStorage.getItem(guestStorageKey);
        setMemories(backup ? JSON.parse(backup) : []);
      } catch {}
      if (isAuthenticated) {
        setStorageMode('offline_fallback');
        setError(`Unable to reach server storage (${err.message || 'Network error'}). Operating in local offline fallback.`);
      } else {
        setStorageMode('guest');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMemoriesList();
    }
  }, [isOpen, isAuthenticated, accessToken, userId]);

  // Listen for cross-tab memory mutations and refresh
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeToSyncEvents((event) => {
      if (event.type === 'MEMORY_MUTATED') {
        if (!event.userId || event.userId === userId) {
          fetchMemoriesList();
        }
      }
    });
    return () => unsubscribe();
  }, [isOpen, userId, isAuthenticated, accessToken]);

  // Support Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const pendingCount = useMemo(() => {
    return memories.filter(m => m.status === 'pending_approval').length;
  }, [memories]);

  const filteredMemories = useMemo(() => {
    if (activeTab === 'all') return memories;
    if (activeTab === 'pending_approval') return memories.filter(m => m.status === 'pending_approval');
    return memories.filter(m => m.category === activeTab);
  }, [memories, activeTab]);

  const handleApprove = async (memoryId) => {
    setActionInProgress(true);
    setError(null);
    try {
      if (isAuthenticated && accessToken && storageMode === 'server') {
        await approveMemory(accessToken, memoryId);
        broadcastMemoryMutated({ action: 'APPROVE', memoryId, userId });
      }
      const updated = memories.map(m =>
        m.id === memoryId ? { ...m, status: 'approved', last_confirmed_at: new Date().toISOString() } : m
      );
      setMemories(updated);
      try {
        if (storageMode === 'server') {
          localStorage.setItem(userMemoriesKey, JSON.stringify(updated));
        } else {
          localStorage.setItem(guestStorageKey, JSON.stringify(updated));
        }
      } catch {}
      showSuccess('Fact approved for outdoor safety recommendations.');
    } catch (err) {
      console.warn('Approve memory failed:', err);
      setError('Failed to approve memory on server: ' + (err.message || 'Unknown error'));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDelete = async (memoryId) => {
    setActionInProgress(true);
    setError(null);
    try {
      if (isAuthenticated && accessToken && storageMode === 'server') {
        await deleteMemory(accessToken, memoryId);
        broadcastMemoryMutated({ action: 'DELETE', memoryId, userId });
      }
      const updated = memories.filter(m => m.id !== memoryId);
      setMemories(updated);
      try {
        if (storageMode === 'server') {
          localStorage.setItem(userMemoriesKey, JSON.stringify(updated));
        } else {
          localStorage.setItem(guestStorageKey, JSON.stringify(updated));
        }
      } catch {}
      showSuccess('Memory deleted successfully.');
    } catch (err) {
      console.warn('Delete memory failed:', err);
      setError('Failed to delete memory: ' + (err.message || 'Unknown error'));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleStartEdit = (memory) => {
    setEditingId(memory.id);
    setEditText(memory.content || memory.fact || '');
  };

  const handleSaveEdit = async (memoryId) => {
    if (!editText.trim()) return;
    setActionInProgress(true);
    setError(null);
    try {
      const trimmed = editText.trim();
      if (isAuthenticated && accessToken && storageMode === 'server') {
        await updateMemory(accessToken, memoryId, { content: trimmed, fact: trimmed });
        broadcastMemoryMutated({ action: 'UPDATE', memoryId, userId });
      }
      const updated = memories.map(m =>
        m.id === memoryId ? { ...m, content: trimmed, fact: trimmed, last_confirmed_at: new Date().toISOString() } : m
      );
      setMemories(updated);
      try {
        if (storageMode === 'server') {
          localStorage.setItem(userMemoriesKey, JSON.stringify(updated));
        } else {
          localStorage.setItem(guestStorageKey, JSON.stringify(updated));
        }
      } catch {}
      setEditingId(null);
      showSuccess('Memory updated successfully.');
    } catch (err) {
      console.warn('Update memory failed:', err);
      setError('Failed to update memory: ' + (err.message || 'Unknown error'));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCreateNew = async (e) => {
    e.preventDefault();
    const factText = newFact.trim();
    if (!factText) return;

    setActionInProgress(true);
    setError(null);
    try {
      if (isAuthenticated && accessToken && storageMode === 'server') {
        const created = await createMemory(accessToken, {
          category: newCategory,
          content: factText,
          fact: factText,
          confidence: 1.0,
        });
        const updated = [created, ...memories];
        setMemories(updated);
        try {
          localStorage.setItem(userMemoriesKey, JSON.stringify(updated));
        } catch {}
        broadcastMemoryMutated({ action: 'CREATE', memoryId: created?.id, userId });
        showSuccess('Memory saved successfully to your cloud account.');
      } else {
        const localItem = {
          id: 'mem_local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          user_id: isAuthenticated ? 'offline_user' : 'guest',
          category: newCategory,
          key: newCategory + '_' + factText.slice(0, 25).toLowerCase().replace(/[^\w]+/g, '_'),
          content: factText,
          fact: factText,
          confidence: 1.0,
          status: newCategory === 'health_environmental' ? 'pending_approval' : 'approved',
          source: 'user_explicit',
          created_at: new Date().toISOString(),
          last_confirmed_at: new Date().toISOString(),
          is_sensitive: newCategory === 'health_environmental',
        };
        const updated = [localItem, ...memories];
        setMemories(updated);
        try {
          localStorage.setItem(guestStorageKey, JSON.stringify(updated));
        } catch {}
        showSuccess('Memory saved to local storage on this device.');
      }

      // Clear input and close form ONLY on confirmed success
      setNewFact('');
      setIsAdding(false);
    } catch (err) {
      console.warn('Create memory failed:', err);
      // Preserve user's input so they do not lose entered content
      setError('Failed to save memory: ' + (err.message || 'Server error') + '. Your entered fact has been preserved.');
    } finally {
      setActionInProgress(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="memory-modal-title"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-5 sm:p-6 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-alt)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl font-black">
              📝
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="memory-modal-title" className="text-base sm:text-lg font-black t1 tracking-tight">
                  Personal Remarks &amp; Preferences
                </h2>
                {pendingCount > 0 && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    {pendingCount} Pending Review
                  </span>
                )}
                {storageMode === 'server' ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    ☁️ Server Storage
                  </span>
                ) : storageMode === 'offline_fallback' ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    ⚠️ Local Fallback (Offline)
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30 flex items-center gap-1">
                    💾 Local Storage (Device Only)
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold tm mt-0.5">
                Saved remarks (such as outdoor AQI thresholds and medical conditions) guide Ask Arise safety advice.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border flex items-center justify-center text-base t3 hover:t1 hover:bg-[var(--surface)] transition-all cursor-pointer"
            style={{ borderColor: 'var(--border)' }}
            aria-label="Close memory manager"
          >
            ✕
          </button>
        </div>

        {/* Success notification */}
        {successMessage && (
          <div className="px-5 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-1.5">
              <span>✓</span>
              <span>{successMessage}</span>
            </span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-xs font-bold hover:underline cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Sensitive Information Consent Banner */}
        {pendingCount > 0 && (
          <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-3 shrink-0">
            <span className="text-base mt-0.5">⚠️</span>
            <div className="text-xs font-medium text-amber-800 dark:text-amber-200 leading-relaxed flex-1">
              <strong className="font-bold">Pending Health or Sensitive Facts:</strong> Ask Arise detected personal details (like asthma triggers or specific route routines). Review and approve each item below to authorize Arise to use it in outdoor safety recommendations.
            </div>
          </div>
        )}

        {/* Tab Filters and Action Bar */}
        <div
          className="p-3 sm:px-6 border-b flex flex-wrap items-center justify-between gap-2 shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 't2 hover:bg-[var(--surface-alt)]'
              }`}
            >
              All ({memories.length})
            </button>
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('pending_approval')}
                className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'pending_approval'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20'
                }`}
              >
                <span>Pending ({pendingCount})</span>
              </button>
            )}
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const count = memories.filter(m => m.category === key).length;
              if (count === 0 && activeTab !== key) return null;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    activeTab === key
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 't2 hover:bg-[var(--surface-alt)]'
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="text-xs font-black px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
          >
            <span>{isAdding ? '✕ Cancel' : '+ Add Remark'}</span>
          </button>
        </div>

        {/* Add Remark Form */}
        {isAdding && (
          <form
            onSubmit={handleCreateNew}
            className="p-4 sm:p-5 border-b bg-[var(--surface-alt)] space-y-3 shrink-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold t2">Category:</label>
              <select
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                className="text-xs font-bold rounded-xl px-3 py-1.5 border outline-none cursor-pointer"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.icon} {meta.label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] font-medium tm">
                {CATEGORY_META[newCategory]?.description}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newFact}
                onChange={e => setNewFact(e.target.value)}
                placeholder='E.g. "Do not go out if AQI > 120" or "Have asthma/allergies, advise N95 precautions"'
                className="flex-1 rounded-xl px-3.5 py-2 text-xs font-semibold t1 border outline-none focus:ring-2 focus:ring-indigo-500/30"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                autoFocus
              />
              <button
                type="submit"
                disabled={actionInProgress || !newFact.trim()}
                className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Error notification */}
        {error && (
          <div className="px-5 py-2.5 bg-red-500/10 border-b border-red-500/20 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Memories Content List */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-3">
          {loading ? (
            <div className="text-center py-10 space-y-2">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs font-semibold tm">Loading stored memories...</p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div
              className="p-8 rounded-2xl border text-center flex flex-col items-center justify-center gap-2"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            >
              <span className="text-3xl">📭</span>
              <p className="text-sm font-bold t1">No memories found</p>
              <p className="text-xs font-medium tm max-w-sm">
                {activeTab === 'pending_approval'
                  ? 'All sensitive health and routine facts have been reviewed.'
                  : 'Ask Arise automatically extracts verified preferences during conversations, or you can add them manually above.'}
              </p>
            </div>
          ) : (
            filteredMemories.map(mem => {
              const meta = CATEGORY_META[mem.category] || CATEGORY_META.preference;
              const isPending = mem.status === 'pending_approval';
              const isEditing = editingId === mem.id;

              return (
                <div
                  key={mem.id}
                  className="p-4 rounded-2xl border transition-all space-y-2.5 shadow-2xs hover:shadow-xs"
                  style={{
                    background: 'var(--surface)',
                    borderColor: isPending ? 'rgba(217, 119, 6, 0.4)' : 'var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1"
                        style={{
                          background: meta.bg,
                          color: meta.color,
                        }}
                      >
                        <span>{meta.icon}</span>
                        <span>{meta.label}</span>
                      </span>

                      {isPending ? (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          ⏳ Pending Approval
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          ✓ Approved
                        </span>
                      )}

                      {mem.confidence && (
                        <span className="text-[10px] font-bold tm">
                          {Math.round(mem.confidence * 100)}% confidence
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => handleApprove(mem.id)}
                          disabled={actionInProgress}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-all active:scale-95 cursor-pointer"
                          title="Approve this fact for AI context"
                        >
                          ✓ Approve
                        </button>
                      )}

                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(mem)}
                          disabled={actionInProgress}
                          className="px-2 py-1 rounded-lg text-xs font-semibold t2 hover:t1 hover:bg-[var(--surface-alt)] border transition-all cursor-pointer"
                          style={{ borderColor: 'var(--border)' }}
                          title="Edit fact"
                        >
                          ✏️ Edit
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(mem.id)}
                        disabled={actionInProgress}
                        className="px-2 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                        title="Delete memory"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        className="flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold t1 border outline-none focus:ring-2 focus:ring-indigo-500/30"
                        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(mem.id)}
                        disabled={actionInProgress || !editText.trim()}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold t3 hover:t1 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs sm:text-sm font-semibold t1 leading-relaxed">
                      {mem.content || mem.fact}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[11px] font-medium tm pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                    <span>Source: {mem.source || 'conversation'}</span>
                    <span>
                      {mem.created_at ? new Date(mem.created_at).toLocaleDateString() : 'Active'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & privacy reassurance */}
        <div
          className="p-4 sm:px-6 border-t bg-[var(--surface-alt)] flex flex-wrap items-center justify-between gap-2 shrink-0 text-[11px] font-semibold tm"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">🔒</span>
            <span>Privacy Guard: Passwords, tokens &amp; flat numbers are strictly filtered before model delivery.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold border hover:bg-[var(--surface)] transition-all cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

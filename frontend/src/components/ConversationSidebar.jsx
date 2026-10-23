import React, { useState, useMemo } from 'react';

export default function ConversationSidebar({
  conversations = [],
  activeConversationId = null,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onTogglePinConversation,
  onToggleArchiveConversation,
  onDeleteConversation,
  onOpenMemoryManager,
  pendingMemoriesCount = 0,
  totalMemoriesCount = 0,
  isOpen = true,
  onToggleSidebar,
  isAuthenticated = false,
  loading = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // Archive filter
      if (!showArchived && conv.is_archived) return false;
      if (showArchived && !conv.is_archived) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = (conv.title || '').toLowerCase();
        const preview = (conv.last_message_preview || '').toLowerCase();
        return title.includes(q) || preview.includes(q);
      }
      return true;
    });
  }, [conversations, searchQuery, showArchived]);

  const { pinned, recent } = useMemo(() => {
    const p = [];
    const r = [];
    filteredConversations.forEach(c => {
      if (c.is_pinned) p.push(c);
      else r.push(c);
    });
    return { pinned: p, recent: r };
  }, [filteredConversations]);

  const handleStartRename = (conv, e) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title || 'Untitled');
  };

  const handleSaveRename = (convId, e) => {
    e?.stopPropagation();
    if (editTitle.trim()) {
      onRenameConversation?.(convId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDownRename = (convId, e) => {
    if (e.key === 'Enter') {
      handleSaveRename(convId, e);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  if (!isOpen) {
    return (
      <aside
        aria-label="Ask Arise Sidebar Collapsed"
        className="w-12 border-r hidden md:flex flex-col items-center py-3.5 gap-3 shrink-0 select-none transition-all h-full"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <button
          type="button"
          onClick={onToggleSidebar}
          id="btn-sidebar-expand"
          className="w-8 h-8 rounded-xl border flex items-center justify-center text-xs font-bold t2 hover:t1 hover:bg-[var(--surface-alt)] transition-all cursor-pointer shadow-2xs"
          style={{ borderColor: 'var(--border)' }}
          title="Open Conversation History"
          aria-label="Expand sidebar"
        >
          ▶
        </button>

        <button
          type="button"
          onClick={onNewChat}
          id="btn-new-chat-collapsed"
          className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-black shadow-xs hover:bg-indigo-500 transition-all cursor-pointer active:scale-95"
          title="New Conversation"
          aria-label="New chat"
        >
          +
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onOpenMemoryManager}
          id="btn-open-memory-collapsed"
          className="w-8 h-8 rounded-xl border flex items-center justify-center text-sm font-black relative hover:bg-[var(--surface-alt)] transition-all cursor-pointer"
          style={{ borderColor: 'var(--border)' }}
          title={`Remarks & Preferences (${totalMemoriesCount} saved remarks)`}
          aria-label="Open Remarks"
        >
          <span>📝</span>
          {pendingMemoriesCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-[var(--surface)] animate-pulse" />
          )}
        </button>
      </aside>
    );
  }

  const renderItem = (conv) => {
    const isActive = conv.id === activeConversationId;
    const isEditing = editingId === conv.id;

    return (
      <div
        key={conv.id}
        onClick={() => onSelectConversation(conv.id)}
        className={`group relative p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 select-none ${
          isActive
            ? 'bg-indigo-500/10 border-indigo-500/40 shadow-2xs'
            : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-alt)]'
        }`}
      >
        <div className="flex items-center justify-between gap-1.5">
          {isEditing ? (
            <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => handleKeyDownRename(conv.id, e)}
                onBlur={e => handleSaveRename(conv.id, e)}
                autoFocus
                className="w-full text-xs font-bold px-2 py-0.5 rounded-lg border outline-none bg-[var(--surface)] text-[var(--text-primary)]"
                style={{ borderColor: 'var(--border)' }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {conv.is_pinned && (
                <span className="text-[11px] text-indigo-500 shrink-0" title="Pinned conversation">
                  📌
                </span>
              )}
              <span
                className={`text-xs font-bold truncate flex-1 ${
                  isActive ? 'text-indigo-600 dark:text-indigo-400' : 't1'
                }`}
                title={conv.title}
              >
                {conv.title || 'Untitled Conversation'}
              </span>
            </div>
          )}

          {/* Quick Action Icons on hover */}
          {!isEditing && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 animate-in fade-in duration-100">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onTogglePinConversation?.(conv.id, !conv.is_pinned);
                }}
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] t3 hover:t1 hover:bg-[var(--surface)] cursor-pointer"
                title={conv.is_pinned ? 'Unpin' : 'Pin to top'}
              >
                📌
              </button>
              <button
                type="button"
                onClick={e => handleStartRename(conv, e)}
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] t3 hover:t1 hover:bg-[var(--surface)] cursor-pointer"
                title="Rename conversation"
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onToggleArchiveConversation?.(conv.id, !conv.is_archived);
                }}
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] t3 hover:t1 hover:bg-[var(--surface)] cursor-pointer"
                title={conv.is_archived ? 'Restore from archive' : 'Archive conversation'}
              >
                📦
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onDeleteConversation?.(conv.id);
                }}
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] text-red-500 hover:bg-red-500/15 cursor-pointer"
                title="Delete conversation"
              >
                🗑️
              </button>
            </div>
          )}
        </div>

        {/* Snippet / timestamp */}
        <div className="flex items-center justify-between text-[10px] font-medium tm">
          <span className="truncate max-w-[120px]">
            {conv.last_message_preview || 'No messages yet'}
          </span>
          <span>
            {conv.updated_at ? new Date(conv.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop overlay (<md) */}
      <div
        className="md:hidden fixed top-16 bottom-14 inset-x-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity"
        onClick={onToggleSidebar}
        aria-hidden="true"
      />
      <aside
        aria-label="Ask Arise Conversations"
        className="fixed top-16 bottom-14 left-0 z-40 w-72 max-w-[85vw] shadow-2xl md:shadow-none md:static md:top-auto md:bottom-auto md:z-auto md:w-68 lg:w-72 border-r flex flex-col shrink-0 select-none transition-all duration-200 h-auto md:h-full min-h-0"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
      {/* Top Bar: Title + Collapse + New Chat */}
      <div className="p-3 border-b space-y-2.5 shrink-0" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black t1 tracking-tight">Conversations</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--surface-alt)] border t3" style={{ borderColor: 'var(--border)' }}>
              {conversations.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleSidebar}
              id="btn-sidebar-collapse"
              className="w-7 h-7 rounded-lg border flex items-center justify-center text-xs t3 hover:t1 hover:bg-[var(--surface-alt)] transition-all cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
              title="Collapse Sidebar"
              aria-label="Collapse sidebar"
            >
              ◀
            </button>
          </div>
        </div>

        {/* New Chat Button */}
        <button
          type="button"
          id="btn-new-chat"
          onClick={onNewChat}
          className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
        >
          <span className="text-sm leading-none">+</span>
          <span>New Conversation</span>
        </button>

        {/* Search Conversations Input */}
        <div className="relative">
          <input
            id="input-search-conversations"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border outline-none pr-7 transition-all focus:ring-1 focus:ring-indigo-500/30"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1.5 text-xs font-bold t3 hover:t1 cursor-pointer"
              title="Clear search"
            >
              ✕
            </button>
          ) : (
            <span className="absolute right-2 top-1.5 text-xs tm pointer-events-none">🔍</span>
          )}
        </div>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 min-h-0">
        {loading ? (
          <div className="text-center py-8 space-y-2">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto" />
            <span className="text-[11px] font-semibold tm">Loading history...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 rounded-xl border text-center my-4 space-y-1" style={{ borderColor: 'var(--border)', background: 'var(--surface-alt)' }}>
            <span className="text-xl">💬</span>
            <p className="text-xs font-bold t1">No chats found</p>
            <p className="text-[11px] font-medium tm">
              {searchQuery ? 'Try a different search keyword.' : 'Start a new conversation to save it here.'}
            </p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 px-1">
                  Pinned
                </span>
                <div className="space-y-1">{pinned.map(renderItem)}</div>
              </div>
            )}

            {recent.length > 0 && (
              <div className="space-y-1">
                {pinned.length > 0 && (
                  <span className="text-[10px] font-black uppercase tracking-wider t3 px-1 pt-2 block">
                    Recent
                  </span>
                )}
                <div className="space-y-1">{recent.map(renderItem)}</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Area: Archive Toggle & Memory Manager */}
      <div className="p-2.5 border-t space-y-2 shrink-0 bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
        {/* Toggle Archived Chats */}
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className="w-full text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center justify-between transition-all cursor-pointer hover:bg-[var(--surface)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <span className="flex items-center gap-1.5">
            <span>📦</span>
            <span>{showArchived ? 'Hide Archived' : 'Show Archived'}</span>
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--surface)] border" style={{ borderColor: 'var(--border)' }}>
            {conversations.filter(c => c.is_archived).length}
          </span>
        </button>

        {/* Remarks Button with Badges */}
        <button
          type="button"
          id="btn-open-memory-sidebar"
          onClick={onOpenMemoryManager}
          className="w-full p-2 rounded-xl border flex items-center justify-between transition-all hover:border-indigo-400 cursor-pointer shadow-2xs group"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          title="Open Remarks, Health Conditions & Outdoor Thresholds"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black">
              📝
            </div>
            <div className="text-left">
              <span className="text-xs font-black t1 block leading-tight">Remarks</span>
              <span className="text-[10px] font-semibold tm">
                {totalMemoriesCount} {totalMemoriesCount === 1 ? 'remark' : 'remarks'} saved
              </span>
            </div>
          </div>

          {pendingMemoriesCount > 0 ? (
            <span
              className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 animate-pulse"
              title={`${pendingMemoriesCount} facts pending approval`}
            >
              {pendingMemoriesCount} review
            </span>
          ) : (
            <span className="text-xs t3 group-hover:t1">⚙️</span>
          )}
        </button>

        {/* Storage State Indicator */}
        <div className="pt-0.5 px-1 flex items-center justify-between text-[10px] font-bold tm select-none">
          <span>Storage</span>
          {isAuthenticated ? (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1" title="Conversations & memories synced with server account">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              <span>Server-Synced</span>
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1" title="Stored on this browser device only">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              <span>Local Device</span>
            </span>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}

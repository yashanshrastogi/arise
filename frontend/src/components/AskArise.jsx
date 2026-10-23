import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  askAriseChat,
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  listMemories,
} from '../api/client';
import { isEnvironmentalQuery, getOutOfScopeGuardrailResponse } from '../utils/guardrails';
import FormattedBotText from './FormattedBotText';
import { useAuth } from '../auth/AuthContext';
import ConversationSidebar from './ConversationSidebar';
import MemoryManagerModal from './MemoryManagerModal';
import { speakText, stopSpeech, buildSpeechText, isSpeechSynthesisSupported } from '../utils/speechUtils';
import { shareAdvisoryCard } from '../utils/shareUtils';
import { formatKolkataTime } from '../utils/timeContext';
import {
  SCROLL_TOLERANCE,
  checkIsAtBottom,
  shouldShowNewestButton,
  resolveAskAriseLayoutFeatures,
} from '../utils/askLayoutState';
import {
  subscribeToSyncEvents,
  broadcastConversationMutated,
  broadcastMemoryMutated,
} from '../utils/crossTabSync.js';


export {
  SCROLL_TOLERANCE,
  checkIsAtBottom,
  shouldShowNewestButton,
  resolveAskAriseLayoutFeatures,
};

const DEFAULT_CHIPS = [
  "Can I go out now?",
  "Can my kid play outside?",
  "Why is the AQI bad today?",
  "Best time for a morning jog?",
];

const VERDICT_COLORS = {
  STAY_IN: '#E5484D',
  'STAY IN': '#E5484D',
  CUT_BACK: '#F28C28',
  'CUT BACK': '#F28C28',
  BE_SMART: '#F5C542',
  'BE SMART': '#F5C542',
  GO: '#2EB872',
};

const PIPELINE_STAGES = [
  { id: '1', name: 'Question', desc: 'Understanding your question' },
  { id: '2', name: 'Conditions', desc: 'Checking local stations & wind' },
  { id: '3', name: 'Guidance', desc: 'Reviewing safety guidelines' },
  { id: '4', name: 'Verified', desc: 'Ready with answer' },
];

export function isPracticalWindow(windowStr) {
  if (!windowStr || typeof windowStr !== 'string') return false;
  const lower = windowStr.toLowerCase().trim();
  if (lower.includes('no recommended') || lower.includes('unavailable') || lower.includes('check') || lower === 'later' || lower === 'now') {
    return false;
  }
  // Overnight hours that make no practical sense for outdoor activity
  const overnight = ['12 am', '1 am', '2 am', '3 am', '4 am', '5 am', '10 pm', '11 pm', 'midnight'];
  return !overnight.some(h => lower.includes(h));
}

export function extractCleanEvidence(sources = [], dataCategories = []) {
  const seen = new Set();
  const list = [];
  const rawList = [...(sources || []), ...(dataCategories || [])];
  for (const raw of rawList) {
    if (!raw) continue;
    let text = String(raw).trim();
    if (/arise assistant|arise copilot|rule-based/i.test(text)) continue;
    text = text.replace(/\s*\([^)]*\)/g, '').trim();
    if (/cpcb|openaq|ground|telemetry|station/i.test(text)) {
      text = 'Ground Monitors';
    } else if (/meteo|weather|wind|atmospheric/i.test(text)) {
      text = 'Weather & Wind';
    } else if (/firms|satellite|fire|thermal|hotspot/i.test(text)) {
      text = 'Satellite Hotspots';
    } else if (/memory|context|profile|preference/i.test(text)) {
      text = 'Saved Preferences';
    } else if (/cams|model|forecast/i.test(text)) {
      text = 'Dispersion Models';
    }

    if (text && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      list.push(text);
    }
  }
  return list;
}

function TypewriterText({ text = '', onComplete }) {
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    setDisplayedLength(0);
    if (!text) {
      if (onComplete) onComplete();
      return;
    }
    let current = 0;
    const interval = setInterval(() => {
      current += 3;
      if (current >= text.length) {
        setDisplayedLength(text.length);
        clearInterval(interval);
        if (onComplete) onComplete();
      } else {
        setDisplayedLength(current);
      }
    }, 12);

    return () => clearInterval(interval);
  }, [text, onComplete]);

  const displayed = text.slice(0, displayedLength);
  const isTyping = displayedLength < text.length;

  return (
    <span>
      <FormattedBotText text={displayed} />
      {isTyping && <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-500 animate-pulse align-middle" />}
    </span>
  );
}

function formatMessageTimestamp(ts) {
  if (!ts) return formatKolkataTime(new Date());
  if (typeof ts === 'string' && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(ts.trim())) {
    return ts.trim();
  }
  const d = new Date(ts);
  if (!isNaN(d.getTime())) {
    return formatKolkataTime(d);
  }
  return formatKolkataTime(new Date());
}

export default function AskArise({
  lat = 28.6139,
  lon = 77.2090,
  demo = false,
  persona = 'General Public',
  locationName = null,
  userProfile = null,
  environmentalContext = null,
}) {
  const { user, isAuthenticated, accessToken, loading: authLoading } = useAuth();

  // Authoritative identity for persistent storage isolation (honors canonical identity across linked logins)
  const canonicalId = userProfile?.canonical_user_id;
  const authUserId = isAuthenticated && (canonicalId || user?.id)
    ? (canonicalId || user.id)
    : (isAuthenticated && user?.email ? user.email : null);
  const userScope = authUserId || (authLoading ? 'loading' : 'guest');

  // Storage keys: strictly isolated per authenticated user account
  const userConvCacheKey = authUserId ? `arise_user_convs_${authUserId}` : null;
  const userMemCacheKey = authUserId ? `arise_user_memories_${authUserId}` : null;
  const guestChatKey = `arise_chat_history_${userScope}`;
  const guestConversationsKey = authUserId ? `arise_user_convs_${authUserId}` : 'arise_guest_conversations';
  const activeConvSessionKey = `arise_active_conv_${authUserId || 'guest'}`;


  // Layout & Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const prevWidthRef = useRef(typeof window !== 'undefined' ? window.innerWidth : 1024);

  // Auto-adapt sidebar on viewport breakpoint transitions
  useEffect(() => {
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      if (prevWidthRef.current >= 768 && currentWidth < 768) {
        setIsSidebarOpen(false);
      } else if (prevWidthRef.current < 768 && currentWidth >= 768) {
        setIsSidebarOpen(true);
      }
      prevWidthRef.current = currentWidth;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Conversations & Messages state
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [activeTitle, setActiveTitle] = useState('New Conversation');
  const [messages, setMessages] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);

  // Stop active speech synthesis when navigating away or unmounting
  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  // Scroll window to top on mount so tab navigation from Today never lands on footer
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, []);

  // Sharing & Typewriter state
  const [sharingIndex, setSharingIndex] = useState(null);
  const [shareToast, setShareToast] = useState(null);
  const [typingMessageIndex, setTypingMessageIndex] = useState(null);

  const handleShareCard = async (m, idx) => {
    setSharingIndex(idx);
    try {
      const turnEl = typeof document !== 'undefined'
        ? (document.getElementById(`chat-turn-${idx}`) || document.querySelector(`[data-chat-turn="${idx}"]`))
        : null;

      const res = await shareAdvisoryCard({
        element: turnEl,
        question: m.q,
        verdict: m.verdict,
        headline: m.headline,
        why: m.why,
        doActions: m.do,
        locationName: locationName || 'Delhi-NCR',
        timestamp: formatMessageTimestamp(m.timestamp),
      });
      if (res.success) {
        setShareToast(res.method === 'download' ? 'Conversation image downloaded!' : 'Conversation shared!');
        setTimeout(() => setShareToast(null), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSharingIndex(null);
    }
  };

  // Memory counts for sidebar badges
  const [totalMemoriesCount, setTotalMemoriesCount] = useState(0);
  const [pendingMemoriesCount, setPendingMemoriesCount] = useState(0);

  // Input & Querying state
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activePipelineStageIndex, setActivePipelineStageIndex] = useState(0);
  const [lastFailedQuery, setLastFailedQuery] = useState(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const fetchSeqRef = useRef(0);
  const activeConversationIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Load Memories Summary (total & pending)
  const refreshMemoryCounts = useCallback(async () => {
    if (authLoading) return;

    try {
      if (isAuthenticated && accessToken) {
        const list = await listMemories(accessToken);
        if (Array.isArray(list)) {
          setTotalMemoriesCount(list.length);
          setPendingMemoriesCount(list.filter(m => m.status === 'pending_approval').length);
          if (userMemCacheKey) {
            try {
              localStorage.setItem(userMemCacheKey, JSON.stringify(list));
            } catch {}
          }
          return;
        }
      }

      // Guest fallback
      if (!isAuthenticated) {
        const saved = localStorage.getItem('arise_guest_memories');
        const parsed = saved ? JSON.parse(saved) : [];
        setTotalMemoriesCount(parsed.length);
        setPendingMemoriesCount(parsed.filter(m => m.status === 'pending_approval').length);
      }
    } catch (err) {
      console.warn('Failed to refresh memory counts:', err.message || err);
      // When network fails, do NOT zero out memory counts if cached data exists!
      if (isAuthenticated && userMemCacheKey) {
        try {
          const cached = localStorage.getItem(userMemCacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              setTotalMemoriesCount(parsed.length);
              setPendingMemoriesCount(parsed.filter(m => m.status === 'pending_approval').length);
            }
          }
        } catch {}
      }
    }
  }, [isAuthenticated, accessToken, authLoading, userMemCacheKey]);

  // Load Conversations list (resilient & cross-tab coordinated)
  const loadConversationsList = useCallback(async ({ silent = false } = {}) => {
    if (authLoading) {
      setConversationsLoading(true);
      return conversations;
    }

    const seq = ++fetchSeqRef.current;
    if (!silent) setConversationsLoading(true);

    try {
      if (isAuthenticated && accessToken) {
        const list = await listConversations(accessToken, { limit: 50 });
        if (seq !== fetchSeqRef.current) return conversations;

        if (Array.isArray(list)) {
          setConversations(list);
          if (userConvCacheKey) {
            try {
              localStorage.setItem(userConvCacheKey, JSON.stringify(list));
            } catch {}
          }
          return list;
        }
      }

      // Guest fallback
      if (!isAuthenticated) {
        const saved = localStorage.getItem(guestConversationsKey);
        const list = saved ? JSON.parse(saved) : [];
        if (seq === fetchSeqRef.current) {
          setConversations(list);
        }
        return list;
      }
    } catch (err) {
      console.warn('Failed to fetch conversations from server:', err.message || err);
      if (seq !== fetchSeqRef.current) return conversations;

      // Resilient: Never wipe conversations on network error!
      if (isAuthenticated && userConvCacheKey) {
        try {
          const cached = localStorage.getItem(userConvCacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setConversations(parsed);
              return parsed;
            }
          }
        } catch {}
      }
      return conversations;
    } finally {
      if (seq === fetchSeqRef.current && !silent) {
        setConversationsLoading(false);
      }
    }
  }, [isAuthenticated, accessToken, authLoading, userConvCacheKey, guestConversationsKey, conversations]);

  // Track previous authenticated user ID to handle account switching
  const prevUserIdRef = useRef(authUserId);

  // Initialize conversations and memories on mount or auth change
  useEffect(() => {
    if (authLoading) {
      setConversationsLoading(true);
      return;
    }

    // Handle account switching: clean previous user state only if switching to a different user
    const isSameLinkedIdentity =
      prevUserIdRef.current &&
      authUserId &&
      (prevUserIdRef.current === authUserId ||
        (Array.isArray(userProfile?.linked_user_ids) &&
          userProfile.linked_user_ids.includes(prevUserIdRef.current) &&
          userProfile.linked_user_ids.includes(authUserId)));

    if (prevUserIdRef.current !== authUserId && !isSameLinkedIdentity) {
      prevUserIdRef.current = authUserId;
      setConversations([]);
      setMessages([]);
      setActiveConversationId(null);
    } else if (prevUserIdRef.current !== authUserId) {
      prevUserIdRef.current = authUserId;
    }


    refreshMemoryCounts();
    const savedActiveId = sessionStorage.getItem(activeConvSessionKey);

    loadConversationsList().then(list => {
      if (savedActiveId && Array.isArray(list) && list.some(c => c.id === savedActiveId)) {
        handleSelectConversation(savedActiveId);
      } else if (Array.isArray(list) && list.length > 0) {
        handleSelectConversation(list[0].id);
      } else {
        // Fresh state with unique conversation ID
        const newConvId = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        setActiveConversationId(newConvId);
        setActiveTitle('New Conversation');
        setMessages([]);
        try {
          sessionStorage.setItem(activeConvSessionKey, newConvId);
        } catch {}
      }
    });
  }, [isAuthenticated, accessToken, authLoading, authUserId, activeConvSessionKey]);

  // Subscribe to real-time cross-tab mutation events
  useEffect(() => {
    const unsubscribe = subscribeToSyncEvents(async (event) => {
      if (!event) return;

      if (event.type === 'CONVERSATION_MUTATED') {
        const matchesUser = (!event.userId && !authUserId) || (event.userId === authUserId);
        if (!matchesUser) return;

        const updatedList = await loadConversationsList({ silent: true });

        // If the active conversation in this tab was updated with a new message, refresh messages
        if (event.conversationId && event.conversationId === activeConversationIdRef.current) {
          if (event.action === 'MESSAGE' || event.action === 'UPDATE') {
            handleSelectConversation(event.conversationId, { silent: true });
          } else if (event.action === 'DELETE') {
            if (Array.isArray(updatedList) && updatedList.length > 0) {
              handleSelectConversation(updatedList[0].id);
            } else {
              handleNewChat();
            }
          }
        }
      } else if (event.type === 'MEMORY_MUTATED') {
        const matchesUser = (!event.userId && !authUserId) || (event.userId === authUserId);
        if (matchesUser) {
          refreshMemoryCounts();
        }
      }
    });

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (!authLoading) {
          loadConversationsList({ silent: true });
          refreshMemoryCounts();
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      unsubscribe();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [authUserId, authLoading, loadConversationsList, refreshMemoryCounts]);


  // Scroll & Newest button tracking refs
  const isAtBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(messages.length);
  const prevLoadingRef = useRef(loading);
  const prevActiveConvIdRef = useRef(activeConversationId);

  // Scroll to bottom smoothly within the chat container only
  const scrollToBottom = useCallback((smooth = true) => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      isAtBottomRef.current = true;
    }
    setShowScrollBottom(false);
  }, []);

  // Update button visibility and track whether user is at bottom on scroll
  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    if (!el) return;
    const isBottom = checkIsAtBottom(el, SCROLL_TOLERANCE);
    isAtBottomRef.current = isBottom;
    setShowScrollBottom(
      shouldShowNewestButton({
        messagesLength: messages.length,
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        tolerance: SCROLL_TOLERANCE,
      })
    );
  }, [messages.length]);

  // Handle incoming messages and loading transitions
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;

    const messagesChanged = messages.length !== prevMessagesLengthRef.current;
    const loadingChanged = loading !== prevLoadingRef.current;
    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;
    prevLoadingRef.current = loading;

    if (messages.length === 0) {
      setShowScrollBottom(false);
      isAtBottomRef.current = true;
      return;
    }

    if (messagesChanged || loadingChanged) {
      // Auto-follow latest reply only if user was already at the bottom
      if (isAtBottomRef.current) {
        scrollToBottom(true);
      } else if (isNewMessage) {
        // User was reading older content: do NOT interrupt! Keep reading position and show Newest button
        setShowScrollBottom(true);
      }
    }
  }, [messages.length, loading, scrollToBottom]);

  // Reset scroll position to bottom when switching conversation
  useEffect(() => {
    if (activeConversationId !== prevActiveConvIdRef.current) {
      prevActiveConvIdRef.current = activeConversationId;
      isAtBottomRef.current = true;
      setShowScrollBottom(false);
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      } else {
        scrollToBottom(false);
      }
    }
  }, [activeConversationId, scrollToBottom]);

  // ResizeObserver and window resize listener to maintain accurate scroll state
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;

    const updateScrollState = () => {
      if (!chatScrollRef.current) return;
      const isBottom = checkIsAtBottom(chatScrollRef.current, SCROLL_TOLERANCE);
      isAtBottomRef.current = isBottom;
      setShowScrollBottom(
        shouldShowNewestButton({
          messagesLength: messages.length,
          scrollTop: chatScrollRef.current.scrollTop,
          scrollHeight: chatScrollRef.current.scrollHeight,
          clientHeight: chatScrollRef.current.clientHeight,
          tolerance: SCROLL_TOLERANCE,
        })
      );
    };

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (!chatScrollRef.current) return;
        if (isAtBottomRef.current) {
          chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight });
        }
        updateScrollState();
      });
      resizeObserver.observe(el);
      if (el.firstElementChild) {
        resizeObserver.observe(el.firstElementChild);
      }
    }

    const handleWindowResize = () => {
      updateScrollState();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [messages.length]);

  // Read aloud / Speech Synthesis toggle
  const handleToggleReadAloud = (msg, index) => {
    if (speakingIndex === index) {
      stopSpeech();
      setSpeakingIndex(null);
      return;
    }

    const text = buildSpeechText(msg);
    if (!text) return;

    setSpeakingIndex(index);
    speakText(text, {
      onStart: () => setSpeakingIndex(index),
      onEnd: () => setSpeakingIndex(null),
      onError: () => setSpeakingIndex(null),
    });
  };

  // Select a conversation and load its messages
  // Select a conversation and load its messages
  const handleSelectConversation = async (convId) => {
    if (!convId) return;
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    stopSpeech();
    setSpeakingIndex(null);
    setActiveConversationId(convId);
    try {
      if (activeConvSessionKey) {
        sessionStorage.setItem(activeConvSessionKey, convId);
      }
    } catch {}

    const msgCacheKey = authUserId ? `arise_conv_msg_${authUserId}_${convId}` : `arise_conv_msg_${convId}`;

    try {
      if (isAuthenticated && accessToken) {
        const detail = await getConversation(accessToken, convId);
        if (detail) {
          setActiveTitle(detail.title || 'Conversation');
          // Format backend messages to UI structure
          const formatted = [];
          const rawMsgs = detail.messages || [];
          for (let i = 0; i < rawMsgs.length; i++) {
            const m = rawMsgs[i];
            if (m.role === 'user') {
              const asst = rawMsgs[i + 1] && rawMsgs[i + 1].role === 'assistant' ? rawMsgs[i + 1] : null;
              formatted.push({
                q: m.content,
                verdict: asst?.verdict ? asst.verdict.replace('_', ' ') : 'BE SMART',
                headline: asst?.headline || asst?.metadata?.headline || asst?.content || '',
                why: asst?.why || asst?.metadata?.why || [],
                do: asst?.do || asst?.metadata?.do || [],
                best_window: asst?.best_window || asst?.metadata?.best_window || null,
                recheck_at: asst?.recheck_at || asst?.metadata?.recheck_at || null,
                sources: asst?.sources || [],
                assistant_label: asst?.assistant_label || asst?.metadata?.assistant_label || (asst?.is_rule_based ? 'Arise Rule-Based Engine' : 'Arise Environmental Intelligence'),
                is_rule_based: asst?.is_rule_based || asst?.metadata?.is_rule_based || false,
                timestamp: asst?.timestamp ? new Date(asst.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Saved',
                data_used_categories: asst?.stage_metadata?.data_used_categories || asst?.evaluation_metadata?.data_used_categories || asst?.metadata?.data_used_categories || [],
                evaluator_verdict: asst?.evaluation_metadata?.evaluator_verdict || asst?.metadata?.evaluator_verdict || null,
              });
              if (asst) i++; // skip assistant msg
            }
          }
          setMessages(formatted);
          try {
            localStorage.setItem(msgCacheKey, JSON.stringify(formatted));
          } catch {}
          return;
        }
      }

      // Guest / local storage fallback
      const saved = localStorage.getItem(msgCacheKey) || localStorage.getItem(`arise_conv_msg_${convId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setMessages(Array.isArray(parsed) ? parsed : []);
        } catch {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }

      const guestListSaved = localStorage.getItem(guestConversationsKey);
      if (guestListSaved) {
        try {
          const list = JSON.parse(guestListSaved);
          const found = list.find(c => c.id === convId);
          if (found) setActiveTitle(found.title || 'Conversation');
        } catch {}
      }
    } catch (err) {
      console.warn('Failed to load conversation details:', err);
      // Fallback to local cached messages without clearing
      const saved = localStorage.getItem(msgCacheKey) || localStorage.getItem(`arise_conv_msg_${convId}`);
      if (saved) {
        try {
          setMessages(JSON.parse(saved));
        } catch {}
      }
    }
  };

  // Start a new chat
  const handleNewChat = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    stopSpeech();
    setSpeakingIndex(null);
    const newConvId = 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    setActiveConversationId(newConvId);
    setActiveTitle('New Conversation');
    setMessages([]);
    setLastFailedQuery(null);
    try {
      if (activeConvSessionKey) {
        sessionStorage.setItem(activeConvSessionKey, newConvId);
      }
    } catch {}
  };

  // Rename a conversation
  const handleRenameConversation = async (convId, newTitle) => {
    try {
      if (isAuthenticated && accessToken) {
        await updateConversation(accessToken, convId, { title: newTitle });
        broadcastConversationMutated({ action: 'RENAME', conversationId: convId, title: newTitle, userId: authUserId });
      }
      setConversations(prev => {
        const next = prev.map(c => (c.id === convId ? { ...c, title: newTitle } : c));
        if (userConvCacheKey) {
          try { localStorage.setItem(userConvCacheKey, JSON.stringify(next)); } catch {}
        }
        return next;
      });
      if (activeConversationId === convId) {
        setActiveTitle(newTitle);
      }
      // Update local storage
      const saved = localStorage.getItem(guestConversationsKey);
      if (saved) {
        const list = JSON.parse(saved).map(c => (c.id === convId ? { ...c, title: newTitle } : c));
        localStorage.setItem(guestConversationsKey, JSON.stringify(list));
      }
    } catch (err) {
      console.warn('Rename conversation failed:', err);
    }
  };

  // Toggle pin
  const handleTogglePin = async (convId, isPinned) => {
    try {
      if (isAuthenticated && accessToken) {
        await updateConversation(accessToken, convId, { is_pinned: isPinned });
        broadcastConversationMutated({ action: 'PIN', conversationId: convId, isPinned, userId: authUserId });
      }
      setConversations(prev => {
        const next = prev.map(c => (c.id === convId ? { ...c, is_pinned: isPinned } : c));
        if (userConvCacheKey) {
          try { localStorage.setItem(userConvCacheKey, JSON.stringify(next)); } catch {}
        }
        return next;
      });
    } catch (err) {
      console.warn('Toggle pin failed:', err);
    }
  };

  // Toggle archive
  const handleToggleArchive = async (convId, isArchived) => {
    try {
      if (isAuthenticated && accessToken) {
        await updateConversation(accessToken, convId, { is_archived: isArchived });
        broadcastConversationMutated({ action: 'ARCHIVE', conversationId: convId, isArchived, userId: authUserId });
      }
      setConversations(prev => {
        const next = prev.map(c => (c.id === convId ? { ...c, is_archived: isArchived } : c));
        if (userConvCacheKey) {
          try { localStorage.setItem(userConvCacheKey, JSON.stringify(next)); } catch {}
        }
        return next;
      });
    } catch (err) {
      console.warn('Toggle archive failed:', err);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (convId) => {
    try {
      if (isAuthenticated && accessToken) {
        await deleteConversation(accessToken, convId);
        broadcastConversationMutated({ action: 'DELETE', conversationId: convId, userId: authUserId });
      }
      setConversations(prev => {
        const next = prev.filter(c => c.id !== convId);
        if (userConvCacheKey) {
          try { localStorage.setItem(userConvCacheKey, JSON.stringify(next)); } catch {}
        }
        return next;
      });
      if (activeConversationId === convId) {
        handleNewChat();
      }
      // Clean guest storage
      const saved = localStorage.getItem(guestConversationsKey);
      if (saved) {
        const list = JSON.parse(saved).filter(c => c.id !== convId);
        localStorage.setItem(guestConversationsKey, JSON.stringify(list));
      }
      const msgKey = authUserId ? `arise_conv_msg_${authUserId}_${convId}` : `arise_conv_msg_${convId}`;
      localStorage.removeItem(msgKey);
      localStorage.removeItem(`arise_conv_msg_${convId}`);
    } catch (err) {
      console.warn('Delete conversation failed:', err);
    }
  };

  // Clear current active chat
  const handleClearChat = () => {
    stopSpeech();
    setSpeakingIndex(null);
    setMessages([]);
    if (activeConversationId) {
      handleDeleteConversation(activeConversationId);
    } else {
      try {
        localStorage.removeItem(guestChatKey);
      } catch {}
    }
  };

  const handleOpenLogin = () => {
    window.location.hash = '#/login';
  };

  const handleOpenSignUp = () => {
    window.location.hash = '#/signup';
  };

  const userCtx = useMemo(() => {
    if (!userProfile) return null;
    return {
      home: userProfile.home_location || userProfile.home_address || null,
      work: userProfile.work_location || userProfile.work_address || null,
      school: userProfile.school_location || null,
      sensitivity: userProfile.health_sensitivities || userProfile.sensitivity || null,
      personas: userProfile.configured_personas || null,
    };
  }, [userProfile]);

  // Main Ask Query Function
  const handleAsk = async (queryText) => {
    if (!isAuthenticated) {
      handleOpenLogin();
      return;
    }

    const q = (queryText || input).trim();
    if (!q || loading) return;

    setInput('');
    setLastFailedQuery(null);

    // Pre-flight Guardrail check
    if (!isEnvironmentalQuery(q)) {
      const guardrailRes = getOutOfScopeGuardrailResponse(q);
      const newMsg = {
        q,
        verdict: guardrailRes.verdict,
        headline: guardrailRes.headline,
        why: guardrailRes.why || [],
        do: guardrailRes.do || [],
        best_window: guardrailRes.best_window,
        recheck_at: guardrailRes.recheck_at,
        sources: guardrailRes.sources,
        assistant_label: guardrailRes.assistant_label,
        is_rule_based: true,
        timestamp: guardrailRes.timestamp,
        data_used_categories: ['Safety Guardrail Policy'],
      };
      setMessages(prev => [...prev, newMsg]);
      return;
    }

    setLoading(true);
    setActivePipelineStageIndex(0);

    let isTimeout = false;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        isTimeout = true;
        reject(new Error('TIMEOUT_25S'));
      }, 25000);
    });

    try {
      // Natural thinking delay (at least 600ms) for smooth animated response
      const minDelayPromise = new Promise((resolve) => setTimeout(resolve, 600));
      const [res] = await Promise.all([
        Promise.race([
          askAriseChat({
            question: q,
            lat,
            lon,
            persona: persona || 'General Public',
            demo,
            location_name: locationName,
            user_context: userCtx,
            environmental_context: environmentalContext,
            conversation_id: activeConversationId,
            include_memories: true,
            accessToken,
          }),
          timeoutPromise,
        ]),
        minDelayPromise,
      ]);

      if (res && res.verdict) {
        const isRuleBased = res.provider === 'rule-based' || res.is_rule_based === true;
        const newMsg = {
          q,
          verdict: res.verdict.replace('_', ' '),
          headline: res.headline,
          why: res.why || [],
          do: res.do || [],
          best_window: res.best_window,
          recheck_at: res.recheck_at,
          sources: Array.isArray(res.sources) && res.sources.length > 0 ? res.sources : [],
          assistant_label: res.assistant_label || (isRuleBased ? 'Arise Rule-Based Engine' : 'Arise Environmental Intelligence'),
          is_rule_based: isRuleBased,
          timestamp: formatKolkataTime(new Date()),
          data_used_categories: res.data_used_categories || ['CPCB Ground Telemetry', 'Atmospheric Weather', 'User Memory Context'],
          evaluator_verdict: res.evaluator_verdict || null,
        };

        const updatedMessages = [...messages, newMsg];
        setMessages(updatedMessages);
        setTypingMessageIndex(updatedMessages.length - 1);

        const convId = res.conversation_id || activeConversationId || ('conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
        if (convId !== activeConversationId) {
          setActiveConversationId(convId);
        }

        const msgCacheKey = authUserId ? `arise_conv_msg_${authUserId}_${convId}` : `arise_conv_msg_${convId}`;
        try {
          if (activeConvSessionKey) {
            sessionStorage.setItem(activeConvSessionKey, convId);
          }
          localStorage.setItem(msgCacheKey, JSON.stringify(updatedMessages));
        } catch {}

        if (isAuthenticated && accessToken) {
          loadConversationsList();
          broadcastConversationMutated({ action: 'MESSAGE_SENT', conversationId: convId, userId: authUserId });
        } else {
          // Update guest conversations list
          try {
            const saved = localStorage.getItem(guestConversationsKey);
            let list = saved ? JSON.parse(saved) : [];
            const convTitle = q.length > 40 ? q.slice(0, 40) + '...' : q;
            const existingIdx = list.findIndex(c => c.id === convId);
            if (existingIdx >= 0) {
              list[existingIdx] = {
                ...list[existingIdx],
                updated_at: new Date().toISOString(),
                message_count: updatedMessages.length,
                last_message_preview: res.headline || q,
              };
            } else {
              list.unshift({
                id: convId,
                title: convTitle,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                message_count: updatedMessages.length,
                last_message_preview: res.headline || q,
                is_archived: false,
                is_pinned: false,
              });
            }
            localStorage.setItem(guestConversationsKey, JSON.stringify(list));
            setConversations(list);
            setActiveTitle(convTitle);
          } catch {}
        }

        // Refresh memory counts in case new candidate memories were extracted
        refreshMemoryCounts();
        setLoading(false);
        return;
      }
    } catch (err) {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      if (isTimeout || err?.message === 'TIMEOUT_25S') {
        const timeoutMsg = {
          q,
          verdict: 'BE SMART',
          headline: 'Environmental telemetry synthesis took longer than expected under high load.',
          why: ['The live atmospheric query reached our 25-second responsiveness budget.'],
          do: ['Inspect the live AQI gauges or tap Retry below to re-submit.'],
          best_window: 'Unavailable',
          recheck_at: 'Shortly',
          sources: [],
          assistant_label: 'Arise Rule-Based Safety Engine',
          is_rule_based: true,
          timestamp: 'Timeout',
          data_used_categories: ['Authoritative Safe Timeout Verdict'],
        };
        const updatedTimeoutMsgs = [...messages, timeoutMsg];
        setMessages(updatedTimeoutMsgs);
        if (activeConversationId) {
          const activeMsgKey = authUserId ? `arise_conv_msg_${authUserId}_${activeConversationId}` : `arise_conv_msg_${activeConversationId}`;
          try {
            localStorage.setItem(activeMsgKey, JSON.stringify(updatedTimeoutMsgs));
          } catch {}
        }
        setLastFailedQuery(q);
        setLoading(false);
        return;
      }
      console.warn('Ask Arise chat error:', err);
    }

    // Network error state
    const errorMsg = {
      q,
      verdict: 'STAY IN',
      headline: 'Telemetry service temporarily unreachable. Tap Retry to reconnect.',
      why: ['Unable to communicate with the environmental intelligence server.'],
      do: ['Check your network connection and click Retry below.'],
      best_window: 'Unavailable',
      recheck_at: 'Unavailable',
      sources: [],
      assistant_label: 'Arise Safety Guard',
      is_rule_based: true,
      timestamp: 'Offline',
      data_used_categories: ['Safety Fail-Closed Guard'],
    };
    const updatedErrorMsgs = [...messages, errorMsg];
    setMessages(updatedErrorMsgs);
    if (activeConversationId) {
      const activeMsgKey = authUserId ? `arise_conv_msg_${authUserId}_${activeConversationId}` : `arise_conv_msg_${activeConversationId}`;
      try {
        localStorage.setItem(activeMsgKey, JSON.stringify(updatedErrorMsgs));
      } catch {}
    }
    setLastFailedQuery(q);
    setLoading(false);
  };

  return (
    <div className="card h-full w-full flex flex-row overflow-hidden relative shadow-md" style={{ background: 'var(--surface)' }}>
      {/* Collapsible Left Sidebar - only rendered when signed in or auth is initializing */}
      {(isAuthenticated || authLoading) && (
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onRenameConversation={handleRenameConversation}
          onTogglePinConversation={handleTogglePin}
          onToggleArchiveConversation={handleToggleArchive}
          onDeleteConversation={handleDeleteConversation}
          onOpenMemoryManager={() => setIsMemoryModalOpen(true)}
          pendingMemoriesCount={pendingMemoriesCount}
          totalMemoriesCount={totalMemoriesCount}
          isOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isAuthenticated={isAuthenticated}
          loading={conversationsLoading || authLoading}
        />
      )}

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col p-3 sm:p-5 md:p-6 min-w-0 overflow-hidden h-full">
        {/* Top Header Bar */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-3 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {isAuthenticated && !isSidebarOpen && (
              <button
                type="button"
                id="btn-sidebar-toggle"
                onClick={() => setIsSidebarOpen(true)}
                className="w-8 h-8 rounded-xl border flex items-center justify-center text-xs t2 hover:t1 hover:bg-[var(--surface-alt)] transition-all cursor-pointer shadow-2xs"
                style={{ borderColor: 'var(--border)' }}
                title="Expand Conversations Sidebar"
                aria-label="Open sidebar"
              >
                ☰
              </button>
            )}

            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-base font-black shadow-md shadow-indigo-500/20 shrink-0">
              ✦
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black t1 tracking-tight truncate max-w-[200px] sm:max-w-md lg:max-w-xl">
                  {activeTitle || 'Ask Arise'}
                </h3>
                {locationName && (
                  <span
                    className="hidden sm:inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full border t3 bg-[var(--surface-alt)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    📍 {locationName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Remarks Manager trigger button - only rendered when signed in */}
            {isAuthenticated && (
              <button
                type="button"
                id="btn-header-memory"
                onClick={() => setIsMemoryModalOpen(true)}
                className="text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:bg-[var(--surface-alt)]"
                style={{
                  background: 'var(--surface-alt)',
                  borderColor: pendingMemoriesCount > 0 ? '#F59E0B' : 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                title="Manage personal remarks, outdoor thresholds & preferences"
              >
                <span>📝</span>
                <span className="hidden sm:inline">Remarks</span>
                {pendingMemoriesCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </button>
            )}

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                id="btn-clear-chat"
                className="text-xs font-bold px-3 py-1 rounded-full border t3 hover:t1 hover:bg-[var(--surface-alt)] transition-all cursor-pointer shadow-2xs"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-alt)' }}
                title="Clear conversation messages"
              >
                🗑️ Clear
              </button>
            )}

            {!isAuthenticated ? (
              <button
                type="button"
                onClick={handleOpenLogin}
                className="text-xs font-black px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer"
                style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                <span>🔒</span>
                <span>Sign in to unlock</span>
              </button>
            ) : (
              <span
                className="text-xs font-black px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-2xs"
                style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                title="Multi-stage grounded pipeline with independent safety evaluation"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden sm:inline">✦ Strands Pipeline</span>
              </span>
            )}
          </div>
        </div>

        {/* Chat Thread Messages Container */}
        <div className="relative flex-1 min-h-0 flex flex-col my-1 overflow-hidden">
          <div
            ref={chatScrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1.5 sm:pr-3 py-2 pb-12 scroll-smooth"
          >
            {messages.length === 0 ? (
              <div
                className="p-6 sm:p-8 rounded-3xl border text-center flex flex-col items-center justify-center gap-3 my-2 shrink-0"
                style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl shadow-xs">
                  ✦
                </div>
                <div>
                  <p className="text-base font-black t1">Ask Arise Environmental Intelligence</p>
                  <p className="text-xs font-medium tm max-w-md leading-relaxed mt-1">
                    Ask anything about current air quality, outdoor safety windows, temperature, or personalized family precautions.
                  </p>
                </div>

                {!isAuthenticated && (
                  <div
                    className="w-full max-w-md mt-2 p-5 rounded-2xl border bg-[var(--surface)] text-left shadow-sm space-y-3"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center text-base shrink-0 font-black">
                        🔒
                      </div>
                      <div>
                        <span className="text-xs font-black t1">Sign in to Ask Questions</span>
                        <p className="text-[11px] font-semibold tm">
                          Sign in to ask questions, view past chats, and get personalized advice
                        </p>
                      </div>
                    </div>

                    <div className="text-xs font-semibold t2 space-y-1.5 pt-1">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500 font-bold">✓</span>
                        <span>Saved conversation history across your devices</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500 font-bold">✓</span>
                        <span>Personal health notes, locations, and activity preferences</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-500 font-bold">✓</span>
                        <span>Advisories grounded in official CPCB safety standards</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                      <button
                        type="button"
                        id="btn-ask-signin"
                        onClick={handleOpenLogin}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all active:scale-95 cursor-pointer"
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        id="btn-ask-signup"
                        onClick={handleOpenSignUp}
                        className="px-4 py-2 rounded-xl text-xs font-black border transition-all hover:bg-[var(--surface-alt)] shadow-xs cursor-pointer"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      >
                        Create Free Account
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              messages.map((m, i) => {
                const col = VERDICT_COLORS[m.verdict] || '#E5484D';
                return (
                  <div key={i} id={`chat-turn-${i}`} data-chat-turn={i} className="space-y-2.5">
                    {/* User Question Bubble */}
                    <div className="flex justify-end">
                      <div
                        className="px-4 py-2.5 rounded-2xl rounded-tr-xs text-xs sm:text-sm font-bold max-w-[85%] shadow-xs"
                        style={{
                          background: 'var(--surface-alt)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {m.q}
                      </div>
                    </div>

                    {/* Arise AI Intelligence Response Card */}
                    <div
                      className="p-4 sm:p-5 rounded-2xl rounded-tl-xs max-w-[96%] border space-y-3 shadow-xs transition-all"
                      style={{
                        background: 'var(--surface-alt)',
                        borderColor: 'var(--border)',
                        borderLeft: `5px solid ${col}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[11px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider"
                            style={{ background: `${col}20`, color: col }}
                          >
                            {m.verdict}
                          </span>

                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                              m.is_rule_based
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                            }`}
                          >
                            {m.assistant_label?.replace(/\s*\(rule-based\)/i, '') || (m.is_rule_based ? 'Arise Safety Engine' : 'Arise AI')}
                          </span>

                          {m.evaluator_verdict && (
                            <span
                              className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                              title="Independent Stage D evaluator verified CPCB safety constraints and evidence consistency"
                            >
                              ✓ Safety Verified
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {m.best_window && isPracticalWindow(m.best_window) && (
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              Window: {m.best_window}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold tm">{formatMessageTimestamp(m.timestamp)}</span>

                          <button
                            type="button"
                            onClick={() => handleToggleReadAloud(m, i)}
                            id={`btn-read-aloud-${i}`}
                            className={`inline-flex items-center justify-center p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                              speakingIndex === i
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs animate-pulse'
                                : 'bg-[var(--surface)] hover:bg-[var(--surface-alt)] border-[var(--border)] t2 hover:t1 shadow-2xs'
                            }`}
                            title={speakingIndex === i ? "Stop reading response aloud" : "Read response aloud"}
                            aria-label={speakingIndex === i ? "Stop reading response aloud" : "Read response aloud"}
                          >
                            <span aria-hidden="true">{speakingIndex === i ? '⏹️' : '🔊'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleShareCard(m, i)}
                            id={`btn-share-reply-${i}`}
                            disabled={sharingIndex === i}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border bg-[var(--surface)] hover:bg-[var(--surface-alt)] border-[var(--border)] t2 hover:t1 shadow-2xs active:scale-95"
                            title="Share advisory image"
                            aria-label="Share advisory image"
                          >
                            <span aria-hidden="true">{sharingIndex === i ? '⏳' : '📤'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Headline */}
                      <div className="text-sm sm:text-base font-extrabold t1 leading-snug tracking-tight">
                        {typingMessageIndex === i ? (
                          <TypewriterText
                            text={m.headline}
                            onComplete={() => setTypingMessageIndex(null)}
                          />
                        ) : (
                          <FormattedBotText text={m.headline} />
                        )}
                      </div>

                      {/* Key Observations */}
                      {m.why && m.why.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                            Key Observations
                          </div>
                          <ul className="text-xs sm:text-sm font-semibold t2 list-disc list-inside space-y-1 pl-1 leading-relaxed">
                            {m.why.map((reason, idx) => (
                              <li key={idx} className="leading-snug">
                                <FormattedBotText text={reason} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Recommended Precautions */}
                      {m.do && m.do.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <div className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Recommended Actions
                          </div>
                          <ul className="text-xs sm:text-sm font-semibold t2 list-disc list-inside space-y-1 pl-1 leading-relaxed">
                            {m.do.map((act, idx) => (
                              <li key={idx} className="leading-snug">
                                <FormattedBotText text={act} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* In-Flight Lazy Thinking State */}
            {loading && (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="p-4 sm:p-5 rounded-2xl bg-[var(--surface-alt)] border max-w-[85%] shadow-xs flex items-center gap-3.5 animate-in fade-in duration-200"
                style={{ borderColor: 'var(--border)', borderLeft: '4px solid #6366F1' }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs sm:text-sm font-extrabold t1">
                    Thinking…
                  </span>
                  <span className="text-[11px] font-semibold tm">
                    Analyzing local environmental conditions...
                  </span>
                </div>
              </div>
            )}

            {/* Retry CTA if query failed */}
            {lastFailedQuery && !loading && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2"
              >
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  Last question failed to complete.
                </span>
                <button
                  type="button"
                  onClick={() => handleAsk(lastFailedQuery)}
                  className="px-3 py-1 rounded-lg text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs cursor-pointer"
                >
                  ↻ Retry
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Floating Scroll to Bottom button (Down Arrow Only) */}
          {showScrollBottom && (
            <button
              type="button"
              id="btn-scroll-chat-bottom"
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 right-4 z-20 w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              aria-label="Scroll to newest response"
              title="Scroll down to latest response"
            >
              <span>↓</span>
            </button>
          )}
        </div>

        {/* Suggested Prompt Chips */}
        <div className="flex flex-wrap gap-1.5 my-2 shrink-0">
          {DEFAULT_CHIPS.map(c => (
            <button
              key={c}
              onClick={() => {
                if (!isAuthenticated) {
                  handleOpenLogin();
                  return;
                }
                handleAsk(c);
              }}
              disabled={loading}
              className="text-xs font-bold px-3 py-1.5 rounded-full t2 transition-all hover:bg-[var(--surface-alt)] hover:scale-[1.02] active:scale-95 border disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
              title={!isAuthenticated ? 'Sign in to ask this question' : c}
            >
              {!isAuthenticated && <span className="text-[11px] opacity-60">🔒</span>}
              <span>{c}</span>
            </button>
          ))}
        </div>

        {/* Input Bar or Guest CTA */}
        {!isAuthenticated ? (
          <div
            id="guest-ask-cta-bar"
            onClick={handleOpenLogin}
            role="button"
            tabIndex={0}
            aria-label="Sign in to ask Arise about air quality and outdoor safety"
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleOpenLogin()}
            className="flex items-center justify-between gap-3 p-2.5 rounded-xl border cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 transition-all bg-[var(--surface-alt)] shadow-xs shrink-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2.5 pl-2">
              <span className="text-base text-indigo-500">🔒</span>
              <span className="text-xs sm:text-sm font-semibold tm">
                Sign in to ask Arise about your local air quality, weather risks, and health precautions...
              </span>
            </div>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleOpenLogin();
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black shadow-xs hover:bg-indigo-500 transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <input
              id="input-ask-arise"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAsk()}
              disabled={loading}
              placeholder="Ask Arise about air quality, outdoor safety, or personalized precautions..."
              aria-label="Ask Arise about air quality, outdoor safety, or personalized precautions"
              className="flex-1 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold t1 outline-none border transition-all focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            />
            <button
              id="btn-ask-submit"
              onClick={() => handleAsk()}
              disabled={loading || !input.trim()}
              className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all flex-shrink-0 disabled:opacity-50 cursor-pointer"
              aria-label="Send query"
            >
              {loading ? '…' : '➤'}
            </button>
          </div>
        )}

        {/* Non-medical Disclaimer */}
        <div
          className="text-[11px] font-medium tm text-center mt-2 pt-1.5 border-t shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          Environmental exposure intelligence for everyday decisions · Not medical advice
        </div>
      </div>

      {/* Memory Manager Modal - only rendered when signed in */}
      {isAuthenticated && (
        <MemoryManagerModal
          isOpen={isMemoryModalOpen}
          onClose={() => {
            setIsMemoryModalOpen(false);
            refreshMemoryCounts();
          }}
          accessToken={accessToken}
          isAuthenticated={isAuthenticated}
          userId={authUserId}
          onOpenLogin={handleOpenLogin}
        />
      )}

      {/* Share Toast Notification */}
      {shareToast && (
        <div
          role="status"
          className="fixed bottom-20 right-6 z-50 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white text-xs font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2"
        >
          <span>✓</span>
          <span>{shareToast}</span>
        </div>
      )}
    </div>
  );
}

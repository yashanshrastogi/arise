import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkIsAtBottom,
  shouldShowNewestButton,
  resolveAskAriseLayoutFeatures,
  SCROLL_TOLERANCE,
} from '../utils/askLayoutState.js';

// ══════════════════════════════════════════════════════════════════════
// 1. Authentication Layout Tests
// ══════════════════════════════════════════════════════════════════════

test('Guest mode (not authenticated) strictly hides sidebar, toggle, and AI Memory controls', () => {
  const guestLayout = resolveAskAriseLayoutFeatures({ isAuthenticated: false });
  assert.equal(guestLayout.showSidebar, false, 'Sidebar must be hidden for guest');
  assert.equal(guestLayout.showAiMemory, false, 'AI Memory button must be hidden for guest');
  assert.equal(guestLayout.sidebarToggleVisible, false, 'Sidebar hamburger toggle must be hidden for guest');
  assert.equal(guestLayout.chatPanelWidthClass, 'flex-1 w-full', 'Chat panel must occupy 100% available width');
});

test('Signed-in mode shows sidebar, toggle, and AI Memory controls', () => {
  const memberLayout = resolveAskAriseLayoutFeatures({ isAuthenticated: true });
  assert.equal(memberLayout.showSidebar, true, 'Sidebar must be shown for authenticated user');
  assert.equal(memberLayout.showAiMemory, true, 'AI Memory button must be shown for authenticated user');
  assert.equal(memberLayout.sidebarToggleVisible, true, 'Sidebar toggle must be available for authenticated user');
});

test('Authentication state change updates layout flags dynamically without page reload', () => {
  let authState = false;
  let layout = resolveAskAriseLayoutFeatures({ isAuthenticated: authState });
  assert.equal(layout.showSidebar, false);
  assert.equal(layout.showAiMemory, false);

  // User logs in via Cognito/OAuth
  authState = true;
  layout = resolveAskAriseLayoutFeatures({ isAuthenticated: authState });
  assert.equal(layout.showSidebar, true);
  assert.equal(layout.showAiMemory, true);

  // User logs out
  authState = false;
  layout = resolveAskAriseLayoutFeatures({ isAuthenticated: authState });
  assert.equal(layout.showSidebar, false);
  assert.equal(layout.showAiMemory, false);
});

// ══════════════════════════════════════════════════════════════════════
// 2. Newest Button & Scroll Awareness Tests
// ══════════════════════════════════════════════════════════════════════

test('Newest button is NEVER shown when message thread is empty (welcome screen)', () => {
  // Even if welcome card causes vertical scrollbar overflow
  const show = shouldShowNewestButton({
    messagesLength: 0,
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 600,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, false, 'Newest button must remain hidden when messages array is empty');
});

test('Newest button is hidden when user is positioned at the bottom of the latest reply', () => {
  // User at exact bottom: scrollHeight (1200) - scrollTop (600) - clientHeight (600) = 0 <= 32
  const show = shouldShowNewestButton({
    messagesLength: 4,
    scrollTop: 600,
    scrollHeight: 1200,
    clientHeight: 600,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, false, 'Button must be hidden when user is at the bottom');
  assert.equal(checkIsAtBottom({ scrollTop: 600, scrollHeight: 1200, clientHeight: 600 }, SCROLL_TOLERANCE), true);
});

test('Newest button is hidden within tolerance margin near the bottom (smooth scroll / rounding)', () => {
  // 15px away from bottom: 1200 - 585 - 600 = 15 <= 32
  const show = shouldShowNewestButton({
    messagesLength: 3,
    scrollTop: 585,
    scrollHeight: 1200,
    clientHeight: 600,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, false, 'Button must stay hidden within 32px tolerance window');
});

test('Newest button is visible when user scrolls upward from the bottom', () => {
  // User scrolls up 150px: 1200 - 450 - 600 = 150 > 32
  const show = shouldShowNewestButton({
    messagesLength: 5,
    scrollTop: 450,
    scrollHeight: 1200,
    clientHeight: 600,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, true, 'Button must appear when scrolled upward');
  assert.equal(checkIsAtBottom({ scrollTop: 450, scrollHeight: 1200, clientHeight: 600 }, SCROLL_TOLERANCE), false);
});

test('Newest button is visible when reading older messages and a newer reply exists below', () => {
  // User is reading message #2 at scrollTop 200 while thread has expanded to 1800
  const show = shouldShowNewestButton({
    messagesLength: 6,
    scrollTop: 200,
    scrollHeight: 1800,
    clientHeight: 600,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, true, 'Button must be visible when viewing older messages with unread replies below');
});

test('Clicking Newest scrolls container to bottom and hides button upon reaching bottom', () => {
  const mockContainer = {
    scrollTop: 300,
    scrollHeight: 1500,
    clientHeight: 600,
    scrollTo({ top }) {
      this.scrollTop = top;
    },
  };

  // Initially away from bottom -> button is visible
  let show = shouldShowNewestButton({
    messagesLength: 4,
    scrollTop: mockContainer.scrollTop,
    scrollHeight: mockContainer.scrollHeight,
    clientHeight: mockContainer.clientHeight,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, true);

  // Click Newest action: scroll to scrollHeight
  mockContainer.scrollTo({ top: mockContainer.scrollHeight - mockContainer.clientHeight });

  // Now at bottom -> button is hidden
  show = shouldShowNewestButton({
    messagesLength: 4,
    scrollTop: mockContainer.scrollTop,
    scrollHeight: mockContainer.scrollHeight,
    clientHeight: mockContainer.clientHeight,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, false);
  assert.equal(checkIsAtBottom(mockContainer, SCROLL_TOLERANCE), true);
});

test('New reply auto-scrolls when user was already at the bottom', () => {
  let isAtBottom = true;
  let scrollTop = 600;
  const clientHeight = 600;
  let scrollHeight = 1200;

  // New message arrives -> container height grows to 1500
  scrollHeight = 1500;
  if (isAtBottom) {
    scrollTop = scrollHeight - clientHeight; // auto-scroll follows
    isAtBottom = true;
  }

  const show = shouldShowNewestButton({
    messagesLength: 5,
    scrollTop,
    scrollHeight,
    clientHeight,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, false, 'Should auto-follow and keep button hidden when user was at bottom');
});

test('New reply does NOT force-scroll when user was reading older messages', () => {
  let isAtBottom = false; // User scrolled up
  let scrollTop = 200;
  const clientHeight = 600;
  let scrollHeight = 1200;

  // New message arrives -> container height grows to 1600
  scrollHeight = 1600;
  if (isAtBottom) {
    scrollTop = scrollHeight - clientHeight;
  }
  // scrollTop remains 200! Reading position preserved without interruption!
  assert.equal(scrollTop, 200, 'User reading position must not jump');

  const show = shouldShowNewestButton({
    messagesLength: 6,
    scrollTop,
    scrollHeight,
    clientHeight,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, true, 'Button must be visible so user can choose when to jump to newest reply');
});

test('Button visibility remains correct after window resize or container re-measurement', () => {
  // Desktop viewport: clientHeight 700, total content 800 (small overflow of 100px)
  let show = shouldShowNewestButton({
    messagesLength: 2,
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 700,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, true, 'Overflow of 100px > 32px tolerance shows button when scrolled up');

  // User resizes browser window taller (e.g. 900px), eliminating all overflow
  show = shouldShowNewestButton({
    messagesLength: 2,
    scrollTop: 0,
    scrollHeight: 800,
    clientHeight: 900,
    tolerance: SCROLL_TOLERANCE,
  });
  assert.equal(show, false, 'No scroll overflow -> button hidden after window resize');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSavedTheme,
  resolveEffectiveTheme,
  saveTheme,
  applyThemeToDocument,
  cycleTheme,
  listenToSystemTheme,
  THEME_STORAGE_KEY,
} from './themeUtils.js';

test('ThemeEngine: Default mode is system when no preference is saved', () => {
  const mockStorage = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => mockStorage.get(k) || null,
      setItem: (k, v) => mockStorage.set(k, String(v)),
      removeItem: (k) => mockStorage.delete(k),
    },
    matchMedia: (query) => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };

  assert.equal(getSavedTheme(), 'system');
  assert.equal(resolveEffectiveTheme('system'), false);
});

test('ThemeEngine: No saved preference + system dark -> resolves to dark', () => {
  global.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    matchMedia: (query) => ({
      matches: query.includes('dark'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };

  assert.equal(getSavedTheme(), 'system');
  assert.equal(resolveEffectiveTheme(getSavedTheme()), true);
});

test('ThemeEngine: No saved preference + system light -> resolves to light', () => {
  global.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    matchMedia: (query) => ({
      matches: false, // system is light
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };

  assert.equal(getSavedTheme(), 'system');
  assert.equal(resolveEffectiveTheme(getSavedTheme()), false);
});

test('ThemeEngine: Explicit Light override wins even if system is dark', () => {
  global.window = {
    localStorage: {
      getItem: (k) => (k === THEME_STORAGE_KEY ? 'light' : null),
      setItem: () => {},
      removeItem: () => {},
    },
    matchMedia: () => ({ matches: true }), // OS is dark
  };

  assert.equal(getSavedTheme(), 'light');
  assert.equal(resolveEffectiveTheme('light'), false, 'Explicit light must override system dark');
});

test('ThemeEngine: Explicit Dark override wins even if system is light', () => {
  global.window = {
    localStorage: {
      getItem: (k) => (k === THEME_STORAGE_KEY ? 'dark' : null),
      setItem: () => {},
      removeItem: () => {},
    },
    matchMedia: () => ({ matches: false }), // OS is light
  };

  assert.equal(getSavedTheme(), 'dark');
  assert.equal(resolveEffectiveTheme('dark'), true, 'Explicit dark must override system light');
});

test('ThemeEngine: Persisting user selection saves and removes accurately', () => {
  const store = new Map();
  global.window = {
    localStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };

  saveTheme('dark');
  assert.equal(store.get(THEME_STORAGE_KEY), 'dark');
  assert.equal(getSavedTheme(), 'dark');

  saveTheme('light');
  assert.equal(store.get(THEME_STORAGE_KEY), 'light');
  assert.equal(getSavedTheme(), 'light');

  saveTheme('system');
  assert.equal(store.get(THEME_STORAGE_KEY), undefined, 'System mode clears explicit override');
  assert.equal(getSavedTheme(), 'system');
});

test('ThemeEngine: cycleTheme rotates through system, light, and dark seamlessly', () => {
  // Case 1: Currently in system (and system is dark -> looks dark)
  // Clicking should switch to light
  const nextFromDarkSystem = cycleTheme('system', true);
  assert.equal(nextFromDarkSystem, 'light');

  // Next click from light -> dark
  const nextFromLight = cycleTheme('light', false);
  assert.equal(nextFromLight, 'dark');

  // Next click from dark -> back to system
  const nextFromDark = cycleTheme('dark', true);
  assert.equal(nextFromDark, 'system');

  // Case 2: Currently in system (and system is light -> looks light)
  // Clicking should switch to dark
  const nextFromLightSystem = cycleTheme('system', false);
  assert.equal(nextFromLightSystem, 'dark');
});

test('ThemeEngine: applyThemeToDocument correctly updates class and data attribute', () => {
  const classList = new Set();
  const attributes = new Map();
  global.document = {
    documentElement: {
      classList: {
        toggle: (cls, force) => {
          if (force) classList.add(cls);
          else classList.delete(cls);
        },
        contains: (cls) => classList.has(cls),
      },
      setAttribute: (k, v) => attributes.set(k, v),
    },
  };

  applyThemeToDocument(true);
  assert.ok(classList.has('dark'), 'Must add dark class');
  assert.equal(attributes.get('data-theme'), 'dark');

  applyThemeToDocument(false);
  assert.ok(!classList.has('dark'), 'Must remove dark class');
  assert.equal(attributes.get('data-theme'), 'light');
});

test('ThemeEngine: listenToSystemTheme attaches and cleans up change listener', () => {
  let changeHandler = null;
  let listenerRemoved = false;

  global.window = {
    matchMedia: () => ({
      matches: false,
      addEventListener: (type, fn) => {
        if (type === 'change') changeHandler = fn;
      },
      removeEventListener: (type, fn) => {
        if (type === 'change' && fn === changeHandler) listenerRemoved = true;
      },
    }),
  };

  let triggeredValue = null;
  const cleanup = listenToSystemTheme((isDark) => {
    triggeredValue = isDark;
  });

  assert.ok(typeof changeHandler === 'function', 'Listener must be attached');

  // Simulate OS theme change
  changeHandler({ matches: true });
  assert.equal(triggeredValue, true, 'Callback must receive OS dark change');

  changeHandler({ matches: false });
  assert.equal(triggeredValue, false, 'Callback must receive OS light change');

  // Cleanup
  cleanup();
  assert.ok(listenerRemoved, 'Event listener must be cleaned up on unsubscribe');
});

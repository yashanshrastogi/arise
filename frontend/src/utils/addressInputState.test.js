import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldShowClearButton,
  handleAddressClear,
  shouldShowLocationPinnedBadge,
} from './addressInputState.js';

test('shouldShowClearButton correctly toggles based on text and disabled state', () => {
  assert.equal(shouldShowClearButton(''), false, 'Empty field must not show clear button');
  assert.equal(shouldShowClearButton(null), false, 'Null field must not show clear button');
  assert.equal(shouldShowClearButton('123 Main St'), true, 'Populated text field must show clear button');
  assert.equal(shouldShowClearButton('123 Main St', true), false, 'Disabled input must not show clear button');
});

test('handleAddressClear clears text, closes suggestions, and notifies onChange', () => {
  let updatedValue = 'Initial';
  let queryState = '123 Main St';
  let suggestionsState = [{ name: 'Suggestion 1' }];
  let openState = true;
  let clearedFired = false;

  const result = handleAddressClear({
    setQuery: (val) => { queryState = val; },
    setSuggestions: (sug) => { suggestionsState = sug; },
    setIsOpen: (open) => { openState = open; },
    onChange: (val) => { updatedValue = val; },
    onClear: () => { clearedFired = true; },
  });

  assert.equal(result.query, '');
  assert.equal(result.isOpen, false);
  assert.deepEqual(result.suggestions, []);

  assert.equal(queryState, '');
  assert.deepEqual(suggestionsState, []);
  assert.equal(openState, false);
  assert.equal(updatedValue, '');
  assert.equal(clearedFired, true);
});

test('shouldShowLocationPinnedBadge hides badge when address text is cleared', () => {
  // Coords exist and address text is present -> show badge
  assert.equal(shouldShowLocationPinnedBadge(true, 28.5, 77.2, 'Connaught Place'), true);

  // Coords exist but user cleared the text input -> HIDE misleading badge
  assert.equal(shouldShowLocationPinnedBadge(true, 28.5, 77.2, ''), false);
  assert.equal(shouldShowLocationPinnedBadge(true, 28.5, 77.2, '   '), false);

  // Missing coords -> hide badge
  assert.equal(shouldShowLocationPinnedBadge(false, null, null, 'Some Address'), false);
  assert.equal(shouldShowLocationPinnedBadge(true, null, 77.2, 'Some Address'), false);
});

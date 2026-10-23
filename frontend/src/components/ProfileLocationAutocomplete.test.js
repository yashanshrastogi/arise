import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../..');

test('AddressInput: Anchors suggestions dropdown directly to input wrapper with solid opaque styling', () => {
  const filePath = path.join(frontendDir, 'src/components/AddressInput.jsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Must anchor dropdown inside the input wrapper rather than detached container
  assert.ok(content.includes('id={`${id}-dropdown`}'), 'Dropdown must have unique accessible id');
  assert.ok(content.includes('role="listbox"'), 'Dropdown must declare listbox role');
  assert.ok(content.includes('aria-label='), 'Dropdown must declare accessible aria-label');

  // Must have solid opaque background in both light and dark mode
  assert.ok(content.includes("backgroundColor: 'var(--card)'"), 'Dropdown must enforce solid var(--card) background');
  assert.ok(content.includes('bg-white dark:bg-[#131A2E]'), 'Dropdown must provide solid fallback classes for light and dark modes');
  assert.ok(content.includes('shadow-2xl'), 'Dropdown must cast strong shadow for visual elevation');

  // Sensible max height and independent scrolling
  assert.ok(content.includes('max-h-56 sm:max-h-64'), 'Dropdown must enforce sensible maximum height constraints');
  assert.ok(content.includes('overflow-y-auto'), 'Dropdown must provide independent scroll container');
  assert.ok(content.includes('overscroll-contain'), 'Dropdown must prevent scroll chaining to modal');

  // Dynamic z-index elevation when dropdown is visible
  assert.ok(content.includes("isDropdownVisible ? 'z-40' : 'z-auto'"), 'Input container must elevate z-index when dropdown is open');
  assert.ok(content.includes('onDropdownOpenChange'), 'Must support onDropdownOpenChange callback prop');
});

test('AddressInput: Displays place name and administrative region badge for ambiguous places without inventing details', () => {
  const filePath = path.join(frontendDir, 'src/components/AddressInput.jsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Primary place name
  assert.ok(content.includes('item.name'), 'Must render primary place name');

  // Administrative region pill (e.g. Rajasthan, Maharashtra)
  assert.ok(content.includes('item.state'), 'Must display state/region when available');
  assert.ok(content.includes('item.country'), 'Must display country when available');

  // Subtitle/context
  assert.ok(content.includes('item.subtitle'), 'Must render full context/subtitle line');
});

test('ProfileSettingsModal: Dynamically elevates active section and eliminates trapped animation stacking contexts', () => {
  const filePath = path.join(frontendDir, 'src/components/ProfileSettingsModal.jsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Must define activeDropdownPrefix state
  assert.ok(content.includes('activeDropdownPrefix, setActiveDropdownPrefix'), 'Must track activeDropdownPrefix in state');

  // Must eliminate animate-fadeIn on locationSection to avoid trapping stacking context
  assert.ok(!content.includes('section className="space-y-3 rounded-xl border p-4 animate-fadeIn"'), 'Must eliminate trapped animate-fadeIn on location section');

  // Must apply descending z-index to location sections so earlier inputs sit above later ones
  assert.ok(content.includes('SECTION_Z_INDEX'), 'Must define descending SECTION_Z_INDEX mapping');
  assert.ok(content.includes("home: 'z-[50]'"), 'Home section must have z-[50]');
  assert.ok(content.includes("work: 'z-[40]'"), 'Work section must have z-[40]');
  assert.ok(content.includes("background: 'var(--surface)'"), 'Location section must have solid surface background');

  // Must wire onDropdownOpenChange to setActiveDropdownPrefix
  assert.ok(content.includes('onDropdownOpenChange={(open) => {'), 'Must pass onDropdownOpenChange to AddressInput');
  assert.ok(content.includes('setActiveDropdownPrefix(open ? prefix : null)'), 'Must update activeDropdownPrefix on open change');

  // Must not automatically overwrite user input on blur without explicit selection
  assert.ok(!content.includes('onBlurResolve={async () => {'), 'Must not auto-overwrite address on blur without user selection');
});

test('CompleteProfileModal: Elevates active location section and eliminates automatic blur geocoding overwrite', () => {
  const filePath = path.join(frontendDir, 'src/components/CompleteProfileModal.jsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Must track activeDropdownPrefix
  assert.ok(content.includes('activeDropdownPrefix, setActiveDropdownPrefix'), 'Must track activeDropdownPrefix in CompleteProfileModal');

  // Dynamic elevation on Home and Work containers
  assert.ok(content.includes("activeDropdownPrefix === 'home' ? 'relative z-30"), 'Home section must elevate when home dropdown is open');
  assert.ok(content.includes("activeDropdownPrefix === 'work' ? 'relative z-30"), 'Work section must elevate when work dropdown is open');

  // Wire onDropdownOpenChange
  assert.ok(content.includes("onDropdownOpenChange={(open) => setActiveDropdownPrefix(open ? 'home' : null)}"), 'Must connect home onDropdownOpenChange');
  assert.ok(content.includes("onDropdownOpenChange={(open) => setActiveDropdownPrefix(open ? 'work' : null)}"), 'Must connect work onDropdownOpenChange');

  // No automatic blur replacement
  assert.ok(!content.includes('onBlurResolve'), 'CompleteProfileModal must not use auto-overwriting onBlurResolve');
});

test('Location inputs remain strictly independent across Home and Work profiles', () => {
  const filePath = path.join(frontendDir, 'src/components/ProfileSettingsModal.jsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Home section
  assert.ok(content.includes("locationSection('Home location (Me)', 'home'"), 'Must define home section with prefix home');
  // Work section
  assert.ok(content.includes("locationSection('Work or office location', 'work'"), 'Must define work section with prefix work');

  // Each uses prefix-isolated form properties
  assert.ok(content.includes("form[`${prefix}_address`]"), 'Must bind address to prefix-specific property');
  assert.ok(content.includes("form[`${prefix}_lat`]"), 'Must bind lat to prefix-specific property');
  assert.ok(content.includes("form[`${prefix}_lon`]"), 'Must bind lon to prefix-specific property');
  assert.ok(content.includes("id={`address-input-${prefix}`}"), 'Must assign unique ID per section prefix');
});

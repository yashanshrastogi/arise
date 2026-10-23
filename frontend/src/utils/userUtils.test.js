import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNameFromEmail,
  resolveDisplayName,
  getInitials,
} from './userUtils.js';

test('formatNameFromEmail formats dot-separated email addresses to capitalized full name', () => {
  assert.equal(formatNameFromEmail('yashansh.rastogi@gmail.com'), 'Yashansh Rastogi');
  assert.equal(formatNameFromEmail('john.doe@example.com'), 'John Doe');
  assert.equal(formatNameFromEmail('jane.mary.smith@company.org'), 'Jane Mary Smith');
});

test('formatNameFromEmail handles underscore and hyphen delimited emails', () => {
  assert.equal(formatNameFromEmail('yashansh_rastogi@gmail.com'), 'Yashansh Rastogi');
  assert.equal(formatNameFromEmail('alex-williams@outlook.com'), 'Alex Williams');
  assert.equal(formatNameFromEmail('priya_sharma_99@yahoo.com'), 'Priya Sharma');
});

test('formatNameFromEmail formats single word email usernames', () => {
  assert.equal(formatNameFromEmail('yashansh@gmail.com'), 'Yashansh');
  assert.equal(formatNameFromEmail('yashanshrastogi@gmail.com'), 'Yashanshrastogi');
  assert.equal(formatNameFromEmail('admin@arise.org'), 'Admin');
});

test('formatNameFromEmail handles empty, invalid, and null inputs gracefully', () => {
  assert.equal(formatNameFromEmail(''), 'Arise User');
  assert.equal(formatNameFromEmail(null), 'Arise User');
  assert.equal(formatNameFromEmail(undefined), 'Arise User');
  assert.equal(formatNameFromEmail('@nodomain'), 'Arise User');
});

test('resolveDisplayName prioritizes userProfile display_name over email', () => {
  const result = resolveDisplayName({
    user: { name: 'yashanshrastogi@gmail.com', email: 'yashanshrastogi@gmail.com' },
    userProfile: { display_name: 'Yashansh Rastogi' },
  });
  assert.equal(result, 'Yashansh Rastogi');
});

test('resolveDisplayName uses user.name when it is an actual name (not email)', () => {
  const result = resolveDisplayName({
    user: { name: 'Dr. Jane Smith', email: 'jane@clinic.org' },
    userProfile: null,
  });
  assert.equal(result, 'Dr. Jane Smith');
});

test('resolveDisplayName formats email when no display_name or real name is available', () => {
  const result = resolveDisplayName({
    user: { name: 'yashansh.rastogi@gmail.com', email: 'yashansh.rastogi@gmail.com' },
    userProfile: null,
  });
  assert.equal(result, 'Yashansh Rastogi');
});

test('getInitials correctly computes monograms for 1, 2, and multi-word names', () => {
  assert.equal(getInitials('Yashansh Rastogi'), 'YR');
  assert.equal(getInitials('Yashansh'), 'Y');
  assert.equal(getInitials('Jane Mary Smith'), 'JS');
  assert.equal(getInitials(''), 'U');
  assert.equal(getInitials(null), 'U');
});

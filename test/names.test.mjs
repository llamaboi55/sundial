import test from 'node:test';
import assert from 'node:assert/strict';
import { appName, siteOf, activityOf } from '../src/js/names.js';

test('friendly app names', () => {
  assert.equal(appName('chrome'), 'Chrome');
  assert.equal(appName('Code'), 'VS Code');
  assert.equal(appName('gnome-terminal-server'), 'Terminal');
  assert.equal(appName('my_cool-app'), 'My Cool App');
  assert.equal(appName(''), 'Unknown');
});

test('sites from browser titles', () => {
  assert.equal(siteOf('Lofi beats to study to - YouTube - Google Chrome'), 'YouTube');
  assert.equal(siteOf('(3) Home / X — Mozilla Firefox'), 'X');
  assert.equal(siteOf('r/programming: Reddit - Brave'), 'Reddit');
  assert.equal(siteOf('Why chips are hard – The Verge - Google Chrome'), 'The Verge');
  assert.equal(siteOf('New Tab - Google Chrome'), null);
  assert.equal(siteOf('Inbox (12) - me@example.com - Gmail'), 'Gmail');
  assert.equal(siteOf('Pull requests · owner/repo · GitHub'), 'GitHub');
});

test('activity is the site for browsers and the app otherwise', () => {
  assert.equal(activityOf({ app: 'firefox', title: 'Netflix — Mozilla Firefox' }).activity, 'Netflix');
  assert.equal(activityOf({ app: 'Google Chrome', title: '' }).activity, 'Chrome (other sites)');
  assert.equal(activityOf({ app: 'slack', title: 'general' }).activity, 'Slack');
});

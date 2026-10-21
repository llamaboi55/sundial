// Categories, and which activities fall into each. You can move anything to another
// category in the app; these are just sensible starting points.

export const CATEGORIES = [
  { id: 'work', name: 'Work', color: '#5b8cff', kind: 'focus' },
  { id: 'learning', name: 'Learning', color: '#38c9a7', kind: 'focus' },
  { id: 'communication', name: 'Communication', color: '#b38bff', kind: 'neutral' },
  { id: 'entertainment', name: 'Entertainment', color: '#ff6b81', kind: 'distraction' },
  { id: 'social', name: 'Social media', color: '#ffa94d', kind: 'distraction' },
  { id: 'shopping', name: 'Shopping', color: '#f7d154', kind: 'distraction' },
  { id: 'other', name: 'Other', color: '#7c8496', kind: 'neutral' },
];

const DEFAULTS = {
  work: ['VS Code', 'Cursor', 'Visual Studio', 'IntelliJ IDEA', 'PyCharm', 'Xcode', 'Sublime Text', 'Zed', 'Terminal', 'iTerm', 'PowerShell', 'Command Prompt', 'Alacritty', 'kitty', 'WezTerm',
    'Word', 'Excel', 'PowerPoint', 'OneNote', 'LibreOffice', 'LibreOffice Writer', 'LibreOffice Calc', 'Notion', 'Obsidian', 'Figma', 'Photoshop', 'Illustrator', 'Blender', 'GIMP', 'Inkscape',
    'GitHub', 'GitLab', 'Stack Overflow', 'MDN', 'Google Docs', 'Google Sheets', 'Google Slides', 'ChatGPT', 'Claude', 'Linear', 'Jira', 'Trello', 'File Explorer', 'Finder', 'Files'],
  learning: ['Wikipedia', 'Coursera', 'Udemy', 'Khan Academy', 'Duolingo'],
  communication: ['Slack', 'Discord', 'Teams', 'Zoom', 'Telegram', 'WhatsApp', 'Signal', 'Mail', 'Thunderbird', 'Outlook', 'Gmail', 'Google Meet', 'Google Calendar'],
  entertainment: ['YouTube', 'Netflix', 'Twitch', 'Prime Video', 'Disney+', 'Max', 'Spotify', 'VLC', 'Steam'],
  social: ['Reddit', 'Instagram', 'TikTok', 'Facebook', 'X', 'LinkedIn', 'Pinterest', 'Hacker News'],
  shopping: ['Amazon', 'eBay', 'Etsy', 'AliExpress'],
};

const LOOKUP = new Map(Object.entries(DEFAULTS).flatMap(([cat, names]) => names.map((n) => [n.toLowerCase(), cat])));

export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/** The category for an activity, using your own choices first. */
export function categorize(activity, overrides = {}) {
  if (overrides[activity]) return overrides[activity];
  return LOOKUP.get(String(activity).toLowerCase()) || 'other';
}

export const kindOf = (catId) => categoryById(catId).kind;

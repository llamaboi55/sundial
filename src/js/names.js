// Friendly names for programs, and the website behind a browser window's title.

const APPS = {
  chrome: 'Chrome', 'google-chrome': 'Chrome', 'google chrome': 'Chrome', msedge: 'Edge', 'microsoft-edge': 'Edge', 'microsoft edge': 'Edge',
  firefox: 'Firefox', 'firefox-esr': 'Firefox', brave: 'Brave', 'brave-browser': 'Brave', 'brave browser': 'Brave', safari: 'Safari',
  arc: 'Arc', opera: 'Opera', vivaldi: 'Vivaldi', chromium: 'Chromium', 'chromium-browser': 'Chromium', zen: 'Zen', 'zen browser': 'Zen',
  code: 'VS Code', 'visual studio code': 'VS Code', cursor: 'Cursor', devenv: 'Visual Studio', idea64: 'IntelliJ IDEA', pycharm64: 'PyCharm', 'jetbrains-idea': 'IntelliJ IDEA',
  xcode: 'Xcode', 'sublime_text': 'Sublime Text', 'sublime-text': 'Sublime Text', zed: 'Zed', windowsterminal: 'Terminal', 'gnome-terminal-server': 'Terminal',
  'org.gnome.terminal': 'Terminal', konsole: 'Terminal', iterm2: 'iTerm', terminal: 'Terminal', powershell: 'PowerShell', cmd: 'Command Prompt', alacritty: 'Alacritty', kitty: 'kitty', wezterm: 'WezTerm', 'wezterm-gui': 'WezTerm',
  winword: 'Word', 'microsoft word': 'Word', excel: 'Excel', 'microsoft excel': 'Excel', powerpnt: 'PowerPoint', 'microsoft powerpoint': 'PowerPoint', onenote: 'OneNote',
  outlook: 'Outlook', olk: 'Outlook', 'microsoft outlook': 'Outlook', 'ms-teams': 'Teams', teams: 'Teams', 'microsoft teams': 'Teams',
  slack: 'Slack', discord: 'Discord', zoom: 'Zoom', 'zoom.us': 'Zoom', telegram: 'Telegram', 'telegram desktop': 'Telegram', whatsapp: 'WhatsApp', signal: 'Signal', mail: 'Mail', thunderbird: 'Thunderbird',
  notion: 'Notion', obsidian: 'Obsidian', figma: 'Figma', 'figma_agent': 'Figma', photoshop: 'Photoshop', 'adobe photoshop': 'Photoshop', illustrator: 'Illustrator', blender: 'Blender', gimp: 'GIMP', 'gimp-2.10': 'GIMP', inkscape: 'Inkscape',
  spotify: 'Spotify', vlc: 'VLC', steam: 'Steam', steamwebhelper: 'Steam', obs64: 'OBS', obs: 'OBS', explorer: 'File Explorer', finder: 'Finder', nautilus: 'Files', 'org.gnome.nautilus': 'Files', dolphin: 'Files',
  'libreoffice-writer': 'LibreOffice Writer', 'libreoffice-calc': 'LibreOffice Calc', soffice: 'LibreOffice', 'systemsettings': 'Settings', 'system settings': 'Settings', 'gnome-control-center': 'Settings',
  sundial: 'Sundial', claude: 'Claude', chatgpt: 'ChatGPT',
};

const BROWSERS = new Set(['Chrome', 'Edge', 'Firefox', 'Brave', 'Safari', 'Arc', 'Opera', 'Vivaldi', 'Chromium', 'Zen']);

export function appName(raw = '') {
  const key = raw.trim().toLowerCase();
  if (APPS[key]) return APPS[key];
  if (!key) return 'Unknown';
  return raw.trim().replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const isBrowser = (name) => BROWSERS.has(name);

// Well-known sites, found anywhere in a browser title.
const SITES = [
  ['YouTube', /youtube/i], ['Netflix', /netflix/i], ['Twitch', /twitch/i], ['Prime Video', /prime video/i], ['Disney+', /disney\+/i], ['Max', /\bhbo max\b|\| max$/i],
  ['Reddit', /reddit/i], ['Instagram', /instagram/i], ['TikTok', /tiktok/i], ['Facebook', /facebook/i], ['X', /(^|[\s/|•-])(x|twitter)( |$)|twitter/i],
  ['LinkedIn', /linkedin/i], ['Pinterest', /pinterest/i], ['Hacker News', /hacker news/i], ['Amazon', /amazon\./i], ['eBay', /\bebay\b/i], ['Etsy', /\betsy\b/i], ['AliExpress', /aliexpress/i],
  ['Gmail', /gmail|- mail -|inbox \(\d+\)/i], ['Google Docs', /google docs/i], ['Google Sheets', /google sheets/i], ['Google Slides', /google slides/i], ['Google Calendar', /google calendar/i], ['Google Meet', /meet -|google meet/i],
  ['GitHub', /github/i], ['GitLab', /gitlab/i], ['Stack Overflow', /stack overflow/i], ['MDN', /\bmdn\b/i], ['Wikipedia', /wikipedia/i],
  ['ChatGPT', /chatgpt/i], ['Claude', /claude/i], ['Notion', /notion/i], ['Figma', /figma/i], ['Linear', /linear/i], ['Jira', /\bjira\b/i], ['Trello', /trello/i],
  ['Slack', /slack/i], ['Discord', /discord/i], ['WhatsApp', /whatsapp/i], ['Outlook', /outlook/i], ['Teams', /microsoft teams/i],
  ['Coursera', /coursera/i], ['Udemy', /udemy/i], ['Khan Academy', /khan academy/i], ['Duolingo', /duolingo/i], ['Spotify', /spotify/i],
];

const BROWSER_SUFFIX = /\s[-–—|]\s(google chrome|microsoft​? ?edge|mozilla firefox|firefox|brave|safari|opera|vivaldi|chromium|zen browser|arc)$/i;

/** The site behind a browser window title, or null when it can't tell. */
export function siteOf(title = '') {
  let t = title.trim().replace(BROWSER_SUFFIX, '').replace(/\s[-–—]\s(personal|work|profile \d+)$/i, '');
  if (!t || /^(new tab|start page|untitled)$/i.test(t)) return null;
  for (const [name, re] of SITES) if (re.test(t)) return name;
  // Most sites end their titles with their own name: "Article – The Verge".
  const parts = t.split(/\s[-–—|•·]\s/).map((p) => p.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last.length <= 32) return last;
  return null;
}

/** What a session counts as: a site for browsers, otherwise the app. */
export function activityOf(session) {
  const app = appName(session.app);
  if (isBrowser(app)) return { activity: siteOf(session.title) || `${app} (other sites)`, app };
  return { activity: app, app };
}

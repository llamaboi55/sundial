// The nudge cat, drawn in SVG. mood: 'stern' (arms crossed, eyes narrowed) or 'happy'.
export function catSVG(mood = 'stern') {
  const eyes = mood === 'happy'
    ? '<path d="M44 58 q6 -6 12 0" stroke="#1d1b22" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M66 58 q6 -6 12 0" stroke="#1d1b22" stroke-width="3" fill="none" stroke-linecap="round"/>'
    : `<ellipse cx="50" cy="58" rx="6" ry="6.5" fill="#1d1b22"/><ellipse cx="72" cy="58" rx="6" ry="6.5" fill="#1d1b22"/>
       <circle cx="52" cy="56" r="1.8" fill="#fff"/><circle cx="74" cy="56" r="1.8" fill="#fff"/>
       <path d="M42 50 l14 4 M80 50 l-14 4" stroke="#1d1b22" stroke-width="3" stroke-linecap="round"/>
       <g class="lids"><rect x="42" y="51" width="16" height="14" rx="6" fill="#f2a65a"/><rect x="64" y="51" width="16" height="14" rx="6" fill="#f2a65a"/></g>`;
  const mouth = mood === 'happy'
    ? '<path d="M55 70 q6 6 12 0" stroke="#1d1b22" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
    : '<path d="M56 72 q5 -3 10 0" stroke="#1d1b22" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 120 120" aria-hidden="true">
    <path class="tail" d="M78 96 q30 -2 26 -30 q-2 -10 -8 -8 q-4 2 -1 8 q3 16 -19 20 z" fill="#e8913f"/>
    <ellipse cx="60" cy="98" rx="30" ry="18" fill="#f2a65a"/>
    <path d="M44 100 q16 8 32 0" stroke="#e08b3a" stroke-width="3" fill="none"/>
    <g class="ear-l"><path d="M28 46 L32 18 L52 36 z" fill="#f2a65a"/><path d="M33 40 L35 26 L45 36 z" fill="#ffc9a6"/></g>
    <path d="M94 46 L90 18 L70 36 z" fill="#f2a65a"/><path d="M89 40 L87 26 L77 36 z" fill="#ffc9a6"/>
    <ellipse cx="61" cy="60" rx="35" ry="29" fill="#f2a65a"/>
    <path d="M52 34 q2 8 0 14 M61 32 v16 M70 34 q-2 8 0 14" stroke="#e08b3a" stroke-width="3" stroke-linecap="round" fill="none"/>
    <ellipse cx="44" cy="70" rx="6" ry="3.5" fill="#ff8f8f" opacity="0.45"/><ellipse cx="78" cy="70" rx="6" ry="3.5" fill="#ff8f8f" opacity="0.45"/>
    ${eyes}
    <path d="M58.5 65 h5 l-2.5 3 z" fill="#d9666a"/>
    ${mouth}
    <path d="M30 66 h-12 M30 70 l-11 3 M92 66 h12 M92 70 l11 3" stroke="#fff" stroke-opacity="0.55" stroke-width="1.4" stroke-linecap="round"/>
    ${mood === 'happy' ? '' : '<path d="M40 92 q20 -8 40 0 q-4 8 -20 8 q-16 0 -20 -8 z" fill="#e8913f"/>'}
  </svg>`;
}

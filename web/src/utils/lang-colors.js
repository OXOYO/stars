/** GitHub Linguist–style accent colors for language chips */
const LANG_COLORS = {
  TypeScript: '#3178c6',
  JavaScript: '#d4a017',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  Java: '#b07219',
  Ruby: '#cc342d',
  'C++': '#f34b7d',
  'C#': '#178600',
  PHP: '#4f5d95',
  Swift: '#fa7343',
  Kotlin: '#a97bff',
  Dart: '#00b4ab',
  Shell: '#89e051',
  Vue: '#41b883',
  CSS: '#563d7c',
  HTML: '#e34c26',
  其他: '#8b949e',
};

export function langColor(name) {
  if (!name || name === 'all') return '#8b949e';
  return LANG_COLORS[name] || '#6e7681';
}

export function langSlug(name) {
  return (name || 'other').replace(/\+/g, 'plus').replace(/\s+/g, '-').toLowerCase();
}

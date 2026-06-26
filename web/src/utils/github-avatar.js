/**
 * GitHub 用户/组织头像（直连 avatars CDN，避免 github.com/*.png 302）
 * @param {string} owner
 * @param {number} [size]
 */
export function githubOwnerAvatarUrl(owner, size = 80) {
  const name = (owner || '').trim();
  if (!name) return '';
  const px = Math.max(16, Math.min(512, Number(size) || 80));
  return `https://avatars.githubusercontent.com/${encodeURIComponent(name)}?s=${px}&v=4`;
}

/** 用户或组织主页 */
export function githubOwnerProfileUrl(owner) {
  const name = (owner || '').trim();
  if (!name) return '';
  return `https://github.com/${encodeURIComponent(name)}`;
}

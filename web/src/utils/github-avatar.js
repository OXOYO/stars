/**
 * GitHub 用户/组织头像（比 API 返回的 u/id 链接更稳，兼容 Pages 与本地 dev）
 * @param {string} owner
 * @param {number} [size]
 */
export function githubOwnerAvatarUrl(owner, size = 80) {
  const name = (owner || '').trim();
  if (!name) return '';
  return `https://github.com/${encodeURIComponent(name)}.png?size=${size}`;
}

/** 用户或组织主页 */
export function githubOwnerProfileUrl(owner) {
  const name = (owner || '').trim();
  if (!name) return '';
  return `https://github.com/${encodeURIComponent(name)}`;
}

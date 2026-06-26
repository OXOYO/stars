import { GALAXY } from '../web/src/galaxy/constants.js';
import { findAnchorRepoId } from '../web/src/galaxy/force-similarity.js';
import {
  isSerializableGalaxyLayout,
  serializeVirtualGalaxyLayout,
} from '../web/src/galaxy/layout-payload.js';
import { expandReposToVirtualStars, buildTopicRingKeySet } from '../web/src/galaxy/virtual-stars.js';
import {
  buildLanguageLayout,
  buildGalaxyGasBuffers,
  buildStructuredVirtualPositions,
} from '../web/src/galaxy/positions.js';

/**
 * 生成 galaxy.json：螺旋盘面仓锚点 + 虚拟星摆位（语言团 / topic 环）
 * @param {Array<object>} items
 */
export function computeGalaxyLayout(items) {
  const list = items || [];
  if (!list.length) {
    return serializeVirtualGalaxyLayout(list, [], new Float32Array(0), -1);
  }

  const anchorRepoId = findAnchorRepoId(list);
  const virtualStars = expandReposToVirtualStars(list);
  const langLayout = buildLanguageLayout(list);
  const ringKeys = buildTopicRingKeySet(virtualStars, langLayout);

  const gasBuffers = buildGalaxyGasBuffers(langLayout, list);

  const { positions: virtualPositions } = buildStructuredVirtualPositions(
    list,
    virtualStars,
    langLayout,
    ringKeys,
    gasBuffers
  );

  let anchorRepoIndex = -1;
  if (anchorRepoId) {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i]?.id === anchorRepoId) {
        anchorRepoIndex = i;
        break;
      }
    }
  }

  const layout = serializeVirtualGalaxyLayout(
    list,
    virtualStars,
    virtualPositions,
    anchorRepoIndex
  );

  if (!isSerializableGalaxyLayout(layout)) {
    throw new Error('虚拟星布局结果无效（含 NaN），请检查摆位参数');
  }

  return layout;
}

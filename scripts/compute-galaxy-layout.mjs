import { runForceLayout3D } from '../web/src/galaxy/force-layout.js';
import { serializeGalaxyLayout, isSerializableGalaxyLayout } from '../web/src/galaxy/layout-payload.js';

/**
 * 生成 stars.json 时预计算星云力导向坐标
 * @param {Array<object>} items
 */
export function computeGalaxyLayout(items) {
  const layout = serializeGalaxyLayout(items, runForceLayout3D);
  if (!isSerializableGalaxyLayout(layout)) {
    throw new Error('力导向布局结果无效（含 NaN），请检查算法参数');
  }
  return layout;
}

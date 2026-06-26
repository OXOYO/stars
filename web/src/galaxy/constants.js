export const GALAXY = {
  RADIUS: 100,
  /** 对数螺旋紧度 */
  TWIST: 2.55,
  /** 角度散布 — 越小臂越清晰、整体越聚拢 */
  ARM_SPREAD: 0.52,
  /** 盘厚（外缘） */
  THICKNESS: 14,
  /** 银心球状隆起高度（过高会堆成中心白团） */
  BULGE: 8,
  /** 场星比例：不沿螺旋臂分布的随机星 */
  FIELD_RATIO: 0.18,
  /** 语言聚团：布局以语言团为主、螺旋为辅 */
  LANG_CLUSTER_PULL: 0.0,
  LANG_RADIAL_PULL: 0.0,
  /** 布局中单独聚团的语言种类上限，其余并入「其他」 */
  LAYOUT_LANG_TOP: 12,
  /** 每种语言占用的角宽度系数 */
  LANG_WEDGE_FILL: 0.9,
  /** 语言团内散布半径 */
  LANG_CLUSTER_SPREAD_R: 24,
  LANG_CLUSTER_SPREAD_ANG: 1.32,
  /** 语言团在 XZ / Y 方向的体积散布 */
  VOLUME_SPREAD_XZ: 9,
  VOLUME_SPREAD_Y: 11,
  /** topic 在语言扇区内的径向微偏移 */
  TOPIC_RADIAL_JITTER: 1.1,
  /** topic 星环：关闭后 topic 仅用弥散星云，避免几何亮环 */
  TOPIC_RINGS_ENABLED: false,
  /** topic 星环：同语言+同 topic 至少 N 颗才成环（固定阈值，筛选不降低） */
  TOPIC_RING_MIN_COUNT: 10,
  /** 每语言最多环数 = min(TOPIC_RING_MAX_COUNT, ceil(topic种类 × TOPIC_RING_MAX_PERCENT)) */
  TOPIC_RING_MAX_COUNT: 10,
  TOPIC_RING_MAX_PERCENT: 0.1,
  TOPIC_RING_RADIUS_BASE: 12,
  TOPIC_RING_RADIUS_SCALE: 1.35,
  /** 宇宙布局：topic 环半径不超过语言星系半径 × 该系数 */
  TOPIC_RING_GALAXY_FRAC: 0.32,
  /** 单 topic 环上最多排多少颗星（其余散在环内云团） */
  TOPIC_RING_SURFACE_MAX: 56,
  /** 云团内同仓多 topic 的散布半径 */
  TOPIC_CLOUD_SPREAD: 16,
};

export const R_MIN = 5;
export const R_MAX = 108;

export const STAR_YEAR_MIN = 2008;
export const STAR_YEAR_MAX = 2026;

export const LEGEND_LANG_TOP = 10;

/** 星云盘面初始倾角（弧度）；宇宙内观测时保持 0，避免整体压成盘面 */
export const GALAXY_TILT_X = 0;

/**
 * 分层天文运动：宇宙漂移 + 星系差动自转（无嵌套公转环）
 * 参考：旋臂恒星共转盘面；开放星团随盘面整体转动，不独立绕圈
 */
export const GALAXY_MOTION = {
  /** 全局运动速率缩放（拖拽环顾、星系差速、自动旋转） */
  SPEED_SCALE: 0.72,
  /** 全场极慢漂移（叠加在每星宇宙层之上） */
  UNIVERSE_SPIN: 0.000028,
  /** 语言星系中心绕宇宙原点公转 */
  HUB_ORBIT_BASE: 0.0016,
  HUB_ORBIT_SPREAD: 0.75,
  /** 星系绕 hub 差动自转（内快外慢） */
  GALAXY_SPIN_BASE: 0.016,
  GALAXY_SPIN_SPREAD: 0.92,
  /** 已弃用：嵌套公转会产生可见亮环，置 0 */
  GALAXY_ORBIT_BASE: 0,
  GALAXY_ORBIT_SPREAD: 0,
  /** 开放星团整体微自转（同盘面，非独立轨道） */
  CLUSTER_SPIN_BASE: 0.003,
  CLUSTER_SPIN_SPREAD: 0.55,
  CLUSTER_ORBIT_BASE: 0,
  CLUSTER_ORBIT_SPREAD: 0,
  TOPIC_MIN_COUNT: 6,
  /** 单星无公转；仅保留极弱 Y 起伏模拟视向速度 */
  STAR_SPIN_BASE: 0,
  STAR_SPIN_SPREAD: 0,
  STAR_ORBIT_BASE: 0,
  STAR_ORBIT_SPREAD: 0,
  STAR_BOB_BASE: 0.85,
  STAR_BOB_SPREAD: 2.0,
  /** 星系际星：加强宇宙漂移、减弱星系绑定 */
  FIELD_UNIVERSE_MULT: 1.65,
  FIELD_GALAXY_MULT: 0.22,
};

/** 星点闪烁综合权重（推送时效 / star / watch / fork） */
export const TWINKLE_WEIGHTS = {
  PUSH: 0.34,
  STARS: 0.32,
  WATCHERS: 0.16,
  FORKS: 0.18,
};

/** 闪烁活跃度分位曲线：>1 时更多星落在低活跃区，高活跃更稀缺 */
export const TWINKLE_RANK_GAMMA = 1.72;

/** 推送时效衰减天数（用于大小、亮度、闪烁） */
export const PUSH_RECENCY_HALF_LIFE_DAYS = 540;

/** 星点大小 / 亮度综合权重（推送时效 + star + watch + fork） */
export const PARTICLE_VISUAL_WEIGHTS = {
  PUSH: 0.28,
  STARS: 0.38,
  WATCHERS: 0.18,
  FORKS: 0.16,
};

/** 星点尺寸区间（attribute aSize）— 由分位排名映射，见 buildStarSizes */
export const PARTICLE_SIZE_RANGE = {
  MIN: 0.035,
  MAX: 3.6,
  /** @deprecated 单仓估算仍可用于测试 */
  GAMMA: 0.95,
  /** 分位曲线：<1 时头部仓更大、尾部更小 */
  RANK_GAMMA: 0.55,
};

/** 星点尺寸分数权重（不含推送时效） */
export const PARTICLE_SIZE_WEIGHTS = {
  STARS: 0.58,
  WATCHERS: 0.24,
  FORKS: 0.18,
};

/** 星点亮度区间（attribute aBright） */
export const PARTICLE_BRIGHT_RANGE = {
  MIN: 0.08,
  MAX: 0.92,
  GAMMA: 1.28,
};

/** 3D 力导向布局（星点坐标） */
export const FORCE_LAYOUT = {
  NEIGHBOR_K: 14,
  SIM_THRESHOLD: 0.12,
  CROSS_LANG_SIM_MIN: 0.32,
  STEPS: 220,
  EARLY_STOP_MIN: 55,
  EARLY_STOP_V: 0.038,
  DT: 0.38,
  DAMPING: 0.86,
  REPULSION: 980,
  INTER_LANG_REPULSE: 3.15,
  SPRING: 0.098,
  INTRA_LANG_SPRING: 1.42,
  CROSS_LANG_SPRING: 0.58,
  INTRA_REST_LENGTH: 18,
  CROSS_REST_LENGTH: 36,
  CELL_SIZE: 18,
  CENTER_GRAVITY: 0.00055,
  LANG_CLUSTER_PULL: 0.0092,
  INIT_CLUSTER_RADIUS: 52,
  /** 语言团初始散布：盘面厚度（Y） */
  DISK_THICKNESS: 7,
  /** 仿真结束后压扁 Y，形成星系盘而非球团 */
  DISK_FLATTEN: 0.28,
  LANG_BUCKET_MAX: 48,
  TOPIC_PEER_MAX: 36,
  TARGET_SPAN: 115,
  /** >0 时每颗星只与最近的 K 个邻居计算斥力（大数据集加速） */
  REPULSION_MAX_NEIGHBORS: 0,
  TIME_TAU_DAYS: 280,
  /** 建边相似度：语言/topic 主导聚团，时间仅作弱微调 */
  WEIGHTS: { time: 0.12, lang: 0.46, topic: 0.42 },
};

/** 分层摆位：语言团 → topic 子团/星环 → 单星 */
export const HIERARCHY_LAYOUT = {
  LANG_FORCE_STEPS: 42,
  LANG_REPULSION: 2800,
  LANG_CENTER_PULL: 0.006,
  TOPIC_FORCE_STEPS: 56,
  TOPIC_REPULSION: 680,
  TOPIC_CENTER_PULL: 0.012,
  LANG_SPAN_FACTOR: 0.9,
  /** 宇宙层语言团径向：base + spread×cbrt(份额)，避免拉成碎屑 */
  UNIVERSE_R_BASE: 0.14,
  UNIVERSE_R_SPREAD: 0.38,
  LANG_UNIVERSE_RADIUS: 0.94,
  LANG_ANCHOR_PULL: 0.0032,
  GALAXY_VOLUME_RATIO: 0.44,
  LANG_IRREGULAR_Y: 0.11,
  CLOUD_SPREAD_BASE: 5.5,
  CLOUD_SPREAD_SCALE: 1.65,
  CLOUD_SPREAD_PER_STAR: 0.22,
  RING_GROUP_SPREAD_MIN: 10,
  STAR_FORCE_STEPS: 72,
  STAR_FORCE_STEPS_LARGE: 52,
  STAR_REPULSION: 540,
  STAR_CLUSTER_PULL: 0.0036,
  /** 1 = 保持立体，不再压扁成盘面 */
  STAR_VOLUME_KEEP: 1,
  INTER_TOPIC_REPULSE: 3.8,
  RING_SPRING_MULT: 1.22,
  RING_REST_LENGTH: 7.8,
  RING_MAX_SPREAD_RATIO: 0.24,
};

/**
 * 宇宙级摆位 — Phase 2：单一密度场 + 语言软聚类（哈勃深场式交融）
 * - 全仓共享一个宇宙球体密度场
 * - 语言 = 重叠的高斯吸引子（无硬 hub 边界）
 * - topic → 开放星团；仓 → 恒星
 */
export const COSMIC_UNIVERSE = {
  /** 纯场星：均匀撒在整个宇宙球，不归属任何语言核 */
  INTERGALACTIC_RATIO: 0.26,
  /** 语言吸引子中心散布半径（占宇宙跨度） */
  ATTRACTOR_CORE_FRAC: 0.36,
  /** 语言高斯核 σ（越大 → 语言团越交融） */
  KERNEL_SIGMA_FRAC: 0.26,
  KERNEL_SIGMA_POWER: 0.22,
  /** 主语言核与次核的位置混合比（模拟深场交界模糊） */
  KERNEL_OVERLAP_BLEED: 0.16,
  /** 大尺度丝状扰动（宇宙网弱结构） */
  FIELD_FILAMENT: 0.045,
  /** @deprecated 兼容 motion/gas：等同 KERNEL_SIGMA_FRAC */
  GALAXY_BASE_FRAC: 0.26,
  GALAXY_SIZE_POWER: 0.22,
  HUB_RADIUS_FRAC: 0.36,
  HUB_Y_FLATTEN: 1.0,
  GALAXY_DISK_Y: 0.78,
  GALAXY_FIELD_RATIO: 1.0,
  GALAXY_ARM_STRENGTH: 0,
  GALAXY_ARMS: 2,
  GALAXY_TILT_SPREAD: 1.05,
  CLUSTER_WISP: 0.22,
  MULTI_TOPIC_SIBLING: 0.38,
  GAS_PARTICLES_PER_GALAXY: 132,
  /** 每语言暗尘粒子（NormalBlending，填 clump 中心） */
  GAS_DUST_PER_GALAXY: 32,
  GAS_CORE_FILL_COUNT: 0,
  GAS_LANG_TOP_PERCENT: 0.5,
  GAS_DISK_RADIUS_MULT: 1.12,
  GAS_DISK_RADIUS_JITTER: 0.14,
  GAS_Y_DISK_MULT: 1.0,
  INTERGALACTIC_SPREAD: 0.62,
  UNIVERSE_Y_FLATTEN: 1.0,
  /** 全局 H II 发射雾（独立于语言层，撒满密度场） */
  FIELD_GAS_COUNT: 240,
  FIELD_DUST_COUNT: 52,
};
export const MORPHOLOGY_LAYOUT = {
  VOLUME_SCALE: 0.68,
  /** 星团最小散布半径 */
  CLUSTER_SPREAD_MIN: 0.85,
  /** 星团最大散布半径（随团内仓数对数增长） */
  CLUSTER_SPREAD_MAX: 2.6,
  CLUSTER_SPREAD_LOG: 0.72,
  /** 单仓恒星在锚点附近的抖动（无 topic 或场星） */
  REPO_JITTER_MIN: 0.35,
  REPO_JITTER_MAX: 1.15,
  DUST_RATIO: 0.08,
  GROUP_SPREAD_MIN: 12,
  GROUP_SPREAD_PER_STAR: 1.85,
  RING_R_BASE: 2.8,
  RING_R_MAX: 9.8,
  RING_ARC_MIN: 0.8,
  RING_ARC_MAX: 1.65,
  RING_RADIUS_SCALE: 0.88,
  RING_TUBE_SCALE: 1.35,
  /** topic 云团：核区采样占比 */
  NEBULA_CORE_RATIO: 0.22,
  /** 外晕径向幂律 */
  NEBULA_HALO_POWER: 1.45,
  NEBULA_HALO_SCALE: 0.76,
  /** 语言团内 topic 云团散布系数 */
  LANG_SPREAD_FACTOR: 0.14,
};

/** 星云缩放与拾取 */
export const SCENE_FOG = {
  /** FogExp2 密度：压低以免整体发灰发糊 */
  DENSITY: 0.0018,
};

export const GALAXY_ZOOM = {
  /** OrbitControls 最近距离硬下限（越小 = 可放得越大） */
  MIN_DISTANCE: 0.08,
  /** 最远距离下限（实际会按星云尺度动态放大） */
  MAX_DISTANCE: 800,
  /** 缩放灵敏度（工具栏按钮每档 notches；滚轮一格对齐同档） */
  ZOOM_SPEED: 1.0,
  /** 每次标准滚轮刻度在 log 缩放区间内前进的占比（全范围恒定步进） */
  RANGE_FRACTION_PER_NOTCH: 0.055,
  /** 浏览器 wheel deltaY 与「一格」的换算 */
  WHEEL_NOTCH: 100,
  /** 宇宙内观测：最远缩放 = maxR × 该系数 */
  OBSERVER_MAX_DISTANCE_MULT: 1.62,
  /** 宇宙内观测：最近缩放 = maxR × 该系数（相对星系半径） */
  OBSERVER_MIN_DISTANCE_FRAC: 0.0028,
  /** @deprecated 保留兼容 */
  OBSERVER_MIN_DISTANCE_MULT: 0.028,
  /** 宇宙内观测：初始视距 = maxR × 该系数 */
  OBSERVER_DEFAULT_DISTANCE_MULT: 0.28,
  /** 天文模式：初始视线方向（略俯视角，便于 orbit） */
  OBSERVER_VIEW_DIR: [0.34, 0.46, 0.82],
  /** OrbitControls 自动环绕速度 */
  AUTO_ROTATE_SPEED: 0.18,
  /** 拖拽环视灵敏度（原 OrbitControls rotateSpeed=1 + damping≈0.08 的有效手感） */
  ORBIT_ROTATE_SPEED: 0.85,
  /** 相机缓动时长（毫秒） */
  CAMERA_FOCUS_MS: 760,
  CAMERA_DOLLY_MS: 260,
  CAMERA_RESET_MS: 680,
  /** 双指 pinch：每像素间距变化换算为 dolly 档位数 */
  PINCH_NOTCH_PER_PX: 0.022,
  /** 中键拖拽：每像素纵向位移换算为 dolly 档位数 */
  MIDDLE_DRAG_NOTCH_PER_PX: 0.014,
  /** 方向键 orbit 步长（弧度） */
  KEYBOARD_ORBIT_AZIMUTH: 0.07,
  KEYBOARD_ORBIT_POLAR: 0.05,
  /** 屏幕像素：星点最大渲染尺寸 */
  POINT_SIZE_MAX: 78,
  /** 星点视距缩放：深度下限（越小拉近时点越大） */
  POINT_VIEW_Z_MIN: 0.42,
  POINT_DIST_SCALE_DIV: 200.0,
  POINT_DIST_SCALE_MIN: 1.15,
  POINT_DIST_SCALE_MAX: 52.0,
  /** 气体粒子视距缩放（与星点同理） */
  GAS_VIEW_Z_MIN: 4.0,
  GAS_DIST_SCALE_DIV: 220.0,
  GAS_DIST_SCALE_MIN: 2.8,
  GAS_DIST_SCALE_MAX: 22.0,
  GAS_POINT_SIZE_MAX: 42.0,
  GAS_DUST_POINT_SIZE_MAX: 14.0,
  /** Points 屏幕拾取：像素半径下限 / 上限 / 相对星点尺寸比例 */
  PICK_RADIUS_MIN: 8,
  PICK_RADIUS_MAX: 40,
  PICK_RADIUS_SCALE: 0.72,
  /** 定位单颗星：目标屏幕像素半径（用于反推视距） */
  FOCUS_TARGET_POINT_PX: 34,
  /** 定位单颗星时的视距下限 / 上限（世界单位） */
  FOCUS_STAR_MIN_DISTANCE: 0.09,
  FOCUS_STAR_MAX_DISTANCE: 3.4,
  /** @deprecated 仅无 aSize 时的包围盒回退 */
  FOCUS_STAR_SPAN: 2.2,
  FOCUS_STAR_PADDING: 1.12,
};

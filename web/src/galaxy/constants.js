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
  FIELD_RATIO: 0.24,
  /** 语言聚团：布局以语言团为主、螺旋为辅 */
  LANG_CLUSTER_PULL: 0.0,
  LANG_RADIAL_PULL: 0.0,
  /** 布局中单独聚团的语言种类上限，其余并入「其他」 */
  LAYOUT_LANG_TOP: 12,
  /** 每种语言占用的角宽度系数 */
  LANG_WEDGE_FILL: 0.78,
  /** 语言团内散布半径 */
  LANG_CLUSTER_SPREAD_R: 16,
  LANG_CLUSTER_SPREAD_ANG: 1.32,
  /** 语言团在 XZ / Y 方向的体积散布 */
  VOLUME_SPREAD_XZ: 9,
  VOLUME_SPREAD_Y: 8,
  /** topic 在语言扇区内的径向微偏移 */
  TOPIC_RADIAL_JITTER: 1.1,
};

export const R_MIN = 5;
export const R_MAX = 108;

export const STAR_YEAR_MIN = 2008;
export const STAR_YEAR_MAX = 2026;

export const LEGEND_LANG_TOP = 10;

/** 星系盘面初始倾角（弧度），配合斜侧视展示厚度 */
export const GALAXY_TILT_X = 0.42;

/**
 * 分层天文运动（均由自动旋转开关统一控制）
 * - 宇宙：galaxyGroup 整体公转
 * - 语言 / topic：刚体公转 + 自转（团内同角速度，避免差速剪切拉成线）
 */
export const GALAXY_MOTION = {
  /** galaxyGroup 宇宙公转（rad / 帧，仅 autoRotate 时） */
  UNIVERSE_SPIN: 0.00012,
  /** 语言团绕银心公转（rad/s） */
  LANG_ORBIT_BASE: 0.014,
  /** 语言团刚体自转（rad/s） */
  LANG_SPIN_BASE: 0.055,
  LANG_SPIN_MIN: 0.65,
  LANG_SPIN_MAX: 1.15,
  /** topic 子盘：至少 N 颗才启用 */
  TOPIC_MIN_COUNT: 4,
  /** topic 子盘刚体自转（rad/s），叠加在语言自转之上 */
  TOPIC_SPIN_BASE: 0.085,
  TOPIC_SPIN_MIN: 0.45,
  TOPIC_SPIN_MAX: 1.05,
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

/** 星点尺寸区间（attribute aSize） */
export const PARTICLE_SIZE_RANGE = {
  MIN: 0.1,
  MAX: 2.75,
  GAMMA: 0.82,
};

/** 星点亮度区间（attribute aBright） */
export const PARTICLE_BRIGHT_RANGE = {
  MIN: 0.12,
  MAX: 0.82,
  GAMMA: 0.85,
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
  INTER_LANG_REPULSE: 2.75,
  SPRING: 0.098,
  INTRA_LANG_SPRING: 1.42,
  CROSS_LANG_SPRING: 0.58,
  INTRA_REST_LENGTH: 18,
  CROSS_REST_LENGTH: 36,
  CELL_SIZE: 18,
  CENTER_GRAVITY: 0.0018,
  LANG_CLUSTER_PULL: 0.0048,
  INIT_CLUSTER_RADIUS: 44,
  LANG_BUCKET_MAX: 48,
  TOPIC_PEER_MAX: 36,
  TARGET_SPAN: 115,
  /** >0 时每颗星只与最近的 K 个邻居计算斥力（大数据集加速） */
  REPULSION_MAX_NEIGHBORS: 0,
  TIME_TAU_DAYS: 280,
  /** 建边相似度：语言/topic 主导聚团，时间仅作弱微调 */
  WEIGHTS: { time: 0.12, lang: 0.46, topic: 0.42 },
};

/** 星云缩放与拾取 */
export const GALAXY_ZOOM = {
  /** OrbitControls 最近距离 */
  MIN_DISTANCE: 1.8,
  /** 最远距离下限（实际会按星云尺度动态放大） */
  MAX_DISTANCE: 800,
  ZOOM_SPEED: 0.48,
  /** 滚轮/按钮缩放步进 */
  DOLLY_IN: 0.84,
  DOLLY_OUT: 1.22,
  /** 屏幕像素：星点最大渲染尺寸 */
  POINT_SIZE_MAX: 88,
  /** Points 射线拾取阈值（世界单位，随距离在组件内缩放） */
  PICK_THRESHOLD: 6,
  /** 定位单颗星时的包围尺度与距离上限 */
  FOCUS_STAR_SPAN: 5,
  FOCUS_STAR_PADDING: 2.35,
  FOCUS_STAR_MAX_DISTANCE: 38,
};

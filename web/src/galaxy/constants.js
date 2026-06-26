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
 * 分层天文运动：宇宙 → 星系 → 星云 → 单星，各层独立角速度与相位
 */
export const GALAXY_MOTION = {
  /** 全局运动速率缩放（拖拽环顾、星系差速、自动旋转） */
  SPEED_SCALE: 0.82,
  /** 全场极慢漂移（叠加在每星宇宙层之上） */
  UNIVERSE_SPIN: 0.000033,
  /** 语言星系中心绕宇宙原点公转 */
  HUB_ORBIT_BASE: 0.0055,
  HUB_ORBIT_SPREAD: 1.15,
  /** 星系绕自身中心自转 */
  GALAXY_SPIN_BASE: 0.026,
  GALAXY_SPIN_SPREAD: 1.22,
  /** 星系内轨道起伏（相对 hub） */
  GALAXY_ORBIT_BASE: 0.008,
  GALAXY_ORBIT_SPREAD: 1.02,
  /** 星云（topic 团）自转 */
  NEBULA_SPIN_BASE: 0.02,
  NEBULA_SPIN_SPREAD: 1.05,
  /** 星云内轨道 */
  NEBULA_ORBIT_BASE: 0.007,
  NEBULA_ORBIT_SPREAD: 0.95,
  TOPIC_MIN_COUNT: 10,
  /** 单星微自转 / 微公转 */
  STAR_SPIN_BASE: 0.026,
  STAR_SPIN_SPREAD: 1.08,
  STAR_ORBIT_BASE: 0.008,
  STAR_ORBIT_SPREAD: 1.0,
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
 * 宇宙级摆位（参考哈勃深场 / 宇宙网）：
 * - 语言 → 独立倾斜星系（椭球盘，非单一大盘螺旋）
 * - topic → 仓周星云晕
 * - 场星 → 星系际与臂间弥散
 */
export const COSMIC_UNIVERSE = {
  /** 仓落在星系际（宇宙背景场星） */
  INTERGALACTIC_RATIO: 0.11,
  /** 单语言星系半径系数（相对宇宙跨度） */
  GALAXY_BASE_FRAC: 0.21,
  GALAXY_SIZE_POWER: 0.46,
  /** 星系中心分布半径（越小 → 语言星系彼此更近） */
  HUB_RADIUS_FRAC: 0.48,
  HUB_Y_FLATTEN: 0.9,
  /** 星系内盘面扁率、臂间场星 */
  GALAXY_DISK_Y: 0.36,
  GALAXY_FIELD_RATIO: 0.52,
  GALAXY_ARM_STRENGTH: 0.11,
  GALAXY_ARMS: 2,
  /** 星系整体随机倾角 */
  GALAXY_TILT_SPREAD: 0.72,
  /** 虚拟星云晕 */
  NEBULA_WISP: 0.28,
  TOPIC_NEBULA_BOOST: 1.12,
  /** 语言星系着色气体云：每星系粒子数 */
  GAS_PARTICLES_PER_GALAXY: 420,
  /** 每星系核心填充粒子（填实中心，避免环状空洞） */
  GAS_CORE_FILL_COUNT: 80,
  /** 仅仓数排名前一定比例的语言显示气体云 */
  GAS_LANG_TOP_PERCENT: 0.2,
  /** 气体云盘面半径相对星系半径（≈1 覆盖整星系） */
  GAS_DISK_RADIUS_MULT: 0.96,
  GAS_DISK_RADIUS_JITTER: 0.06,
  /** 气体云竖直厚度 = 星系盘面扁率 × 该系数 */
  GAS_Y_DISK_MULT: 1.02,
  INTERGALACTIC_SPREAD: 0.42,
  /** 最终 Y 压扁：接近 1 保持宇宙球体体积 */
  UNIVERSE_Y_FLATTEN: 0.9,
};

/** 形态学摆位：局部星云散布参数 */
export const MORPHOLOGY_LAYOUT = {
  VOLUME_SCALE: 0.62,
  NEBULA_SPREAD_MIN: 1.55,
  NEBULA_SPREAD_MAX: 4.6,
  DUST_RATIO: 0.16,
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
  /** FogExp2 密度：仅作用于星点/尘粒着色器，气体云不受雾衰减 */
  DENSITY: 0.0055,
};

export const GALAXY_ZOOM = {
  /** OrbitControls 最近距离 */
  MIN_DISTANCE: 0.42,
  /** 最远距离下限（实际会按星云尺度动态放大） */
  MAX_DISTANCE: 800,
  /** 缩放灵敏度（按钮与滚轮共用） */
  ZOOM_SPEED: 1.0,
  /** 每次标准滚轮刻度在 log 缩放区间内前进的占比（全范围恒定步进） */
  RANGE_FRACTION_PER_NOTCH: 0.048,
  /** 浏览器 wheel deltaY 与「一格」的换算 */
  WHEEL_NOTCH: 100,
  /** 宇宙内观测：最远缩放 = maxR × 该系数（越大可缩得越远） */
  OBSERVER_MAX_DISTANCE_MULT: 1.62,
  /** 宇宙内观测：最近缩放 = anchorDist × 该系数（越小可放得越大/更近） */
  OBSERVER_MIN_DISTANCE_MULT: 0.08,
  /** 宇宙内观测：初始视距 = maxR × 该系数（过大需缩远才能看全团） */
  OBSERVER_DEFAULT_DISTANCE_MULT: 0.52,
  /** 屏幕像素：星点最大渲染尺寸 */
  POINT_SIZE_MAX: 110,
  /** 星点视距缩放：深度下限（越小拉近时点越大；原先 20 导致近距观感不变） */
  POINT_VIEW_Z_MIN: 4.0,
  POINT_DIST_SCALE_DIV: 300.0,
  POINT_DIST_SCALE_MIN: 4.5,
  POINT_DIST_SCALE_MAX: 110.0,
  /** 气体粒子视距缩放（与星点同理） */
  GAS_VIEW_Z_MIN: 4.0,
  GAS_DIST_SCALE_DIV: 220.0,
  GAS_DIST_SCALE_MIN: 2.8,
  GAS_DIST_SCALE_MAX: 64.0,
  GAS_POINT_SIZE_MAX: 64.0,
  /** Points 射线拾取阈值（世界单位，随距离在组件内缩放） */
  PICK_THRESHOLD: 6,
  /** 定位单颗星时的包围尺度与距离上限 */
  FOCUS_STAR_SPAN: 5,
  FOCUS_STAR_PADDING: 2.35,
  FOCUS_STAR_MAX_DISTANCE: 38,
};

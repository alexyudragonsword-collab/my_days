// 业务表注册中心：通用 CRUD、全局搜索、回收站和导出都基于这份定义驱动。

export interface TableDef {
  /** SQLite 表名，同时是 API 路径 /api/t/<name> */
  name: string;
  /** 所属模块 key（用于搜索分组和回收站展示） */
  module: string;
  /** 模块中文名 */
  moduleLabel: string;
  /** 记录类型中文名 */
  label: string;
  /** 作为标题展示的字段 */
  titleField: string;
  /** 参与全局搜索的字段 */
  searchFields: string[];
  /** 允许写入的业务字段（id/created_at/updated_at/deleted_at 之外） */
  columns: string[];
}

export const TABLES: TableDef[] = [
  {
    name: 'memos', module: 'daily', moduleLabel: '快速备忘', label: '备忘',
    titleField: 'content', searchFields: ['content'],
    columns: ['content', 'status', 'converted_type', 'converted_id'],
  },
  {
    name: 'plan_items', module: 'plan', moduleLabel: '今日计划', label: '计划事项',
    titleField: 'title', searchFields: ['title', 'note'],
    columns: ['title', 'date', 'start_time', 'duration_min', 'priority', 'status',
      'source_module', 'source_id', 'note', 'completed_at'],
  },
  {
    name: 'daily_reviews', module: 'plan', moduleLabel: '今日计划', label: '当日复盘',
    titleField: 'content', searchFields: ['content'],
    columns: ['date', 'content'],
  },
  {
    name: 'media_contents', module: 'media', moduleLabel: '自媒体', label: '内容',
    titleField: 'title', searchFields: ['title', 'notes'],
    columns: ['title', 'platform', 'form', 'stage', 'planned_date', 'actual_date',
      'notes', 'asset_path', 'publish_link', 'views', 'likes', 'comments', 'archived'],
  },
  {
    name: 'dev_projects', module: 'dev', moduleLabel: '开发工作', label: '项目',
    titleField: 'name', searchFields: ['name', 'description'],
    columns: ['name', 'description', 'status', 'local_path', 'repo_link', 'archived'],
  },
  {
    name: 'dev_milestones', module: 'dev', moduleLabel: '开发工作', label: '里程碑',
    titleField: 'name', searchFields: ['name'],
    columns: ['project_id', 'name', 'target_date', 'status'],
  },
  {
    name: 'dev_work_items', module: 'dev', moduleLabel: '开发工作', label: '工作项',
    titleField: 'title', searchFields: ['title'],
    columns: ['project_id', 'milestone_id', 'title', 'type', 'priority', 'status'],
  },
  {
    name: 'dev_logs', module: 'dev', moduleLabel: '开发工作', label: '开发日志',
    titleField: 'content', searchFields: ['content'],
    columns: ['project_id', 'date', 'content'],
  },
  {
    name: 'consult_clients', module: 'consult', moduleLabel: '咨询工作', label: '客户',
    titleField: 'name', searchFields: ['name', 'note'],
    columns: ['name', 'note', 'archived'],
  },
  {
    name: 'consult_projects', module: 'consult', moduleLabel: '咨询工作', label: '咨询项目',
    titleField: 'name', searchFields: ['name', 'requirement'],
    columns: ['client_id', 'name', 'requirement', 'status', 'archived'],
  },
  {
    name: 'consult_comms', module: 'consult', moduleLabel: '咨询工作', label: '沟通记录',
    titleField: 'notes', searchFields: ['notes'],
    columns: ['project_id', 'time', 'form', 'notes', 'duration_min', 'fee_amount', 'settled'],
  },
  {
    name: 'consult_deliverables', module: 'consult', moduleLabel: '咨询工作', label: '交付物',
    titleField: 'name', searchFields: ['name'],
    columns: ['project_id', 'name', 'due_date', 'status'],
  },
  {
    name: 'consult_followups', module: 'consult', moduleLabel: '咨询工作', label: '跟进',
    titleField: 'content', searchFields: ['content'],
    columns: ['project_id', 'next_time', 'content', 'done'],
  },
  {
    name: 'fitness_templates', module: 'fitness', moduleLabel: '健身计划', label: '训练模板',
    titleField: 'name', searchFields: ['name'],
    columns: ['name', 'weekdays'],
  },
  {
    name: 'fitness_template_exercises', module: 'fitness', moduleLabel: '健身计划', label: '模板动作',
    titleField: 'name', searchFields: [],
    columns: ['template_id', 'name', 'target_sets', 'target_reps', 'target_weight', 'rest_sec', 'sort'],
  },
  {
    name: 'fitness_sessions', module: 'fitness', moduleLabel: '健身计划', label: '训练记录',
    titleField: 'name', searchFields: ['name', 'notes'],
    columns: ['date', 'template_id', 'name', 'status', 'notes'],
  },
  {
    name: 'fitness_session_sets', module: 'fitness', moduleLabel: '健身计划', label: '训练组',
    titleField: 'exercise_name', searchFields: [],
    columns: ['session_id', 'exercise_name', 'set_no', 'target_reps', 'target_weight', 'reps', 'weight', 'done'],
  },
  {
    name: 'body_metrics', module: 'fitness', moduleLabel: '健身计划', label: '身体数据',
    titleField: 'date', searchFields: [],
    columns: ['date', 'weight', 'measurements', 'note'],
  },
  {
    name: 'foods', module: 'diet', moduleLabel: '饮食计划', label: '常用食物',
    titleField: 'name', searchFields: ['name'],
    columns: ['name', 'portion', 'calories', 'protein'],
  },
  {
    name: 'meals', module: 'diet', moduleLabel: '饮食计划', label: '餐食',
    titleField: 'name', searchFields: ['name'],
    columns: ['date', 'meal_type', 'name'],
  },
  {
    name: 'meal_foods', module: 'diet', moduleLabel: '饮食计划', label: '餐食食物',
    titleField: 'food_name', searchFields: ['food_name'],
    columns: ['meal_id', 'kind', 'food_name', 'portion', 'calories', 'protein'],
  },
  {
    name: 'meal_templates', module: 'diet', moduleLabel: '饮食计划', label: '餐食模板',
    titleField: 'name', searchFields: ['name'],
    columns: ['name', 'meal_type'],
  },
  {
    name: 'meal_template_foods', module: 'diet', moduleLabel: '饮食计划', label: '模板食物',
    titleField: 'food_name', searchFields: [],
    columns: ['template_id', 'food_name', 'portion', 'calories', 'protein', 'sort'],
  },
  {
    name: 'games', module: 'games', moduleLabel: '游戏娱乐', label: '游戏/娱乐项目',
    titleField: 'name', searchFields: ['name', 'notes', 'next_goal'],
    columns: ['name', 'platform', 'status', 'progress', 'next_goal', 'notes', 'rating', 'completed_date'],
  },
  {
    name: 'game_sessions', module: 'games', moduleLabel: '游戏娱乐', label: '游玩记录',
    titleField: 'start_time', searchFields: [],
    columns: ['game_id', 'start_time', 'end_time', 'duration_min', 'note'],
  },
];

export const tableByName = new Map(TABLES.map((t) => [t.name, t]));

/** 各来源模块记录 → 今日计划关联时用于取标题的表 */
export const SOURCE_TABLES: Record<string, string> = {
  media: 'media_contents',
  dev_project: 'dev_projects',
  dev_item: 'dev_work_items',
  consult_project: 'consult_projects',
  consult_deliverable: 'consult_deliverables',
  consult_followup: 'consult_followups',
  consult_comm: 'consult_comms',
  fitness_session: 'fitness_sessions',
  fitness_template: 'fitness_templates',
  meal: 'meals',
  game: 'games',
  memo: 'memos',
};

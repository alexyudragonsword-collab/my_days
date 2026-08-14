/** 计划事项来源模块 → 存储表 & 展示名（与服务端 SOURCE_TABLES 对应） */
export const SOURCE_INFO: Record<string, { table: string; label: string }> = {
  media: { table: 'media_contents', label: '自媒体' },
  dev_project: { table: 'dev_projects', label: '开发' },
  dev_item: { table: 'dev_work_items', label: '开发' },
  consult_project: { table: 'consult_projects', label: '咨询' },
  consult_deliverable: { table: 'consult_deliverables', label: '咨询交付' },
  consult_followup: { table: 'consult_followups', label: '咨询跟进' },
  consult_comm: { table: 'consult_comms', label: '咨询会议' },
  fitness_session: { table: 'fitness_sessions', label: '健身' },
  fitness_template: { table: 'fitness_templates', label: '健身' },
  meal: { table: 'meals', label: '饮食' },
  game: { table: 'games', label: '娱乐' },
  memo: { table: 'memos', label: '备忘' },
};

export const PRIORITIES = ['高', '中', '低'];
export const PLAN_STATUSES = ['未开始', '进行中', '已完成', '已取消', '已延期'];
export const MEDIA_STAGES = ['灵感', '待策划', '制作中', '待发布', '已发布'];
export const DEV_ITEM_TYPES = ['功能', '需求', 'Bug', '技术问题'];
export const GAME_STATUSES = ['想玩', '正在进行', '暂停', '已完成'];
export const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐'];

export function priorityBadgeClass(p: string): string {
  return p === '高' ? 'danger' : p === '低' ? '' : 'warn';
}

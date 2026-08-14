// 浏览器端验收测试：对应 docs/ACCEPTANCE.md 中的界面类验收标准。
// 每次运行使用全新数据目录（scripts/e2e-server.mjs），测试按文件顺序执行。
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('AC-001/AC-004 首页可打开，九个页面均可进入', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=今日概况')).toBeVisible();
  const navs = ['首页总览', '今日计划', '自媒体', '开发工作', '咨询工作', '健身计划', '饮食计划', '游戏娱乐', '数据与设置'];
  for (const nav of navs) {
    await page.click(`a.nav-item:has-text("${nav}")`);
    await expect(page.locator('.content')).not.toBeEmpty();
  }
});

test('AC-005/AC-011/AC-012 创建事项、时间线与待安排展示、刷新持久', async ({ page }) => {
  await page.goto('/plan');
  await page.fill('input[placeholder="添加事项，回车创建"]', '有时间的事项');
  await page.fill('input[type="time"]', '10:30');
  await page.click('button:has-text("添加")');
  await expect(page.locator('.list-item:has-text("有时间的事项")')).toBeVisible();

  await page.fill('input[placeholder="添加事项，回车创建"]', '待安排的事项');
  await page.click('button:has-text("添加")');

  await page.goto('/');
  await expect(page.locator('.timeline-card:has-text("有时间的事项")')).toBeVisible();
  await expect(page.locator('.card:has-text("待安排事项") .list-item:has-text("待安排的事项")')).toBeVisible();

  await page.reload();
  await expect(page.locator('.timeline-card:has-text("有时间的事项")')).toBeVisible();
});

test('AC-013 标记完成后进度同步更新', async ({ page }) => {
  await page.goto('/');
  await page.locator('.timeline-card:has-text("有时间的事项") input[type="checkbox"]').click();
  await expect(page.locator('.card:has-text("今日概况")')).toContainText('1 / 2');
});

test('AC-017 快速备忘持久且可转换为今日事项', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[placeholder="随手记录，回车保存"]', '一条备忘');
  await page.press('input[placeholder="随手记录，回车保存"]', 'Enter');
  await page.reload();
  await expect(page.locator('.card:has-text("快速备忘") :text("一条备忘")')).toBeVisible();
  await page.locator('.card:has-text("快速备忘") .list-item:has-text("一条备忘") .menu-anchor button').click();
  await page.click('.menu button:has-text("转为今日事项")');
  await expect(page.locator('.card:has-text("待安排事项") :text("一条备忘")')).toBeVisible();
});

test('AC-026 Ctrl+K 全局搜索按模块分组', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=今日概况')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.fill('.palette input', '备忘');
  await expect(page.locator('.palette .list-item').first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('AC-019 自媒体五阶段看板', async ({ page }) => {
  await page.goto('/media');
  await page.fill('input[placeholder*="快速记录灵感"]', '一个灵感');
  await page.press('input[placeholder*="快速记录灵感"]', 'Enter');
  await expect(page.locator('.kanban-col')).toHaveCount(5);
  await expect(page.locator('.kanban-col:has-text("灵感") .kanban-card')).toHaveCount(1);
});

test('AC-014 加入今日计划并可返回来源记录', async ({ page }) => {
  await page.goto('/media');
  await page.locator('.kanban-card:has-text("一个灵感") .menu-anchor button').click();
  await page.click('.menu button:has-text("加入今日计划")');
  await page.goto('/plan');
  const linked = page.locator('.list-item:has-text("一个灵感")');
  await expect(linked).toBeVisible();
  await linked.locator('.badge.accent.clickable').click();
  await expect(page).toHaveURL(/\/media/);
});

test('AC-030 空数据模块显示专属空状态', async ({ page }) => {
  await page.goto('/fitness');
  await expect(page.locator('text=还没有训练模板')).toBeVisible();
  await expect(page.locator('button:has-text("新建模板")')).toBeVisible();
});

test('AC-009/AC-031 数据文件信息与备份列表', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('.card:has-text("本地数据文件")')).toContainText('my_days.db');
  await page.click('button:has-text("立即备份")');
  await expect(page.locator('.card:has-text("备份") table tbody tr').first()).toBeVisible();
});

test('AC-027/AC-028 回收站恢复与永久删除确认', async ({ page }) => {
  await page.goto('/plan');
  await page.locator('.list-item:has-text("待安排的事项") .menu-anchor button').first().click();
  await page.click('.menu button:has-text("删除")');
  await page.goto('/settings');
  const row = page.locator('.card:has-text("回收站") .list-item:has-text("待安排的事项")');
  await expect(row).toBeVisible();
  // 永久删除需要确认；取消后记录仍在
  await row.locator('button:has-text("永久删除")').click();
  await page.locator('.modal button:has-text("取消")').click();
  await expect(row).toBeVisible();
  await row.locator('button:has-text("恢复")').click();
  await page.goto('/plan');
  await expect(page.locator('.list-item:has-text("待安排的事项")')).toBeVisible();
});

test('AC-029 外观与主题设置刷新后生效', async ({ page }) => {
  await page.goto('/settings');
  await page.click('.appearance-option[data-preview="brutal"]');
  await page.selectOption('.field:has(label:text-is("主题")) select', 'dark');
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => [document.documentElement.dataset.appearance, document.documentElement.dataset.theme]))
    .toEqual(['brutal', 'dark']);
  await page.goto('/settings');
  await page.click('.appearance-option[data-preview="default"]');
  await page.selectOption('.field:has(label:text-is("主题")) select', 'auto');
});

test('中英文切换生效、持久，且不影响业务数据', async ({ page }) => {
  await page.goto('/plan');
  await expect(page.locator('.list-item').first()).toBeVisible();
  const itemCount = await page.locator('.list-item').count();

  await page.goto('/settings');
  await page.selectOption('.field:has(label:has-text("语言")) select', 'en');
  await expect(page.locator('a.nav-item:has-text("Development")')).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.locator('a.nav-item:has-text("Data & Settings")')).toBeVisible();

  // 业务数据不受语言切换影响
  await page.goto('/plan');
  await expect(page.locator('.list-item')).toHaveCount(itemCount);

  await page.goto('/settings');
  await page.selectOption('.field:has(label:has-text("Language")) select', 'zh');
  await expect(page.locator('a.nav-item:has-text("数据与设置")')).toBeVisible({ timeout: 10_000 });
});

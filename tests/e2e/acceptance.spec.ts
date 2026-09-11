// 浏览器端验收测试：对应 docs/ACCEPTANCE.md 中的界面类验收标准。
// 每次运行使用全新数据目录（scripts/e2e-server.mjs），测试按文件顺序执行。
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('AC-001/AC-004 首页可打开，各页面均可进入', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=今日概况')).toBeVisible();
  const navs = ['首页总览', '今日计划', '统计报表', '自媒体', '开发工作', '咨询工作', '健身计划', '饮食计划', '游戏娱乐', '数据与设置'];
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

test('周报 / 月报按区间汇总完成率与每日完成', async ({ page }) => {
  await page.goto('/plan');
  await page.fill('input[placeholder="添加事项，回车创建"]', '报表用事项');
  await page.click('button:has-text("添加")');
  const row = page.locator('.list-item:has-text("报表用事项")').first();
  await expect(row).toBeVisible();
  await row.locator('input[type="checkbox"]').first().click();

  await page.goto('/report');
  await expect(page.locator('.card:has-text("计划完成情况")')).toBeVisible();
  await expect(page.locator('.report-bar').first()).toBeVisible();
  await expect(page.locator('.card:has-text("各模块投入")')).toBeVisible();

  await page.click('.tabs button:has-text("月报")');
  await expect(page.locator('.card:has-text("每日完成")')).toBeVisible();
  // 切到上一个周期后可以回到当前
  await page.click('button:has-text("上一月")');
  await expect(page.locator('button:has-text("回到当前")')).toBeVisible();
  await page.click('button:has-text("回到当前")');
});

test('快捷键：? 显示帮助，数字键切换页面', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.card:has-text("今日概况")')).toBeVisible();

  await page.keyboard.press('?');
  await expect(page.locator('.modal:has-text("键盘快捷键")')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal:has-text("键盘快捷键")')).toHaveCount(0);

  await page.keyboard.press('3');
  await expect(page).toHaveURL(/\/report$/);
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/\/plan$/);

  // 输入框内的按键不会触发页面跳转
  await page.fill('input[placeholder="添加事项，回车创建"]', '3');
  await expect(page).toHaveURL(/\/plan$/);
});

test('首页模块摘要卡片顺序可自定义', async ({ page }) => {
  await page.goto('/settings');
  const devRow = page.locator('.field:has(label:has-text("首页模块摘要")) .list-item:has-text("开发工作")');
  await expect(devRow).toBeVisible();
  await devRow.locator('button[title="上移"]').click();

  await page.goto('/');
  const titles = page.locator('.home-grid > div:nth-child(2) > .card h3');
  await expect(titles.first()).toBeVisible();
  const texts = await titles.allTextContents();
  const dev = texts.findIndex((x) => x.includes('开发工作'));
  const media = texts.findIndex((x) => x.includes('自媒体'));
  expect(dev).toBeGreaterThan(-1);
  expect(media).toBeGreaterThan(-1);
  expect(dev).toBeLessThan(media);
});

test('自媒体看板可按平台筛选', async ({ page }) => {
  await page.goto('/media');
  await page.fill('input[placeholder*="快速记录灵感"]', 'B站专属选题');
  await page.press('input[placeholder*="快速记录灵感"]', 'Enter');
  const card = page.locator('.kanban-card:has-text("B站专属选题")');
  await expect(card).toBeVisible();

  await card.locator('span.clickable').first().click();
  await page.fill('.drawer .field:has(label:text-is("发布平台")) input', 'B站');
  await page.click('.drawer button:has-text("保存")');

  await page.selectOption('.page-head select', 'B站');
  await expect(page.locator('.kanban-card:has-text("B站专属选题")')).toBeVisible();
  await expect(page.locator('.kanban-card:has-text("一个灵感")')).toHaveCount(0);

  await page.selectOption('.page-head select', '');
  await expect(page.locator('.kanban-card:has-text("一个灵感")')).toBeVisible();
});

test('餐食可存为模板并套用到其他餐次', async ({ page }) => {
  await page.goto('/diet');
  const breakfastActual = page.locator('.card:has(h3:text-is("早餐")) .grid-2 > div').nth(1);
  await breakfastActual.locator('input[placeholder="食物名称"]').fill('燕麦粥');
  await breakfastActual.locator('input[placeholder="份量"]').fill('250g');
  await breakfastActual.locator('button:has-text("添加")').click();
  await expect(breakfastActual.locator('.list-item:has-text("燕麦粥")')).toBeVisible();

  await breakfastActual.locator('button:has-text("存为模板")').click();
  await page.fill('.modal input', '早餐标准套餐');
  await page.click('.modal button:has-text("确定")');
  await expect(page.locator('.card:has-text("餐食模板")')).toBeVisible();

  const lunchActual = page.locator('.card:has(h3:text-is("午餐")) .grid-2 > div').nth(1);
  await lunchActual.locator('button:has-text("套用模板")').click();
  await page.locator('.menu button:has-text("早餐标准套餐")').click();
  await expect(lunchActual.locator('.list-item:has-text("燕麦粥")')).toBeVisible();
});

test('训练模板可复制一份再改', async ({ page }) => {
  await page.goto('/fitness');
  await page.click('button:has-text("新建训练模板")');
  await page.fill('.modal input[placeholder*="推力日"]', '推力日');
  await page.fill('.modal input[placeholder="动作名称"]', '卧推');
  await page.click('.modal button:has-text("保存模板")');
  await expect(page.locator('.list-item:has-text("推力日")')).toBeVisible();

  await page.locator('.list-item:has-text("推力日") .menu-anchor > button').click();
  await page.locator('.menu button:has-text("复制模板")').click();
  await page.fill('.modal input', '拉力日');
  await page.click('.modal button:has-text("确定")');

  // 复制后直接打开编辑器，动作已一并带入
  await expect(page.locator('.modal input[placeholder="动作名称"]').first()).toHaveValue('卧推');
  await page.click('.modal button:has-text("取消")');
  await expect(page.locator('.list-item:has-text("拉力日")')).toBeVisible();
  await expect(page.locator('.list-item:has-text("推力日")')).toBeVisible();
});

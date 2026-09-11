-- 全局搜索索引：FTS5 trigram 分词器支持中文子串匹配（3 字及以上），
-- 由触发器与业务表保持同步；软删除过滤在查询时按 deleted_at 完成。
CREATE VIRTUAL TABLE search_fts USING fts5(
  text,
  table_name UNINDEXED,
  row_id UNINDEXED,
  tokenize = 'trigram'
);

-- memos
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.content, ''), 'memos', t.id FROM memos t;

CREATE TRIGGER memos_fts_ai AFTER INSERT ON memos BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'memos', new.id);
END;

CREATE TRIGGER memos_fts_au AFTER UPDATE ON memos BEGIN
  DELETE FROM search_fts WHERE table_name = 'memos' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'memos', new.id);
END;

CREATE TRIGGER memos_fts_ad AFTER DELETE ON memos BEGIN
  DELETE FROM search_fts WHERE table_name = 'memos' AND row_id = old.id;
END;

-- plan_items
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.title, '') || ' ' || coalesce(t.note, ''), 'plan_items', t.id FROM plan_items t;

CREATE TRIGGER plan_items_fts_ai AFTER INSERT ON plan_items BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.title, '') || ' ' || coalesce(new.note, ''), 'plan_items', new.id);
END;

CREATE TRIGGER plan_items_fts_au AFTER UPDATE ON plan_items BEGIN
  DELETE FROM search_fts WHERE table_name = 'plan_items' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.title, '') || ' ' || coalesce(new.note, ''), 'plan_items', new.id);
END;

CREATE TRIGGER plan_items_fts_ad AFTER DELETE ON plan_items BEGIN
  DELETE FROM search_fts WHERE table_name = 'plan_items' AND row_id = old.id;
END;

-- daily_reviews
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.content, ''), 'daily_reviews', t.id FROM daily_reviews t;

CREATE TRIGGER daily_reviews_fts_ai AFTER INSERT ON daily_reviews BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'daily_reviews', new.id);
END;

CREATE TRIGGER daily_reviews_fts_au AFTER UPDATE ON daily_reviews BEGIN
  DELETE FROM search_fts WHERE table_name = 'daily_reviews' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'daily_reviews', new.id);
END;

CREATE TRIGGER daily_reviews_fts_ad AFTER DELETE ON daily_reviews BEGIN
  DELETE FROM search_fts WHERE table_name = 'daily_reviews' AND row_id = old.id;
END;

-- media_contents
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.title, '') || ' ' || coalesce(t.notes, ''), 'media_contents', t.id FROM media_contents t;

CREATE TRIGGER media_contents_fts_ai AFTER INSERT ON media_contents BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.title, '') || ' ' || coalesce(new.notes, ''), 'media_contents', new.id);
END;

CREATE TRIGGER media_contents_fts_au AFTER UPDATE ON media_contents BEGIN
  DELETE FROM search_fts WHERE table_name = 'media_contents' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.title, '') || ' ' || coalesce(new.notes, ''), 'media_contents', new.id);
END;

CREATE TRIGGER media_contents_fts_ad AFTER DELETE ON media_contents BEGIN
  DELETE FROM search_fts WHERE table_name = 'media_contents' AND row_id = old.id;
END;

-- dev_projects
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, '') || ' ' || coalesce(t.description, ''), 'dev_projects', t.id FROM dev_projects t;

CREATE TRIGGER dev_projects_fts_ai AFTER INSERT ON dev_projects BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.description, ''), 'dev_projects', new.id);
END;

CREATE TRIGGER dev_projects_fts_au AFTER UPDATE ON dev_projects BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_projects' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.description, ''), 'dev_projects', new.id);
END;

CREATE TRIGGER dev_projects_fts_ad AFTER DELETE ON dev_projects BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_projects' AND row_id = old.id;
END;

-- dev_milestones
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, ''), 'dev_milestones', t.id FROM dev_milestones t;

CREATE TRIGGER dev_milestones_fts_ai AFTER INSERT ON dev_milestones BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'dev_milestones', new.id);
END;

CREATE TRIGGER dev_milestones_fts_au AFTER UPDATE ON dev_milestones BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_milestones' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'dev_milestones', new.id);
END;

CREATE TRIGGER dev_milestones_fts_ad AFTER DELETE ON dev_milestones BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_milestones' AND row_id = old.id;
END;

-- dev_work_items
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.title, ''), 'dev_work_items', t.id FROM dev_work_items t;

CREATE TRIGGER dev_work_items_fts_ai AFTER INSERT ON dev_work_items BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.title, ''), 'dev_work_items', new.id);
END;

CREATE TRIGGER dev_work_items_fts_au AFTER UPDATE ON dev_work_items BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_work_items' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.title, ''), 'dev_work_items', new.id);
END;

CREATE TRIGGER dev_work_items_fts_ad AFTER DELETE ON dev_work_items BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_work_items' AND row_id = old.id;
END;

-- dev_logs
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.content, ''), 'dev_logs', t.id FROM dev_logs t;

CREATE TRIGGER dev_logs_fts_ai AFTER INSERT ON dev_logs BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'dev_logs', new.id);
END;

CREATE TRIGGER dev_logs_fts_au AFTER UPDATE ON dev_logs BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_logs' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'dev_logs', new.id);
END;

CREATE TRIGGER dev_logs_fts_ad AFTER DELETE ON dev_logs BEGIN
  DELETE FROM search_fts WHERE table_name = 'dev_logs' AND row_id = old.id;
END;

-- consult_clients
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, '') || ' ' || coalesce(t.note, ''), 'consult_clients', t.id FROM consult_clients t;

CREATE TRIGGER consult_clients_fts_ai AFTER INSERT ON consult_clients BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.note, ''), 'consult_clients', new.id);
END;

CREATE TRIGGER consult_clients_fts_au AFTER UPDATE ON consult_clients BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_clients' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.note, ''), 'consult_clients', new.id);
END;

CREATE TRIGGER consult_clients_fts_ad AFTER DELETE ON consult_clients BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_clients' AND row_id = old.id;
END;

-- consult_projects
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, '') || ' ' || coalesce(t.requirement, ''), 'consult_projects', t.id FROM consult_projects t;

CREATE TRIGGER consult_projects_fts_ai AFTER INSERT ON consult_projects BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.requirement, ''), 'consult_projects', new.id);
END;

CREATE TRIGGER consult_projects_fts_au AFTER UPDATE ON consult_projects BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_projects' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.requirement, ''), 'consult_projects', new.id);
END;

CREATE TRIGGER consult_projects_fts_ad AFTER DELETE ON consult_projects BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_projects' AND row_id = old.id;
END;

-- consult_comms
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.notes, ''), 'consult_comms', t.id FROM consult_comms t;

CREATE TRIGGER consult_comms_fts_ai AFTER INSERT ON consult_comms BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.notes, ''), 'consult_comms', new.id);
END;

CREATE TRIGGER consult_comms_fts_au AFTER UPDATE ON consult_comms BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_comms' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.notes, ''), 'consult_comms', new.id);
END;

CREATE TRIGGER consult_comms_fts_ad AFTER DELETE ON consult_comms BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_comms' AND row_id = old.id;
END;

-- consult_deliverables
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, ''), 'consult_deliverables', t.id FROM consult_deliverables t;

CREATE TRIGGER consult_deliverables_fts_ai AFTER INSERT ON consult_deliverables BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'consult_deliverables', new.id);
END;

CREATE TRIGGER consult_deliverables_fts_au AFTER UPDATE ON consult_deliverables BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_deliverables' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'consult_deliverables', new.id);
END;

CREATE TRIGGER consult_deliverables_fts_ad AFTER DELETE ON consult_deliverables BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_deliverables' AND row_id = old.id;
END;

-- consult_followups
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.content, ''), 'consult_followups', t.id FROM consult_followups t;

CREATE TRIGGER consult_followups_fts_ai AFTER INSERT ON consult_followups BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'consult_followups', new.id);
END;

CREATE TRIGGER consult_followups_fts_au AFTER UPDATE ON consult_followups BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_followups' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.content, ''), 'consult_followups', new.id);
END;

CREATE TRIGGER consult_followups_fts_ad AFTER DELETE ON consult_followups BEGIN
  DELETE FROM search_fts WHERE table_name = 'consult_followups' AND row_id = old.id;
END;

-- fitness_templates
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, ''), 'fitness_templates', t.id FROM fitness_templates t;

CREATE TRIGGER fitness_templates_fts_ai AFTER INSERT ON fitness_templates BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'fitness_templates', new.id);
END;

CREATE TRIGGER fitness_templates_fts_au AFTER UPDATE ON fitness_templates BEGIN
  DELETE FROM search_fts WHERE table_name = 'fitness_templates' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'fitness_templates', new.id);
END;

CREATE TRIGGER fitness_templates_fts_ad AFTER DELETE ON fitness_templates BEGIN
  DELETE FROM search_fts WHERE table_name = 'fitness_templates' AND row_id = old.id;
END;

-- fitness_sessions
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, '') || ' ' || coalesce(t.notes, ''), 'fitness_sessions', t.id FROM fitness_sessions t;

CREATE TRIGGER fitness_sessions_fts_ai AFTER INSERT ON fitness_sessions BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.notes, ''), 'fitness_sessions', new.id);
END;

CREATE TRIGGER fitness_sessions_fts_au AFTER UPDATE ON fitness_sessions BEGIN
  DELETE FROM search_fts WHERE table_name = 'fitness_sessions' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.notes, ''), 'fitness_sessions', new.id);
END;

CREATE TRIGGER fitness_sessions_fts_ad AFTER DELETE ON fitness_sessions BEGIN
  DELETE FROM search_fts WHERE table_name = 'fitness_sessions' AND row_id = old.id;
END;

-- foods
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, ''), 'foods', t.id FROM foods t;

CREATE TRIGGER foods_fts_ai AFTER INSERT ON foods BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'foods', new.id);
END;

CREATE TRIGGER foods_fts_au AFTER UPDATE ON foods BEGIN
  DELETE FROM search_fts WHERE table_name = 'foods' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'foods', new.id);
END;

CREATE TRIGGER foods_fts_ad AFTER DELETE ON foods BEGIN
  DELETE FROM search_fts WHERE table_name = 'foods' AND row_id = old.id;
END;

-- meals
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, ''), 'meals', t.id FROM meals t;

CREATE TRIGGER meals_fts_ai AFTER INSERT ON meals BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'meals', new.id);
END;

CREATE TRIGGER meals_fts_au AFTER UPDATE ON meals BEGIN
  DELETE FROM search_fts WHERE table_name = 'meals' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'meals', new.id);
END;

CREATE TRIGGER meals_fts_ad AFTER DELETE ON meals BEGIN
  DELETE FROM search_fts WHERE table_name = 'meals' AND row_id = old.id;
END;

-- meal_foods
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.food_name, ''), 'meal_foods', t.id FROM meal_foods t;

CREATE TRIGGER meal_foods_fts_ai AFTER INSERT ON meal_foods BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.food_name, ''), 'meal_foods', new.id);
END;

CREATE TRIGGER meal_foods_fts_au AFTER UPDATE ON meal_foods BEGIN
  DELETE FROM search_fts WHERE table_name = 'meal_foods' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.food_name, ''), 'meal_foods', new.id);
END;

CREATE TRIGGER meal_foods_fts_ad AFTER DELETE ON meal_foods BEGIN
  DELETE FROM search_fts WHERE table_name = 'meal_foods' AND row_id = old.id;
END;

-- games
INSERT INTO search_fts(text, table_name, row_id)
  SELECT coalesce(t.name, '') || ' ' || coalesce(t.notes, '') || ' ' || coalesce(t.next_goal, ''), 'games', t.id FROM games t;

CREATE TRIGGER games_fts_ai AFTER INSERT ON games BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.notes, '') || ' ' || coalesce(new.next_goal, ''), 'games', new.id);
END;

CREATE TRIGGER games_fts_au AFTER UPDATE ON games BEGIN
  DELETE FROM search_fts WHERE table_name = 'games' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, '') || ' ' || coalesce(new.notes, '') || ' ' || coalesce(new.next_goal, ''), 'games', new.id);
END;

CREATE TRIGGER games_fts_ad AFTER DELETE ON games BEGIN
  DELETE FROM search_fts WHERE table_name = 'games' AND row_id = old.id;
END;

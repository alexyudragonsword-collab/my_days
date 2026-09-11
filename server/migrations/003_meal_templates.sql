-- 餐食模板：把常吃的一餐存下来，之后一键套用到某天的某一餐
CREATE TABLE IF NOT EXISTS meal_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  meal_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS meal_template_foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  food_name TEXT NOT NULL DEFAULT '',
  portion TEXT,
  calories REAL,
  protein REAL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_meal_template_foods_template ON meal_template_foods(template_id);

-- 与 002 一致：可搜索表需要维护全局搜索索引
CREATE TRIGGER meal_templates_fts_ai AFTER INSERT ON meal_templates BEGIN
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'meal_templates', new.id);
END;

CREATE TRIGGER meal_templates_fts_au AFTER UPDATE ON meal_templates BEGIN
  DELETE FROM search_fts WHERE table_name = 'meal_templates' AND row_id = old.id;
  INSERT INTO search_fts(text, table_name, row_id) VALUES (coalesce(new.name, ''), 'meal_templates', new.id);
END;

CREATE TRIGGER meal_templates_fts_ad AFTER DELETE ON meal_templates BEGIN
  DELETE FROM search_fts WHERE table_name = 'meal_templates' AND row_id = old.id;
END;

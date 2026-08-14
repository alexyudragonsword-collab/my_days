import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDailyAutoBackup } from './backup';
import { getDb } from './db';
import { api } from './routes';

const PORT = Number(process.env.MY_DAYS_PORT || 5675);
// 仅监听本机回环地址：局域网内其他设备不可访问
const HOST = '127.0.0.1';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.use('/api', api);

// 统一错误处理：写入失败等异常必须以明确的失败状态返回
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 生产模式：托管前端构建产物
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

getDb();
ensureDailyAutoBackup();
// 每小时检查一次当天是否已有自动备份（跨天长驻时生效）
setInterval(ensureDailyAutoBackup, 60 * 60 * 1000);

app.listen(PORT, HOST, () => {
  console.log(`个人工作台已启动: http://${HOST}:${PORT}`);
});

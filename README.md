# 车驾管刷题

手机优先的车驾管知识练习网页。题库来自 `access-raw` 中的三份 DOCX。服务端使用内嵌的 SQLite 数据库保存题目和答题记录，无需单独安装数据库服务。

## 安装与启动

需要 Node.js 22+、pnpm，以及 Python 3（仅重新导入 DOCX 时使用）。请手动安装依赖：

```bash
cd server && pnpm install
cd ../frontend && pnpm install
```

首次启动服务端前，在 `server` 目录执行 `pnpm migrate`，将 `data/questions.json` 和现有 `data/users/*.json` 导入 `data/question-bank.sqlite`。迁移不会删除原 JSON 文件；数据库已存在时命令会拒绝覆盖。以后启动服务不再读取这些 JSON 文件。

前端图标使用 Iconify；如果之前已经安装过前端依赖，只需在 `frontend` 目录执行 `pnpm add @iconify/vue`。图标按需从 Iconify API 加载，首次显示需要网络连接。

分别在两个终端启动：

```bash
cd server && pnpm dev
```

```bash
cd frontend && pnpm dev
```

打开 `http://localhost:5173`。同一局域网内的手机可以打开电脑的 IP 加 `:5173`；Vite 会将 `/api` 请求代理到本机的 `3001` 端口。

快捷刷题链接是 `http://localhost:5173/quick`（按下文用 IP 部署后为 `http://服务器IP:3001/quick`）。打开后会直接进入该用户最近一场未交卷的练习，包括未完成的错题重刷；如果没有未完成的练习，则新建一场 50 道选择题加 50 道判断题的模拟考试。交卷后再次打开链接会开始新的一场。

首页的“数据迁移”可导出当前设备的全部考试记录、答题进度和错题为 JSON 文件，再在另一设备导入；也可在旧设备复制迁移口令（即 `X-Visitor-Id`），在使用同一服务端的新设备输入口令。导入只追加新记录并合并错题，重复导入不会覆盖已有数据；源 ID 与当前 ID 相同时会拒绝迁移。微信内置浏览器无法使用文件上传和下载，请使用系统浏览器或在线迁移。迁移功能复用现有的 Element Plus，无需新增依赖。口令可用于读取该设备的历史数据，请妥善保管。

## 生产部署（单台 Linux 服务器）

以下示例将项目放在 `/opt/question-bank`，使用 Nginx 接收公网请求，由 Express 同时提供前端页面和 API。请先准备 Node.js 22+、pnpm、Nginx 和服务器 IP，并确保服务器能访问 Iconify API（图标首次加载需要）。

### 1. 上传代码并构建

将项目上传到 `/opt/question-bank`，然后在服务器执行：

```bash
cd /opt/question-bank/frontend
pnpm install --frozen-lockfile
pnpm build

cd /opt/question-bank/server
pnpm install --frozen-lockfile
pnpm build
```

确认 `/opt/question-bank/server/data/questions.json` 和 `/opt/question-bank/frontend/dist/index.html` 存在。首次迁移时还需上传原有的 `server/data/users` 目录，以及可能存在的 `server/data/progress.json`。生产环境不需要运行 Vite 开发服务器；服务端启动后从 SQLite 读取题目。

如果在本地构建后只上传打包产物，服务端仍需有 `server/package.json` 和 `server/pnpm-lock.yaml`，并在 `server/dist` 的上一级目录执行 `pnpm install --prod --frozen-lockfile` 安装 Express 和 `better-sqlite3` 等运行依赖。项目将 `better-sqlite3` 固定为 12.11.1，以兼容 Node.js 22.11.0；若服务器此前装过 13.x，务必上传新的依赖声明和锁文件并重新安装。原生模块应在服务器上安装，不要直接上传本地的 `node_modules`。

若 pnpm 提示忽略了 `better-sqlite3` 的构建脚本，在服务器执行 `pnpm approve-builds`，用空格选中该包，并在确认提示中输入 `y`；然后执行 `pnpm rebuild better-sqlite3`。迁移前可用 `node -e "const db = require('better-sqlite3')(':memory:'); console.log(db.prepare('SELECT 1 AS ok').get()); db.close()"` 检查原生模块是否正常加载。

### 2. 迁移并备份持久化数据

默认数据目录是 `/opt/question-bank/server/data`。**先停止旧服务写入并备份整个数据目录**，再用运行服务的 Linux 用户执行：

```bash
cd /opt/question-bank/server
pnpm migrate:prod
```

命令会生成 `data/question-bank.sqlite`，并打印题目、用户、考试、答案和错题数量。核对数量后再启动新服务。迁移**不会删除或改写** `questions.json`、`users/*.json` 和 `progress.json`；先保留它们作为回退资料。若数据库文件已存在，迁移会停止，避免覆盖已产生的新记录。

运行用户需要能读写数据库文件及其所在目录。也可以用 `QUESTION_BANK_DATA_DIR` 指定独立的持久化目录；迁移和运行服务时必须使用同一个值。使用容器或云主机时，应将此目录挂载到持久卷。不要把数据库文件提交到 Git。

上线后定期备份 SQLite 数据库。服务运行时可执行 `pnpm backup:prod -- /备份目录/question-bank-日期.sqlite`；备份文件不能已存在，目标目录须可写。该命令使用 SQLite 在线备份接口，不要只复制 `question-bank.sqlite` 主文件，因为 WAL 模式可能还有未合并到主文件的已提交数据。需要回退时，先停止新服务并保存当前数据库，再恢复原 JSON 数据目录和旧版本代码。

### 3. 常驻运行（选择 systemd 或 PM2）

#### 方式 A：systemd

将以下内容保存为 `/etc/systemd/system/question-bank.service`。把 `YOUR_LINUX_USER` 改为有数据目录读写权限的用户；把 `/usr/bin/node` 改为 `command -v node` 查到的实际路径。

```ini
[Unit]
Description=Question Bank Web App
After=network.target

[Service]
Type=simple
User=YOUR_LINUX_USER
WorkingDirectory=/opt/question-bank/server
Environment=NODE_ENV=production
Environment=PORT=3002
ExecStart=/usr/bin/node /opt/question-bank/server/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

如果使用独立数据目录，在 `[Service]` 中增加 `Environment=QUESTION_BANK_DATA_DIR=/你的/持久化目录`。然后启动并检查：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now question-bank
sudo systemctl status question-bank
curl -I http://127.0.0.1:3002/
```

#### 方式 B：PM2

如果使用 PM2，由你手动安装：`npm install -g pm2`。不要同时启动上面的 systemd 服务，否则两者会争用 3002 端口。用有数据目录读写权限的 Linux 用户执行：

```bash
cd /opt/question-bank/server
NODE_ENV=production PORT=3002 pm2 start dist/index.js --name question-bank
pm2 status
curl -I http://127.0.0.1:3002/
```

如果 `question-bank` 已在 PM2 中运行，先用 `pm2 show question-bank` 核对脚本路径，再在更新代码和构建产物后执行 `NODE_ENV=production PORT=3002 pm2 restart question-bank --update-env`，不要再次执行 `pm2 start`。如需重启服务器后自动运行，执行 `pm2 startup`，按照它输出的命令完成系统服务设置，然后执行 `pm2 save`。查看日志用 `pm2 logs question-bank`。如果使用独立数据目录，在启动或重启命令前添加 `QUESTION_BANK_DATA_DIR=/你的/持久化目录`。PM2 保持默认的单进程模式即可。

### 4. 配置 Nginx

没有域名时，将以下站点配置加入 Nginx，直接通过 `http://服务器IP:3001/` 访问。Nginx 监听公网 3001 端口，Express 使用内部 3002 端口：

```nginx
server {
    listen 3001 default_server;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果已有站点使用了 `listen 3001 default_server`，先停用该站点或调整其配置，避免重复定义默认站点。检查配置后重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

使用 HTTP 时开放公网 3001 端口，并限制外部直接访问 Express 的 3002 端口。HTTP 传输未加密；有域名后建议配置 HTTPS，例如使用 [Certbot 的 Nginx 安装方式](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx)。Nginx 的转发配置可参考[官方反向代理文档](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy)。

### 重启Node服务

```Shell
NODE_ENV=production PORT=3002 pm2 restart question-bank --update-env
curl -I http://127.0.0.1:3002/
```

### 更新版本

先备份数据库，再更新代码，重新执行步骤 1 的安装和构建命令，最后重启服务：使用 systemd 时运行 `sudo systemctl restart question-bank`；使用 PM2 时运行 `NODE_ENV=production PORT=3002 pm2 restart question-bank --update-env`。不要用新代码目录覆盖或删除已有的 `server/data/question-bank.sqlite`。如果重新导入题库，应保留旧考试记录引用的题目 ID；生成新的 `questions.json` 不会自动更新数据库。

## 题库与规则

- 从 DOCX 生成题库 JSON：在项目根目录运行 `python3 scripts/import_docx.py`，无需额外 Python 依赖。该命令不会改写已上线的 SQLite 数据库。
- 当前共 1536 题：601 道选择题、935 道判断题。每场模拟考试随机抽取 50 + 50 道，不重复抽取相同题干和选项的题目。
- 题目、答题进度、成绩、记录及错题存于 `server/data/question-bank.sqlite`，不会纳入 Git。首次迁移会合并旧 `progress.json` 与单用户 JSON；原浏览器首次访问时，旧 ID 对应的数据仍可关联到当前 ID。
- 交卷时未作答题目计为错题；错题重刷覆盖当前错题本中的所有题，答对后从错题本移除。
- 每题提交答案后立即显示正确答案及判定，提交过的题目不能再次作答或修改；刷新页面后仍可查看已答题答案。
- 用户 ID 由 FingerprintJS 根据浏览器环境计算，前端请求通过 `X-Visitor-Id` 传给服务端。它是浏览器指纹，并非手机硬件唯一号；更换浏览器、系统更新或指纹防护设置可能改变 ID，不应把它用于防作弊或身份认证。
- 原 DOCX 标注为 2022 年版题库；系统按原文导入，未核对现行法规。如用于正式培训或考试，请先审核题目时效性。

## 项目目录

```text
access-raw/           原始 DOCX
scripts/import_docx.py 题库提取脚本
server/data/questions.json 迁移与导入用的题库源文件
server/data/question-bank.sqlite 运行时数据库（不纳入 Git）
server/src/migrate.ts  JSON 到 SQLite 的一次性迁移脚本
server/src/           Express API
frontend/src/         Vue 3 页面
```

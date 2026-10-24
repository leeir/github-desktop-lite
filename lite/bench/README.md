# 内存基线测量

和官方版用同一口径对比 Lite 的内存：`footprint` 取每个进程的 phys_footprint（活动监视器「内存」列），按进程类型求和。

```bash
lite/bench/make-bigdiff.sh /tmp/bigdiff-repo
find ~/code -maxdepth 4 -name .git -type d | sed 's#/.git$##' > /tmp/repos.txt
REPOS=/tmp/repos.txt BIGDIFF=/tmp/bigdiff-repo \
  lite/bench/baseline.sh "dist/GitHub Desktop Lite-darwin-arm64/GitHub Desktop Lite.app"
```

脚本会清空 Lite 的用户数据目录，通过 `--remote-debugging-port` 跳过首次引导、点掉对话框，然后依次测：

- S1：无仓库空闲 3 分钟
- S2：通过 `--cli-open` 加入 REPOS 里的仓库后空闲 5 分钟
- S3：再打开 BIGDIFF 仓库 2 分钟

单独看某个正在运行的应用：`lite/bench/memprobe.sh "/Applications/GitHub Desktop.app/"`

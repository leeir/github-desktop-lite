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
- S3b / S4：切回第一个仓库 1 分钟 / 7 分钟，对比确认闲置仓库的缓存被裁剪

每次读数前会通过 CDP 强制垃圾回收两次，并输出精确的 JS 堆占用；不回收的话读数会混进还没回收的垃圾，前后没法比。

单独看某个正在运行的应用：`lite/bench/memprobe.sh "/Applications/GitHub Desktop.app/"`

## 长时间运行

`longrun.sh` 每隔一段时间（默认 60 分钟）记录一次正在运行的应用的内存，写成 CSV，用来看「用了几天之后涨到多少、涨在哪个进程」：

```bash
nohup lite/bench/longrun.sh "/Applications/GitHub Desktop Lite.app" ~/desktop-lite.csv &
nohup lite/bench/longrun.sh "/Applications/GitHub Desktop.app" ~/desktop-official.csv &
```

两个一起跑、日常照常使用，1～3 天后对比两份 CSV。应用没开的时候那一轮会跳过。停止：`pkill -f longrun.sh`。

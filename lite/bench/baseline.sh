#!/bin/zsh
# 用法：REPOS=<仓库路径列表文件> BIGDIFF=<大改动仓库路径> baseline.sh <GitHub Desktop Lite.app 路径>
#   REPOS 每行一个本地仓库路径；BIGDIFF 可用 make-bigdiff.sh 生成
# 在干净的用户数据目录下依次跑四个场景并记录内存：
#   S1 空闲（无仓库） → S2 添加本地仓库列表后空闲 → S3 再打开一个大改动仓库
#   → S3b/S4 切到别的仓库 1 / 7 分钟后（验证不活跃仓库的缓存裁剪）
S=${0:A:h}
APP="$1"
NAME=$(basename "$APP" .app)
BIN="$APP/Contents/MacOS/$NAME"
PORT=9333
IDLE1=${IDLE1:-180}
IDLE2=${IDLE2:-300}
IDLE3=${IDLE3:-120}

cdp() { node "$S/cdp-eval.mjs" $PORT "$1" }
# 点击当前对话框里文字完全匹配的按钮，返回是否点到
click() { cdp "(() => { const b = [...document.querySelectorAll('dialog button')].find(b => b.innerText.trim() === '$1'); if (b) b.click(); return !!b })()" }
# 添加仓库对话框会先显示「不是 Git 仓库」，异步校验完才变；等校验结束再点添加
add_repo() {
  "$BIN" --cli-open="$1" >/dev/null 2>&1
  for i in $(seq 1 20); do
    sleep 1
    [[ $(cdp "!!document.querySelector('#add-existing-repository') && !document.querySelector('#add-existing-repository').innerText.includes('does not appear')") == true ]] && break
  done
  click 'Add Repository'
}
measure() {
  echo "=== $1  $(date '+%H:%M:%S')"
  # 先强制回收，读数才可比
  node "$S/cdp-heap.mjs" $PORT
  sleep 2
  "$S/memprobe.sh" "$APP/"
}

pkill -f "$APP/" ; sleep 2
rm -rf "$HOME/Library/Application Support/$NAME"

"$BIN" --remote-debugging-port=$PORT >/dev/null 2>&1 &
for i in $(seq 1 60); do curl -s "http://127.0.0.1:$PORT/json/list" | grep -q '"page"' && break; sleep 1; done
sleep 5
# 跳过首次启动引导，和老用户的状态一致
cdp "localStorage.setItem('has-shown-welcome-flow', '1'); 'ok'"
# 页面内 reload 会被拦截，所以正常退出再重启，让 localStorage 落盘
sleep 3; osascript -e "quit app \"$APP\""; for i in $(seq 1 30); do pgrep -f "$APP/" >/dev/null || break; sleep 1; done
"$BIN" --remote-debugging-port=$PORT >/dev/null 2>&1 &
for i in $(seq 1 60); do curl -s "http://127.0.0.1:$PORT/json/list" | grep -q '"page"' && break; sleep 1; done
sleep 5
echo "screen: $(cdp 'document.body.innerText.slice(0,80)')"
# 不在 /Applications 下运行会提示移动，点掉
echo "dismiss move-to-applications: $(click 'Not Now')"
sleep $IDLE1
measure "S1 空闲（无仓库）"

added=0
while read -r repo; do
  [[ $(add_repo "$repo") == true ]] && added=$((added+1))
  sleep 2
done < "${REPOS:?需要 REPOS}"
echo "repos added: $added"
sleep $IDLE2
measure "S2 $added 个仓库，空闲"

echo "bigdiff added: $(add_repo "${BIGDIFF:?需要 BIGDIFF}")"
sleep $IDLE3
measure "S3 打开大改动仓库"

# S3b/S4：切回第一个仓库。S3b 是切走 1 分钟后（对照），S4 是 7 分钟后，
# 大改动仓库已闲置超过 5 分钟、缓存被裁剪
"$BIN" --cli-open="$(head -1 "$REPOS")" >/dev/null 2>&1
sleep 60
measure "S3b 切走大改动仓库 1 分钟后"
sleep ${IDLE4:-360}
measure "S4 切走大改动仓库 7 分钟后"

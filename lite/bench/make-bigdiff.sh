#!/bin/zsh
# 用法：make-bigdiff.sh <目标目录>
# 生成一个有 42 个改动文件（约 45 万行）的仓库，用于 S3 场景
set -e
SRC=${0:A:h}/../..
R="$1"
rm -rf "$R"; mkdir -p "$R"; cd "$R"
git init -q
cp "$SRC/app/src/lib/stores/app-store.ts" big.ts
cp "$SRC/app/src/lib/api.ts" api.ts
git add -A
git -c user.email=lite@example.com -c user.name=lite commit -qm init
perl -pi -e 's/const /let /g; s/this\./self./g' big.ts api.ts
for i in $(seq 1 40); do cp big.ts copy$i.ts; done
git status --short | wc -l

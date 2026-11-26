#!/bin/zsh
# 用法：memprobe.sh "<应用 .app 路径片段>"
# 按进程类型列出 phys_footprint（活动监视器「内存」列的同一口径）并求和
pattern="$1"
total=0
for p in $(pgrep -f "$pattern"); do
  cmd=$(ps -o command= -p $p)
  type=$(echo "$cmd" | grep -oE -- '--type=[a-z-]+' | head -1 | sed 's/--type=//')
  sub=$(echo "$cmd" | grep -oE -- '--utility-sub-type=[a-zA-Z.]+' | sed 's/.*=//; s/\.mojom\./:/')
  name=$(basename "$(echo "$cmd" | awk '{print $1}')")
  [[ -z "$type" ]] && type="main"
  [[ -n "$sub" ]] && type="$type($sub)"
  fp=$(footprint $p 2>/dev/null | grep -m1 -oE 'Footprint: [0-9.]+ [KMG]B' | awk '{print $2, $3}')
  num=${fp% *}; unit=${fp#* }
  case $unit in KB) mb=$(echo "$num/1024" | bc -l);; GB) mb=$(echo "$num*1024" | bc -l);; *) mb=$num;; esac
  total=$(echo "$total+$mb" | bc -l)
  printf "%-7s %-32s %8.1f MB\n" $p "$type" $mb
done
printf "%-40s %8.1f MB\n" "TOTAL" $total

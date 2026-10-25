#!/bin/zsh
# 长时间运行的内存记录：每隔一段时间记一次正在运行的应用各进程的内存，写成 CSV。
#
# 用法：longrun.sh <应用 .app 路径> <输出 csv> [间隔分钟，默认 60]
# 例：同时记录官方版和 Lite，日常照常使用，过 1～3 天再看曲线
#   nohup lite/bench/longrun.sh "/Applications/GitHub Desktop.app" ~/desktop-official.csv &
#   nohup lite/bench/longrun.sh "/Applications/GitHub Desktop Lite.app" ~/desktop-lite.csv &
#
# 口径同 memprobe.sh（phys_footprint，等于活动监视器的「内存」列）。
# 应用没在运行时这一轮跳过，不会退出。
APP="${1:?需要应用 .app 路径}"
OUT="${2:?需要输出 csv 路径}"
INTERVAL_MIN=${3:-60}

[[ -f "$OUT" ]] || echo "time,main_mb,renderer_mb,gpu_mb,other_mb,total_mb,uptime" > "$OUT"

footprint_mb() {
  local fp
  fp=$(footprint $1 2>/dev/null | grep -m1 -oE 'Footprint: [0-9.]+ [KMG]B' | awk '{print $2, $3}')
  local num=${fp% *} unit=${fp#* }
  case $unit in
    KB) echo "$num/1024" | bc -l ;;
    GB) echo "$num*1024" | bc -l ;;
    MB) echo "$num" ;;
    *) echo 0 ;;
  esac
}

while true; do
  main=0 renderer=0 gpu=0 other=0 uptime=""
  for p in $(pgrep -f "$APP/"); do
    cmd=$(ps -o command= -p $p)
    mb=$(footprint_mb $p)
    case "$cmd" in
      *--type=renderer*) renderer=$(echo "$renderer+$mb" | bc -l) ;;
      *--type=gpu-process*) gpu=$(echo "$gpu+$mb" | bc -l) ;;
      *--type=*) other=$(echo "$other+$mb" | bc -l) ;;
      *)
        main=$(echo "$main+$mb" | bc -l)
        uptime=$(ps -o etime= -p $p | tr -d ' ')
        ;;
    esac
  done

  if [[ -n "$uptime" ]]; then
    total=$(echo "$main+$renderer+$gpu+$other" | bc -l)
    printf "%s,%.0f,%.0f,%.0f,%.0f,%.0f,%s\n" "$(date '+%Y-%m-%d %H:%M')" \
      $main $renderer $gpu $other $total "$uptime" >> "$OUT"
  fi

  sleep $((INTERVAL_MIN * 60))
done

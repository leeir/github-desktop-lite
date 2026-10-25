// 用法：node cdp-heap.mjs <port>
// 在渲染进程里强制做两次垃圾回收，再读取精确的 JS 堆占用（MB）。
// 不先回收的话，读数里会混进尚未回收的垃圾，前后对比没有意义。
const [port] = process.argv.slice(2)
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))

let id = 0
const call = (method, params = {}) =>
  new Promise(resolve => {
    const myId = ++id
    const onMessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.id === myId) {
        ws.removeEventListener('message', onMessage)
        resolve(msg.result)
      }
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })

await call('HeapProfiler.collectGarbage')
await new Promise(r => setTimeout(r, 1000))
await call('HeapProfiler.collectGarbage')
const { usedSize, totalSize } = await call('Runtime.getHeapUsage')
console.log(
  `JS heap used ${(usedSize / 1048576).toFixed(1)} MB / total ${(
    totalSize / 1048576
  ).toFixed(1)} MB`
)
ws.close()

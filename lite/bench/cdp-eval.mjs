// 用法：node cdp-eval.mjs <port> "<JS 表达式>"
// 通过 Chrome DevTools Protocol 在 Electron 渲染进程里执行一段 JS 并打印结果
const [port, expression] = process.argv.slice(2)
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find(t => t.type === 'page')
if (!page) {
  console.error('no page target', targets)
  process.exit(1)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression, awaitPromise: true, returnByValue: true },
  })
)
const msg = await new Promise(r =>
  ws.addEventListener('message', e => r(JSON.parse(e.data)), { once: true })
)
console.log(JSON.stringify(msg.result?.result?.value ?? msg.result ?? msg))
ws.close()

// A plain inspection surface, not the product's visual design. Keeping HTML
// static and rendering JSON with textContent prevents provider-text HTML injection.
export const diagnosticHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tennis feed diagnostics</title><link rel="stylesheet" href="/diagnostic.css"></head>
<body><h1>Synthetic tennis feed diagnostics</h1><p>No API key or provider requests. This is a developer inspector, not the app design.</p>
<p id="connection" role="status">Connecting…</p><p><button id="step">Next synthetic snapshot</button> <button id="reset">Restart scenario</button> <button id="disconnect">Disconnect stream</button> <button id="reconnect">Reconnect stream</button></p>
<p>Snapshot replaces the previous state. Corrections and retractions appear in the event log. A duplicate source snapshot produces no event.</p>
<h2>Current snapshot</h2><pre id="snapshot"></pre><h2>Latest events (last 20)</h2><pre id="events"></pre><script src="/diagnostic.js" defer></script></body></html>`;
export const diagnosticCss = `body{max-width:1100px;margin:24px auto;padding:0 16px;font:16px system-ui;background:#111827;color:#e5e7eb}button{padding:12px;margin:4px;font:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1f2937;padding:16px}button:focus-visible{outline:3px solid #38bdf8}`;
export const diagnosticJs = `// Raw event inspector. Full state always comes from a server replacement snapshot.
const id = 'synthetic-match';
const snapshotBox = document.getElementById('snapshot');
const eventsBox = document.getElementById('events');
const connection = document.getElementById('connection');
let stream = null, cursor = '', current = null, log = [], recovering = false;
function record(text) { log.unshift(text); log = log.slice(0,20); eventsBox.textContent = log.join('\\n\\n'); }
function show(snapshot) { current = snapshot; cursor = snapshot.cursor; snapshotBox.textContent = JSON.stringify(snapshot,null,2); }
async function connect() {
  if (stream) stream.close();
  // Explicit recovery clears state by fetching a replacement over HTTP. Native
  // EventSource reconnects also send Last-Event-ID automatically on interruption.
  connection.textContent = 'Connecting (synthetic replay; no live freshness claim)…';
  stream = new EventSource('/matches/' + id + '/events' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
  stream.onopen = () => connection.textContent = 'Connected to synthetic replay';
  stream.onerror = () => connection.textContent = 'Transport interrupted; EventSource will reconnect';
  stream.addEventListener('reset', event => { const data=JSON.parse(event.data); if(current && current.epoch===data.snapshot.epoch && data.snapshot.sequence<current.sequence)return; show(data.snapshot); record('RESET: ' + data.reason); });
  stream.addEventListener('update', async event => {
    const data = JSON.parse(event.data), next = data.snapshot;
    if (current && current.epoch === next.epoch && next.sequence <= current.sequence) return;
    if (!current || current.epoch !== next.epoch || next.sequence !== current.sequence + 1) {
      if(recovering)return; recovering=true;
      try { const response=await fetch('/matches/'+id); if(!response.ok)throw new Error('Snapshot recovery failed'); show(await response.json()); record('GAP: replaced from HTTP snapshot'); await connect(); }
      catch(error){connection.textContent=error.message;} finally{recovering=false;} return;
    }
    show(next); record(JSON.stringify({cursor:next.cursor,changes:data.changes,retractedHistoryIds:data.retractedHistoryIds},null,2));
  });
}
async function control(action) { try { const r=await fetch('/demo/'+action,{method:'POST'}); if(!r.ok)throw new Error('Demo control failed'); record(JSON.stringify(await r.json())); } catch(error){connection.textContent=error.message;} }
document.getElementById('step').onclick=()=>control('step');
document.getElementById('reset').onclick=()=>control('reset');
document.getElementById('disconnect').onclick=()=>{if(stream)stream.close();connection.textContent='Disconnected deliberately; press reconnect to resume';};
document.getElementById('reconnect').onclick=()=>connect();
connect();`;

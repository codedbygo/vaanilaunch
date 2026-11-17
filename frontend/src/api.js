// Streams agent events (SSE over POST) and calls onEvent({type, data}) for each.
export async function runAgent(payload, onEvent) {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await errorText(res));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const p of parts) if (p.startsWith('data: ')) onEvent(JSON.parse(p.slice(6)));
  }
}

async function errorText(res) {
  try {
    const j = await res.json();
    return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
  } catch {
    return res.statusText;
  }
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

// Resize in the browser to max 1024px JPEG (saves Claude tokens + bandwidth), then upload.
export async function uploadPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return postJSON('/api/upload', { dataUrl });
}

export const approveDraft = (sessionId, slug) => postJSON('/api/approve', { sessionId, slug });
export const sendContact = form => postJSON('/api/contact', form).then(() => true).catch(() => false);
export const getSites = () => fetch('/api/sites').then(r => (r.ok ? r.json() : []));
export const getManage = m =>
  fetch(`/api/manage?slug=${encodeURIComponent(m.slug)}&key=${encodeURIComponent(m.key)}`).then(r => (r.ok ? r.json() : null));
export const setOrderStatus = (m, ref, status) =>
  postJSON(`/api/manage/orders/${encodeURIComponent(ref)}`, { slug: m.slug, key: m.key, status });
export const qrUrl = data => `/api/qr?data=${encodeURIComponent(data)}`;

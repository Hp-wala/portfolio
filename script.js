const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getJSON = (u) => fetch(u).then((r) => {
  if (!r.ok) throw new Error(`Could not load ${u}.`);
  return r.json();
});

// ---- Optional testimonials (section stays hidden if the file is empty) ----
getJSON('testimonials.json').then((list) => {
  const target = document.getElementById('tlist');
  const section = document.getElementById('testimonials');
  if (!target || !section || !Array.isArray(list) || !list.length) return;
  target.innerHTML = list.map((t) =>
    `<figure class="card"><blockquote>“${esc(t.quote)}”</blockquote><figcaption>— ${esc(t.name)}${t.role ? ', ' + esc(t.role) : ''}</figcaption></figure>`).join('');
  section.hidden = false;
}).catch(() => {});

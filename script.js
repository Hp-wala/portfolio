// ---- 0. Theme toggle (Light / Dark / System dropdown) ----
(function () {
  function applyTheme(t) {
    var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  // Apply on init (inline <head> script already set data-theme; this re-confirms)
  var current;
  try { current = localStorage.getItem('theme') || 'system'; } catch (e) { current = 'system'; }
  applyTheme(current);

  window.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('theme-select');
    if (!sel) return;
    // Set dropdown to saved value
    sel.value = current;
    sel.addEventListener('change', function () {
      current = sel.value;
      try { localStorage.setItem('theme', current); } catch (e) {}
      applyTheme(current);
    });
  });

  // Live update when system preference changes (only in 'system' mode)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    var c;
    try { c = localStorage.getItem('theme') || 'system'; } catch (e) { c = 'system'; }
    if (c === 'system') applyTheme('system');
  });
})();

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

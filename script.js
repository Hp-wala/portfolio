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

function initializeFounderCard() {
  const photo = document.getElementById('founder-photo');
  const fallback = document.getElementById('founder-photo-fallback');
  if (photo && fallback) {
    photo.addEventListener('load', () => { fallback.hidden = true; }, { once: true });
    photo.addEventListener('error', () => {
      photo.hidden = true;
      fallback.hidden = false;
    }, { once: true });
    if (photo.complete && photo.naturalWidth > 0) fallback.hidden = true;
    if (photo.complete && photo.naturalWidth === 0) photo.dispatchEvent(new Event('error'));
  }

  document.querySelectorAll('[data-contact-link]').forEach((link) => {
    const contactLink = document.getElementById(link.dataset.contactLink);
    if (contactLink) link.href = contactLink.href;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFounderCard, { once: true });
} else {
  initializeFounderCard();
}

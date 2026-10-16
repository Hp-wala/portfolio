import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_CONFIG = {
  url: 'https://jvpbpifyoqvfmeejfbxv.supabase.co',
  anonKey: 'sb_publishable_gKXysbqJ3BzEsViqmPRK-A_343ymDkp',
  adminEmail: 'ritul@gmail.com',
};
const IMAGE_BUCKET = 'project-images';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PROJECT_IMAGES = 8;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const clientConfigured = SUPABASE_CONFIG.url.startsWith('https://') &&
  SUPABASE_CONFIG.anonKey.startsWith('sb_publishable_');
const supabase = clientConfigured ? createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

const requireClient = () => {
  if (!clientConfigured || !supabase) throw new Error('Add your Supabase URL and anon key in supabase.js first.');
  return supabase;
};

const isAdmin = (user) => Boolean(user?.email) &&
  user.email.toLowerCase() === SUPABASE_CONFIG.adminEmail.toLowerCase() &&
  SUPABASE_CONFIG.adminEmail !== 'ADMIN_EMAIL_HERE';

export const isSupabaseConfigured = () => clientConfigured && SUPABASE_CONFIG.adminEmail !== 'ADMIN_EMAIL_HERE';
export const getAdminEmail = () => SUPABASE_CONFIG.adminEmail;
export const isAdminUser = isAdmin;

export async function getSession() {
  const { data, error } = await requireClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

export function watchSession(callback) {
  return requireClient().auth.onAuthStateChange((_event, session) => callback(session))
    .data.subscription;
}

async function requireAdminSession() {
  const session = await getSession();
  if (!isAdmin(session?.user)) throw new Error('This account is not authorized to manage projects.');
  return requireClient();
}

export async function fetchPublicProjects() {
  const { data, error } = await requireClient().from('projects')
    .select('id,title,description,tech,link,note,display_order,visible')
    .eq('visible', true)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return attachProjectImages(requireClient(), data || []);
}

export async function fetchAdminProjects() {
  const client = await requireAdminSession();
  const { data, error } = await client.from('projects').select('*')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return attachProjectImages(client, data || []);
}

function getVisitSource() {
  const params = new URLSearchParams(location.search);
  const campaign = (params.get('utm_source') || '').toLowerCase();
  if (campaign.includes('instagram') || campaign === 'insta' || campaign === 'ig' || params.has('igshid')) {
    return 'instagram';
  }
  if (campaign.includes('facebook') || campaign === 'fb' || params.has('fbclid')) return 'facebook';

  let host = '';
  try {
    host = new URL(document.referrer).hostname.toLowerCase();
  } catch {}
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('facebook.com') || host.endsWith('fb.com')) return 'facebook';
  return host ? 'other' : 'direct';
}

export async function recordVisit() {
  try {
    try {
      if (sessionStorage.getItem('portfolio_visit_recorded') === '1') return;
    } catch {}

    const { error } = await requireClient().from('site_visits').insert({ source: getVisitSource() });
    if (error) throw error;
    try {
      sessionStorage.setItem('portfolio_visit_recorded', '1');
    } catch {}
  } catch {}
}

export async function fetchVisitStats() {
  const client = await requireAdminSession();
  const counts = await Promise.all([
    client.from('site_visits').select('id', { count: 'exact', head: true }),
    client.from('site_visits').select('id', { count: 'exact', head: true }).eq('source', 'instagram'),
    client.from('site_visits').select('id', { count: 'exact', head: true }).eq('source', 'facebook'),
  ]);
  const failure = counts.find((result) => result.error);
  if (failure) throw failure.error;
  return {
    total: counts[0].count || 0,
    instagram: counts[1].count || 0,
    facebook: counts[2].count || 0,
  };
}

async function attachProjectImages(client, projects) {
  if (!projects.length) return projects;
  const { data, error } = await client.from('project_images')
    .select('id,project_id,storage_path,public_url,caption,alt_text,width,height,sort_order,is_cover')
    .in('project_id', projects.map((project) => project.id))
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const grouped = new Map(projects.map((project) => [project.id, []]));
  for (const image of data || []) grouped.get(image.project_id)?.push(image);
  return projects.map((project) => ({ ...project, images: grouped.get(project.id) || [] }));
}

function projectRecord(project) {
  const displayOrder = Number(project.display_order);
  const link = String(project.link || '').trim();
  if (link && !/^https?:\/\//i.test(link)) {
    throw new Error('Live link must start with https:// or http://.');
  }
  return {
    title: String(project.title || '').trim(),
    description: String(project.description || '').trim(),
    tech: Array.isArray(project.tech) ? project.tech.map((item) => String(item).trim()).filter(Boolean) : [],
    link: link || null,
    note: String(project.note || '').trim() || null,
    display_order: Number.isInteger(displayOrder) ? displayOrder : 0,
    visible: Boolean(project.visible),
  };
}

export async function saveProject(project) {
  const client = await requireAdminSession();
  const record = projectRecord(project);
  if (!record.title) throw new Error('Project title is required.');
  const request = project.id
    ? client.from('projects').update(record).eq('id', project.id).select('id').single()
    : client.from('projects').insert(record).select('id').single();
  const { data, error } = await request;
  if (error) throw error;
  return data.id;
}

export async function deleteProject(id) {
  const client = await requireAdminSession();
  const { data: images, error: imageError } = await client.from('project_images')
    .select('id,storage_path').eq('project_id', id);
  if (imageError) throw imageError;
  const paths = (images || []).map((image) => image.storage_path);
  if (paths.length) {
    const { error: storageError } = await client.storage.from(IMAGE_BUCKET).remove(paths);
    if (storageError) throw storageError;
  }
  const { error } = await client.from('projects').delete().eq('id', id);
  if (error) throw error;
}

async function compressImage(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`${file.name}: choose a JPG, PNG, or WebP image.`);
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: each image must be 5 MB or smaller.`);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image compression is not available in this browser.');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
    if (!blob) throw new Error(`Could not compress ${file.name}.`);
    if (blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP images. Try a current browser.');
    if (blob.size > MAX_IMAGE_BYTES) throw new Error(`${file.name}: compressed image is still over 5 MB.`);
    return { blob, width, height };
  } catch (error) {
    if (error instanceof Error && error.message) throw error;
    throw new Error(`Could not read ${file.name}. Choose a valid JPG, PNG, or WebP image.`);
  } finally {
    bitmap?.close();
  }
}

export async function saveProjectImages(projectId, images, onProgress = () => {}) {
  const client = await requireAdminSession();
  const activeImages = images.filter((image) => !image.removed);
  if (activeImages.length > MAX_PROJECT_IMAGES) throw new Error('A project can have at most 8 images.');

  const newImages = activeImages.filter((image) => image.file);
  const compressed = [];
  for (const image of newImages) compressed.push({ image, ...(await compressImage(image.file)) });

  const removedImages = images.filter((image) => image.persisted && image.removed);
  const removedPaths = removedImages.map((image) => image.storage_path);
  if (removedPaths.length) {
    onProgress('Removing images…');
    const { error: storageError } = await client.storage.from(IMAGE_BUCKET).remove(removedPaths);
    if (storageError) throw storageError;
    const { error: rowError } = await client.from('project_images')
      .delete().in('id', removedImages.map((image) => image.id));
    if (rowError) throw rowError;
  }

  const remaining = activeImages.map((image, index) => ({
    ...image,
    sort_order: index,
    is_cover: false,
  }));
  const cover = remaining.find((image) => image.wants_cover) || remaining[0];
  const uploadedPaths = [];
  const insertedIds = [];

  try {
    const savedRows = [];
    for (let index = 0; index < remaining.length; index += 1) {
      const image = remaining[index];
      const base = {
        project_id: projectId,
        caption: String(image.caption || '').trim(),
        alt_text: String(image.alt_text || '').trim(),
        sort_order: index,
        is_cover: false,
      };
      if (image.persisted) {
        const { error } = await client.from('project_images')
          .update(base).eq('id', image.id);
        if (error) throw error;
        savedRows.push({ ...image, ...base });
      }
    }

    for (let index = 0; index < compressed.length; index += 1) {
      const { image, blob, width, height } = compressed[index];
      onProgress(`Uploading image ${index + 1} of ${compressed.length}…`);
      const storagePath = `${projectId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await client.storage.from(IMAGE_BUCKET)
        .upload(storagePath, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
      const { data: publicData } = client.storage.from(IMAGE_BUCKET).getPublicUrl(storagePath);
      const { data: inserted, error: insertError } = await client.from('project_images').insert({
        ...baseImageRecord(image, projectId, index, storagePath, publicData.publicUrl, width, height),
        is_cover: false,
      }).select('id,project_id,storage_path,public_url,caption,alt_text,width,height,sort_order,is_cover').single();
      if (insertError) throw insertError;
      insertedIds.push(inserted.id);
      savedRows.push(inserted);
    }

    if (cover) {
      const coverRow = savedRows.find((row) => row.id === cover.id) ||
        savedRows.find((row) => row.storage_path === cover.storage_path) ||
        savedRows.find((row) => row.caption === String(cover.caption || '').trim() && row.sort_order === cover.sort_order);
      if (coverRow) {
        const { error } = await client.from('project_images').update({ is_cover: true }).eq('id', coverRow.id);
        if (error) throw error;
      }
    }
  } catch (error) {
    const cleanupErrors = [];
    if (insertedIds.length) {
      const { error: rowCleanupError } = await client.from('project_images').delete().in('id', insertedIds);
      if (rowCleanupError) cleanupErrors.push('Uploaded image records could not be fully cleaned up.');
    }
    if (uploadedPaths.length) {
      const { error: storageCleanupError } = await client.storage.from(IMAGE_BUCKET).remove(uploadedPaths);
      if (storageCleanupError) cleanupErrors.push('Uploaded image files could not be fully cleaned up.');
    }
    if (cleanupErrors.length) throw new Error(`${error.message} ${cleanupErrors.join(' ')}`);
    throw error;
  }
  onProgress('Images saved.');
}

function baseImageRecord(image, projectId, sortOrder, storagePath, publicUrl, width, height) {
  return {
    project_id: projectId,
    storage_path: storagePath,
    public_url: publicUrl,
    caption: String(image.caption || '').trim(),
    alt_text: String(image.alt_text || '').trim(),
    width,
    height,
    sort_order: sortOrder,
  };
}

let allPublicProjects = [];
let showAllProjects = false;

function renderPublicProjects(projects) {
  const box = document.getElementById('projects');
  const showAllButton = document.getElementById('show-all-projects');
  if (!box) return;
  if (!projects.length) {
    box.textContent = 'Projects coming soon.';
    if (showAllButton) showAllButton.hidden = true;
    return;
  }

  const displayedProjects = showAllProjects ? projects : projects.slice(0, 3);
  const cards = displayedProjects.map((project) => {
    const card = document.createElement('article');
    card.className = 'card';
    const title = document.createElement('h3');
    title.textContent = project.title || '';
    card.append(title);

    if (project.description) {
      const description = document.createElement('p');
      description.textContent = project.description;
      card.append(description);
    }
    if (Array.isArray(project.tech) && project.tech.length) {
      const tech = document.createElement('p');
      const label = document.createElement('strong');
      label.textContent = 'Technologies: ';
      tech.append(label, document.createTextNode(project.tech.join(', ')));
      card.append(tech);
    }

    const liveUrl = String(project.link || '').trim();
    const images = Array.isArray(project.images) ? project.images : [];
    const coverIndex = Math.max(0, images.findIndex((image) => image.is_cover));
    const cover = images[coverIndex];
    if (cover?.public_url) {
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'project-cover-button';
      preview.setAttribute('aria-label', `View screenshots for ${project.title || 'project'}`);
      const image = document.createElement('img');
      image.src = cover.public_url;
      image.alt = cover.alt_text || `${project.title || 'Project'} screenshot`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = Number(cover.width) || 1200;
      image.height = Number(cover.height) || 750;
      preview.append(image);
      preview.addEventListener('click', () => openGallery(images, coverIndex, project.title));
      card.append(preview);
    }

    const actions = document.createElement('div');
    actions.className = 'project-actions';
    if (/^https?:\/\//i.test(liveUrl)) {
      const link = document.createElement('a');
      link.href = liveUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'btn ghost';
      link.textContent = 'View Live';
      actions.append(link);
    }
    if (images.length) {
      const galleryButton = document.createElement('button');
      galleryButton.type = 'button';
      galleryButton.className = 'btn ghost';
      galleryButton.textContent = 'View Screenshots';
      galleryButton.addEventListener('click', () => openGallery(images, coverIndex, project.title));
      actions.append(galleryButton);
    }
    if (actions.childElementCount) card.append(actions);
    if (!liveUrl && !images.length && project.note) {
      const note = document.createElement('p');
      note.textContent = project.note;
      card.append(note);
    }
    return card;
  });
  box.replaceChildren(...cards);
  if (showAllButton) {
    showAllButton.hidden = projects.length <= 3;
    showAllButton.textContent = showAllProjects ? 'Hide extra projects' : 'Show all projects';
  }
}

let galleryItems = [];
let galleryIndex = 0;
let galleryProjectTitle = '';

function renderGalleryImage() {
  const dialog = document.getElementById('project-gallery');
  const image = document.getElementById('gallery-image');
  const caption = document.getElementById('gallery-caption');
  const position = document.getElementById('gallery-position');
  if (!dialog || !image || !caption || !position || !galleryItems.length) return;
  const item = galleryItems[galleryIndex];
  image.src = item.public_url;
  image.alt = item.alt_text || `${galleryProjectTitle} screenshot`;
  image.width = Number(item.width) || 1200;
  image.height = Number(item.height) || 750;
  caption.textContent = item.caption || '';
  position.textContent = `${galleryIndex + 1} / ${galleryItems.length}`;
  document.getElementById('gallery-prev').disabled = galleryItems.length < 2;
  document.getElementById('gallery-next').disabled = galleryItems.length < 2;
}

function openGallery(images, index, title) {
  const dialog = document.getElementById('project-gallery');
  if (!dialog || !images.length) return;
  galleryItems = images.filter((image) => image.public_url);
  galleryIndex = Math.max(0, galleryItems.findIndex((image) => image.id === images[index]?.id));
  galleryProjectTitle = title || 'Project';
  renderGalleryImage();
  if (!dialog.open) dialog.showModal();
}

function moveGallery(step) {
  if (!galleryItems.length) return;
  galleryIndex = (galleryIndex + step + galleryItems.length) % galleryItems.length;
  renderGalleryImage();
}

function initializeGallery() {
  const dialog = document.getElementById('project-gallery');
  if (!dialog) return;
  document.getElementById('gallery-close').addEventListener('click', () => dialog.close());
  document.getElementById('gallery-prev').addEventListener('click', () => moveGallery(-1));
  document.getElementById('gallery-next').addEventListener('click', () => moveGallery(1));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
    }
    if (event.key === 'ArrowLeft') moveGallery(-1);
    if (event.key === 'ArrowRight') moveGallery(1);
  });
  let touchStartX = 0;
  dialog.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  dialog.addEventListener('touchend', (event) => {
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 45) moveGallery(distance < 0 ? 1 : -1);
  }, { passive: true });
}

async function loadPublicProjects() {
  try {
    allPublicProjects = await fetchPublicProjects();
    showAllProjects = false;
    renderPublicProjects(allPublicProjects);
  } catch {
    const box = document.getElementById('projects');
    if (box) box.textContent = 'Projects coming soon.';
    const showAllButton = document.getElementById('show-all-projects');
    if (showAllButton) showAllButton.hidden = true;
  }
}

function getLeadSource() {
  try {
    const source = new URLSearchParams(location.search).get('src');
    if (source) sessionStorage.setItem('src', source.slice(0, 50));
    return sessionStorage.getItem('src') || '';
  } catch {
    return '';
  }
}

async function submitLeadToNetlify(form) {
  const payload = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value === 'string') payload.append(key, value);
  }
  payload.set('form-name', 'lead');
  const response = await fetch('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });
  if (!response.ok) throw new Error('Netlify could not accept the enquiry.');
}

async function submitLead(form, status, button) {
  const values = Object.fromEntries(new FormData(form));
  if (values.website) {
    form.reset();
    status.textContent = 'Thank you! I will get back to you soon.';
    return;
  }
  if (!values.name.trim() || !values.phone.trim() || !values.need.trim()) {
    status.textContent = 'Please fill in name, phone and what you need.';
    return;
  }

  const lead = {
    name: values.name.trim(),
    phone: values.phone.trim(),
    email: null,
    need: values.need.trim(),
    budget: values.budget || null,
    message: values.message.trim() || null,
    source: getLeadSource() || null,
  };

  button.disabled = true;
  status.textContent = 'Sending…';
  let acceptedByNetlify = false;
  try {
    await submitLeadToNetlify(form);
    acceptedByNetlify = true;
    const { error } = await requireClient().from('leads').insert(lead);
    if (error) throw error;
    form.reset();
    status.textContent = 'Thank you! I will get back to you soon.';
  } catch (error) {
    console.error('Lead submission failed:', error);
    if (acceptedByNetlify) {
      form.reset();
      status.textContent = 'Your enquiry was submitted, but a database copy could not be saved.';
    } else {
      status.textContent = 'Could not send your enquiry. Please try again later.';
    }
  } finally {
    button.disabled = false;
  }
}

function initializePageFeatures() {
  const year = document.getElementById('yr');
  if (year) year.textContent = new Date().getFullYear();

  initializeGallery();
  if (document.getElementById('projects')) recordVisit();
  const showAllButton = document.getElementById('show-all-projects');
  if (showAllButton) {
    showAllButton.addEventListener('click', () => {
      showAllProjects = !showAllProjects;
      renderPublicProjects(allPublicProjects);
    });
  }
  if (document.getElementById('projects')) loadPublicProjects();
  const form = document.getElementById('lead');
  const status = document.getElementById('status');
  const button = form?.querySelector('button[type="submit"]');
  if (form && status && button) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitLead(form, status, button);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePageFeatures, { once: true });
} else {
  initializePageFeatures();
}
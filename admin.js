import {
  fetchAdminProjects,
  getSession,
  isAdminUser,
  isSupabaseConfigured,
  signIn,
  signOut,
  saveProject,
  saveProjectImages,
  deleteProject,
  fetchVisitStats,
} from './supabase.js';

const loginPanel = document.getElementById('login-panel');
const loginForm = document.getElementById('admin-login');
const loginStatus = document.getElementById('login-status');
const dashboard = document.getElementById('dashboard');
const dashboardStatus = document.getElementById('dashboard-status');
const projectForm = document.getElementById('project-form');
const formStatus = document.getElementById('form-status');
const projectRows = document.getElementById('project-rows');
const imageInput = document.getElementById('project-images');
const imagePreviews = document.getElementById('image-previews');
const imageStatus = document.getElementById('image-status');
const visitStatsStatus = document.getElementById('visit-stats-status');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PROJECT_IMAGES = 8;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
let imageItems = [];

function showLogin(message = '') {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  loginStatus.textContent = message;
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  loginStatus.textContent = '';
}

function makeButton(label, action, className = 'admin-small-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function renderProjects(projects) {
  projectRows.replaceChildren();
  if (!projects.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No projects yet.';
    row.append(cell);
    projectRows.append(row);
    return;
  }

  for (const project of projects) {
    const row = document.createElement('tr');
    const titleCell = document.createElement('td');
    const title = document.createElement('strong');
    title.textContent = project.title || '';
    titleCell.append(title);
    if (project.description) {
      const description = document.createElement('span');
      description.className = 'admin-project-description';
      description.textContent = project.description;
      titleCell.append(description);
    }

    const orderCell = document.createElement('td');
    orderCell.textContent = String(project.display_order ?? 0);
    const visibleCell = document.createElement('td');
    visibleCell.textContent = project.visible ? 'Visible' : 'Hidden';
    const actionsCell = document.createElement('td');
    actionsCell.className = 'admin-row-actions';
    actionsCell.append(
      makeButton('Edit', () => beginEdit(project)),
      makeButton('Delete', () => removeProject(project), 'admin-small-button danger'),
    );

    row.append(titleCell, orderCell, visibleCell, actionsCell);
    projectRows.append(row);
  }
}

async function refreshProjects(successMessage = '') {
  dashboardStatus.textContent = 'Loading projects…';
  try {
    renderProjects(await fetchAdminProjects());
    dashboardStatus.textContent = successMessage;
  } catch (error) {
    dashboardStatus.textContent = error.message || 'Could not load projects.';
  }
}

async function refreshVisitStats() {
  visitStatsStatus.textContent = 'Loading visits…';
  try {
    const stats = await fetchVisitStats();
    document.getElementById('visit-total').textContent = stats.total.toLocaleString();
    document.getElementById('visit-instagram').textContent = stats.instagram.toLocaleString();
    document.getElementById('visit-facebook').textContent = stats.facebook.toLocaleString();
    visitStatsStatus.textContent = '';
  } catch (error) {
    visitStatsStatus.textContent = error.message || 'Could not load visit statistics.';
  }
}

function resetProjectForm() {
  for (const image of imageItems) {
    if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  }
  imageItems = [];
  projectForm.reset();
  projectForm.elements.id.value = '';
  projectForm.elements.display_order.value = '0';
  projectForm.elements.visible.checked = true;
  projectForm.hidden = true;
  formStatus.textContent = '';
  imageStatus.textContent = '';
  imagePreviews.replaceChildren();
  imageInput.value = '';
  document.getElementById('project-form-title').textContent = 'Add project';
}

function beginEdit(project) {
  resetProjectForm();
  projectForm.hidden = false;
  projectForm.elements.id.value = project.id;
  projectForm.elements.title.value = project.title || '';
  projectForm.elements.description.value = project.description || '';
  projectForm.elements.tech.value = Array.isArray(project.tech) ? project.tech.join(', ') : '';
  projectForm.elements.link.value = project.link || '';
  projectForm.elements.note.value = project.note || '';
  projectForm.elements.display_order.value = String(project.display_order ?? 0);
  projectForm.elements.visible.checked = Boolean(project.visible);
  imageItems = (project.images || []).map((image) => ({
    ...image,
    persisted: true,
    removed: false,
    wants_cover: Boolean(image.is_cover),
  }));
  renderImagePreviews();
  document.getElementById('project-form-title').textContent = 'Edit project';
  projectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderImagePreviews() {
  imagePreviews.replaceChildren();
  const active = imageItems.filter((image) => !image.removed);
  if (active.length && !active.some((image) => image.wants_cover)) active[0].wants_cover = true;

  active.forEach((image, index) => {
    const item = document.createElement('article');
    item.className = 'image-preview-item';
    const preview = document.createElement('img');
    preview.src = image.previewUrl || image.public_url;
    preview.alt = image.alt_text || 'Project image preview';
    preview.loading = 'lazy';
    preview.width = Number(image.width) || 480;
    preview.height = Number(image.height) || 300;
    item.append(preview);

    const controls = document.createElement('div');
    controls.className = 'image-preview-fields';
    const captionLabel = document.createElement('label');
    captionLabel.textContent = 'Caption';
    const caption = document.createElement('input');
    caption.type = 'text';
    caption.maxLength = 300;
    caption.value = image.caption || '';
    caption.addEventListener('input', () => { image.caption = caption.value; });
    captionLabel.append(caption);

    const altLabel = document.createElement('label');
    altLabel.textContent = 'Alt text';
    const altText = document.createElement('input');
    altText.type = 'text';
    altText.maxLength = 300;
    altText.value = image.alt_text || '';
    altText.addEventListener('input', () => {
      image.alt_text = altText.value;
      preview.alt = altText.value || 'Project image preview';
    });
    altLabel.append(altText);
    controls.append(captionLabel, altLabel);

    const actions = document.createElement('div');
    actions.className = 'admin-actions image-preview-actions';
    const cover = document.createElement('button');
    cover.type = 'button';
    cover.className = image.wants_cover ? 'admin-small-button is-cover' : 'admin-small-button';
    cover.textContent = image.wants_cover ? 'Cover image' : 'Make cover';
    cover.setAttribute('aria-pressed', String(image.wants_cover));
    cover.addEventListener('click', () => {
      imageItems.forEach((entry) => { entry.wants_cover = entry === image; });
      imageStatus.textContent = 'Cover image selected.';
      renderImagePreviews();
    });

    const up = makeButton('Move up', () => moveImage(index, -1));
    const down = makeButton('Move down', () => moveImage(index, 1));
    up.disabled = index === 0;
    down.disabled = index === active.length - 1;
    const remove = makeButton('Remove', () => removeImage(image), 'admin-small-button danger');
    actions.append(cover, up, down, remove);
    item.append(controls, actions);
    imagePreviews.append(item);
  });
}

function moveImage(index, step) {
  const active = imageItems.filter((image) => !image.removed);
  const next = index + step;
  if (next < 0 || next >= active.length) return;
  [active[index], active[next]] = [active[next], active[index]];
  imageItems = [...active, ...imageItems.filter((image) => image.removed)];
  imageStatus.textContent = 'Image order updated.';
  renderImagePreviews();
}

function removeImage(image) {
  if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  if (image.persisted) image.removed = true;
  else imageItems = imageItems.filter((entry) => entry !== image);
  imageStatus.textContent = image.persisted
    ? 'Image marked for removal. Save the project to apply this change.'
    : 'Image removed from selection.';
  renderImagePreviews();
}

imageInput.addEventListener('change', () => {
  const files = Array.from(imageInput.files || []);
  imageInput.value = '';
  const errors = [];
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      errors.push(`${file.name}: choose a JPG, PNG, or WebP image.`);
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name}: each image must be 5 MB or smaller.`);
      continue;
    }
    if (imageItems.filter((image) => !image.removed).length >= MAX_PROJECT_IMAGES) {
      errors.push('A project can have at most 8 images.');
      break;
    }
    imageItems.push({
      file,
      previewUrl: URL.createObjectURL(file),
      caption: '',
      alt_text: '',
      sort_order: imageItems.length,
      wants_cover: imageItems.every((image) => !image.wants_cover),
      persisted: false,
      removed: false,
    });
  }
  const selectedCount = imageItems.filter((image) => !image.removed).length;
  imageStatus.textContent = errors.join(' ') || (files.length ? `${selectedCount} image${selectedCount === 1 ? '' : 's'} ready to save.` : '');
  renderImagePreviews();
});

async function removeProject(project) {
  if (!window.confirm(`Delete “${project.title}”? This cannot be undone.`)) return;
  dashboardStatus.textContent = 'Deleting project…';
  try {
    await deleteProject(project.id);
    await refreshProjects('Project deleted.');
  } catch (error) {
    dashboardStatus.textContent = error.message || 'Could not delete project.';
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  loginStatus.textContent = 'Signing in…';
  try {
    const session = await signIn(loginForm.elements.email.value.trim(), loginForm.elements.password.value);
    if (!isAdminUser(session?.user)) {
      await signOut();
      showLogin('This account is not authorized to manage projects.');
      return;
    }
    showDashboard();
    await refreshProjects();
  } catch (error) {
    loginStatus.textContent = error.message || 'Could not sign in. Check your email and password.';
  } finally {
    button.disabled = false;
  }
});

document.getElementById('new-project').addEventListener('click', () => {
  resetProjectForm();
  projectForm.hidden = false;
  projectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('refresh-visit-stats').addEventListener('click', refreshVisitStats);

document.getElementById('cancel-edit').addEventListener('click', resetProjectForm);

projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = projectForm.querySelector('button[type="submit"]');
  button.disabled = true;
  formStatus.textContent = 'Saving project…';
  const values = new FormData(projectForm);
  const project = {
    id: values.get('id'),
    title: values.get('title'),
    description: values.get('description'),
    tech: String(values.get('tech') || '').split(/[\n,]/),
    link: values.get('link'),
    note: values.get('note'),
    display_order: values.get('display_order'),
    visible: projectForm.elements.visible.checked,
  };
  try {
    const projectId = await saveProject(project);
    projectForm.elements.id.value = projectId;
    await saveProjectImages(projectId, imageItems, (message) => {
      imageStatus.textContent = message;
    });
    resetProjectForm();
    await refreshProjects(project.id ? 'Project updated.' : 'Project added.');
  } catch (error) {
    formStatus.textContent = error.message || 'Could not save project.';
  } finally {
    button.disabled = false;
  }
});

document.getElementById('logout').addEventListener('click', async () => {
  dashboardStatus.textContent = 'Signing out…';
  try {
    await signOut();
    projectForm.reset();
    showLogin('You have been logged out.');
  } catch (error) {
    dashboardStatus.textContent = error.message || 'Could not log out.';
  }
});

async function initializeAdmin() {
  if (!isSupabaseConfigured()) {
    showLogin('Set the Supabase URL, anon key, and admin email in supabase.js first.');
    return;
  }
  try {
    const session = await getSession();
    if (!session) {
      showLogin();
      return;
    }
    if (!isAdminUser(session.user)) {
      await signOut();
      showLogin('This account is not authorized to manage projects.');
      return;
    }
    showDashboard();
    await Promise.all([refreshProjects(), refreshVisitStats()]);
  } catch (error) {
    showLogin(error.message || 'Could not check your session.');
  }
}

initializeAdmin();
  await Promise.all([refreshProjects(), refreshVisitStats()]);

(function (root) {
  'use strict';
  const hub = root.FruitTrackMember;
  const Roles = hub.Roles, Content = hub.Content;
  const THEME_STORAGE_KEY = 'fruittrack.member.ui-theme.v1';
  const BROWSEABLE_ROUTES = new Set(['learning', 'practice', 'tasks', 'notes', 'progress']);
  const BROWSE_ROLE_KEY_PREFIX = 'fruittrack.member.browse-role.v1.';
  const fixedRoleValue = document.body && document.body.getAttribute('data-fixed-role');
  const fixedRoleId = fixedRoleValue && Roles.get(fixedRoleValue) ? fixedRoleValue : null;
  const fixedEntry = fixedRoleValue !== null && fixedRoleValue !== undefined;
  let startupError = fixedEntry && !fixedRoleId ? new Error('固定岗位入口配置无效；请使用岗位 A–E 的正式入口。') : null;
  let browserStorage;
  try { browserStorage = root.localStorage; }
  catch (error) {
    browserStorage = {getItem() { throw error; }, setItem() { throw error; }, removeItem() { throw error; }};
  }
  if (!browserStorage || typeof browserStorage.getItem !== 'function') {
    browserStorage = {getItem() { throw new Error('浏览器没有提供本地存储接口。'); }, setItem() { throw new Error('浏览器没有提供本地存储接口。'); }, removeItem() { throw new Error('浏览器没有提供本地存储接口。'); }};
  }
  if (fixedRoleId) {
    const backingStorage = browserStorage;
    const rolePrefix = 'fruittrack.member.fixed.v1.' + fixedRoleId + '.';
    browserStorage = {
      getItem(key) { return backingStorage.getItem(rolePrefix + key); },
      setItem(key, value) { return backingStorage.setItem(rolePrefix + key, value); },
      removeItem(key) { return backingStorage.removeItem(rolePrefix + key); }
    };
  }
  const Store = hub.Storage.create(browserStorage);
  const byId = id => document.getElementById(id);
  const navGroups = [
    ['学习', [['home', '首页', '⌂'], ['daily', '每日任务', '▦'], ['learning', '学习中心', '▣']]],
    ['实践', [['practice', '练习中心', '✎'], ['tasks', '实践任务', '✓']]],
    ['个人空间', [['notes', '我的笔记', '▤'], ['progress', '学习进度', '◷'], ['settings', '数据与设置', '⚙']]]
  ];
  let model = null;
  let creatingProfile = false;
  let route = 'home', courseScope = 'role', routeParams = {}, Daily;
  try { model = Store.loadActiveProfile(); } catch (error) { /* The picker will show a recoverable storage error. */ }
  if (fixedRoleId && !model && !startupError) {
    try { model = Store.createProfile(fixedRoleId); }
    catch (error) { startupError = error; }
  }
  if (fixedRoleId && model && model.roleId !== fixedRoleId) {
    startupError = new Error('本岗位本机档案与固定入口不匹配。为保护记录，页面没有切换或覆盖该档案。');
    model = null;
  }
  function savedBrowseRole() {
    if (!model) return null;
    try {
      const saved = browserStorage.getItem(BROWSE_ROLE_KEY_PREFIX + model.memberId);
      return Roles.get(saved) ? saved : null;
    } catch (error) { return null; }
  }
  function persistBrowseRole(roleId) {
    if (!model || !Roles.get(roleId)) return false;
    try {
      browserStorage.setItem(BROWSE_ROLE_KEY_PREFIX + model.memberId, roleId);
      return true;
    } catch (error) {
      message('当前浏览岗位未能记入本机偏好；课程和学习记录仍按岗位分别保存。');
      return false;
    }
  }
  function roleForRouteParams(params) {
    if (!params) return null;
    const linkedItems = [
      params.course && hub.Curriculum.course(params.course),
      params.exercise && hub.Curriculum.exercise(params.exercise),
      params.practice && hub.Curriculum.practice(params.practice)
    ];
    const linked = linkedItems.find(item => item && Roles.get(item.roleId));
    return linked ? linked.roleId : null;
  }
  function currentBrowseRoleId() {
    if (!model) return null;
    if (!BROWSEABLE_ROUTES.has(route)) return model.roleId;
    const explicit = Roles.get(routeParams.role);
    if (explicit) return explicit.id;
    const linkedRole = roleForRouteParams(routeParams);
    if (linkedRole) return linkedRole;
    return savedBrowseRole() || model.roleId;
  }
  function switchBrowseRole(roleId) {
    const role = Roles.get(roleId);
    if (!model || !role) return;
    courseScope = 'role';
    persistBrowseRole(role.id);
    const targetRoute = BROWSEABLE_ROUTES.has(route) ? route : 'learning';
    navigate(targetRoute, {role: role.id});
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function append(parent, ...children) {
    children.forEach(child => { if (child) parent.append(child); });
    return parent;
  }
  function button(label, action, className = 'button-secondary', attrs = {}) {
    const node = el('button', className, label); node.type = 'button';
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
    node.addEventListener('click', action);
    return node;
  }
  function initializeThemeToggle() {
    let theme = 'light';
    try { if (root.localStorage.getItem(THEME_STORAGE_KEY) === 'dark') theme = 'dark'; }
    catch (error) { /* Keep the default light theme when browser preferences are unavailable. */ }

    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const actions = el('div', 'topbar-actions');
    const roleSwitcher = el('div', 'topbar-role-switcher'); roleSwitcher.id = 'topbar-role-switcher';
    roleSwitcher.setAttribute('role', 'group'); roleSwitcher.setAttribute('aria-label', '切换当前学习岗位');
    actions.append(roleSwitcher);
    const settingsLink = topbar.querySelector('.settings-link');
    if (settingsLink) actions.append(settingsLink);
    const toggle = button('', () => applyTheme(theme === 'dark' ? 'light' : 'dark', true), 'theme-toggle');
    toggle.id = 'theme-toggle';
    actions.append(toggle);
    topbar.append(actions);

    function applyTheme(nextTheme, persist) {
      theme = nextTheme === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', theme);
      toggle.textContent = theme === 'dark' ? '浅色' : '深色';
      toggle.setAttribute('aria-label', '切换到' + (theme === 'dark' ? '浅色' : '深色') + '主题');
      toggle.setAttribute('aria-pressed', String(theme === 'dark'));
      if (!persist) return;
      try {
        root.localStorage.setItem(THEME_STORAGE_KEY, theme);
        message('外观已切换，偏好已保存在本机浏览器。');
      } catch (error) {
        message('外观已切换，但浏览器没有保存主题偏好。');
      }
    }
    applyTheme(theme, false);
  }
  function currentRole() { return Roles.get(model.roleId); }
  function message(text) { byId('member-notice').textContent = text || ''; }
  function showError(error) {
    const box = byId('app-error');
    box.textContent = error && error.message ? error.message : String(error);
    box.hidden = false;
  }
  function currentTimestamp() { return new Date().toISOString(); }
  function saveChange(change, successText, statusNode) {
    try {
      const candidate = JSON.parse(JSON.stringify(model));
      change(candidate);
      model = Store.saveProfile(candidate);
      if (statusNode) statusNode.textContent = successText || '本机已保存。';
      byId('app-error').hidden = true;
      return true;
    } catch (error) {
      if (statusNode) statusNode.textContent = '保存失败：' + error.message;
      showError(error);
      return false;
    }
  }
  function heading(title, eyebrow, description) {
    const header = el('header', 'page-head');
    const titleElement = el('h1', '', title); titleElement.id = 'page-title';
    append(header, append(el('div'), el('p', 'eyebrow', eyebrow), titleElement, el('p', '', description)));
    return header;
  }
  function sectionTitle(title, note) {
    return append(el('div', 'section-title'), el('h2', '', title), el('p', '', note || ''));
  }
  function roleLabel(roleId) {
    const role = Roles.get(roleId);
    return role ? role.id + ' · ' + role.name : '未选择岗位';
  }
  function renderTopbarRoleSwitcher() {
    const switcher = byId('topbar-role-switcher');
    if (!switcher) return;
    switcher.replaceChildren();
    const activeRoleId = currentBrowseRoleId();
    Roles.list().forEach(role => {
      const active = role.id === activeRoleId;
      const choice = button(role.id, () => switchBrowseRole(role.id), 'topbar-role-button' + (active ? ' active' : ''), {
        'data-topbar-role': role.id,
        'data-main-role-choice': String(role.id === model.roleId),
        'aria-label': '切换当前学习岗位到 ' + role.id + '：' + role.name,
        'aria-pressed': String(active),
        title: role.id + ' · ' + role.name
      });
      switcher.append(choice);
    });
    const returnButton = button('返回主岗 ' + model.roleId, () => switchBrowseRole(model.roleId), 'topbar-role-return', {
      'data-topbar-return-main': 'true',
      'aria-label': '返回主岗位 ' + model.roleId,
      title: '返回主岗位：' + roleLabel(model.roleId)
    });
    switcher.append(returnButton);
  }
  function renderRoleContext(content) {
    if (!BROWSEABLE_ROUTES.has(route)) return;
    const browsingRoleId = currentBrowseRoleId();
    const context = el('aside', 'role-context'); context.id = 'role-context';
    context.setAttribute('data-main-role', model.roleId);
    context.setAttribute('data-current-role', browsingRoleId);
    context.setAttribute('aria-label', '当前岗位浏览状态');
    append(context,
      el('span', 'role-context-main', '主岗位：' + roleLabel(model.roleId)),
      el('span', 'role-context-current', '当前浏览：' + roleLabel(browsingRoleId))
    );
    content.append(context);
  }
  function renderRoleExplorer(content, browsingRoleId) {
    const section = el('aside', 'role-explorer'); section.id = 'role-explorer';
    section.setAttribute('aria-label', '岗位浏览状态');
    section.textContent = '主岗位：' + roleLabel(model.roleId) + ' · 当前浏览：' + roleLabel(browsingRoleId) + '。可从工作台顶部直接切换岗位；各岗位学习记录分别保存，跨岗位学习不会更改主岗位。固定入口不验证身份，多人共用浏览器时无法保证个人记录隔离。';
    content.append(section);
  }
  function renderRolePicker() {
    byId('role-picker').hidden = false;
    byId('member-shell').hidden = true;
    const savedProfiles = byId('saved-member-profiles');
    const roleBlock = byId('role-create-block');
    const createButton = byId('create-member-profile');
    savedProfiles.replaceChildren();
    const options = byId('role-options'); options.replaceChildren();
    Roles.list().forEach(role => {
      const choice = button('', () => selectRole(role.id), 'role-option', {'data-role': role.id, 'aria-label': '选择 ' + role.id + '：' + role.name});
      append(choice,
        el('span', 'role-letter', role.id),
        append(el('span', 'role-option-copy'), el('strong', '', role.name), el('small', '', role.summary)),
        el('span', 'role-arrow', '→')
      );
      options.append(choice);
    });
    let profiles = [];
    try { profiles = Store.listProfiles(); }
    catch (error) { byId('picker-message').textContent = error.message; }
    savedProfiles.hidden = profiles.length === 0;
    if (profiles.length) {
      savedProfiles.append(el('h2', '', '已有成员档案'));
      profiles.forEach(profile => {
        const label = profile.displayName ? profile.displayName + ' · ' + roleLabel(profile.roleId) : profile.memberId + ' · ' + roleLabel(profile.roleId);
        savedProfiles.append(button('继续使用 ' + label, () => activateMember(profile.memberId), 'profile-choice', {'data-member-profile': profile.memberId}));
      });
    }
    createButton.hidden = !profiles.length || creatingProfile;
    roleBlock.hidden = profiles.length > 0 && !creatingProfile;
    if (!profiles.length) byId('picker-message').textContent = '';
  }
  function selectRole(roleId) {
    const role = Roles.get(roleId);
    if (fixedEntry && (!fixedRoleId || roleId !== fixedRoleId)) {
      showError(new Error(fixedRoleId ? '此固定入口只能使用岗位 ' + fixedRoleId + '。' : '固定岗位入口配置无效。'));
      return;
    }
    if (!role) { byId('picker-message').textContent = '无法识别这个岗位，请从 A–E 中重新选择。'; return; }
    try {
      if (!model) model = Store.createProfile(role.id);
      else {
        const updated = {...model, roleId: role.id};
        model = Store.saveProfile(updated);
      }
    } catch (error) {
      if (!model) renderRolePicker();
      else showError(error);
      byId('picker-message').textContent = '成员档案未能保存：' + error.message;
      return;
    }
    creatingProfile = false;
    persistBrowseRole(role.id);
    route = 'home'; courseScope = 'role';
    location.hash = '#home';
    render();
  }
  function activateMember(memberId) {
    if (fixedEntry) { showError(new Error('固定岗位入口不能切换本机成员档案。')); return; }
    try { model = Store.setActiveMember(memberId); }
    catch (error) { byId('picker-message').textContent = '无法打开成员档案：' + error.message; return; }
    persistBrowseRole(model.roleId);
    creatingProfile = false; route = 'home'; courseScope = 'role'; location.hash = '#home'; render();
  }
  function renderNav() {
    const nav = byId('nav'); nav.replaceChildren();
    navGroups.forEach(([title, items]) => {
      const group = el('div', 'nav-group'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', title);
      const groupTitle = el('span', 'nav-group-title', title); groupTitle.setAttribute('aria-hidden', 'true'); group.append(groupTitle);
      items.forEach(([id, label, icon]) => {
        const link = el('a', route === id ? 'active' : ''); link.href = '#' + id;
        if (route === id) link.setAttribute('aria-current', 'page');
        const iconNode = el('span', 'nav-icon', icon); iconNode.setAttribute('aria-hidden', 'true');
        append(link, iconNode, el('span', '', label));
        group.append(link);
      });
      nav.append(group);
    });
    byId('current-role-label').textContent = roleLabel(model.roleId);
    byId('topbar-role').textContent = (model.displayName ? model.displayName + ' · ' : '') + '主岗位 ' + roleLabel(model.roleId);
    renderTopbarRoleSwitcher();
  }
  function completeCourse(roleId, courseId) {
    const saved = saveChange(candidate => {
      const completed = candidate.learningProgressByRole[roleId];
      if (!completed.includes(courseId)) completed.push(courseId);
    }, '课程进度已保存在本机。');
    if (saved) render();
  }
  function courseCard(roleId) {
    const role = Roles.get(roleId), sample = Content.role(roleId);
    if (!role || !sample) throw new Error('岗位课程配置不完整：' + roleId);
    const isOwn = role.id === model.roleId;
    const card = el('article', 'course-card'); card.setAttribute('data-course-role', role.id); card.setAttribute('data-course-id', sample.course.id);
    const meta = append(el('div', 'card-kicker'), el('span', '', role.id + ' · ' + role.name), el('span', isOwn ? 'badge' : 'badge elective', isOwn ? '岗位课程' : '选修'));
    append(card, meta, el('h3', '', sample.course.title), el('p', '', sample.course.summary), el('span', 'meta-line', sample.course.duration));
    const details = el('details', 'course-details'); details.setAttribute('data-course-details', role.id);
    details.append(el('summary', '', '展开学习要点与示例'));
    const list = el('ul'); sample.course.points.forEach(point => list.append(el('li', '', point)));
    append(details, el('h4', '', '本节要点'), list, el('h4', '', 'FruitTrack 示例'), el('p', '', sample.course.example));
    card.append(details);
    const isCompleted = model.learningProgressByRole[roleId].includes(sample.course.id);
    const progressButton = button(isCompleted ? '课程已完成' : '标记本节课程完成', () => completeCourse(roleId, sample.course.id), isCompleted ? 'button-secondary saved' : 'button-secondary', {'data-course-complete': roleId + ':' + sample.course.id});
    progressButton.disabled = isCompleted;
    card.append(progressButton);
    return card;
  }
  function taskCard(sample) {
    const card = el('article', 'sample-card');
    card.append(el('div', 'card-kicker', '岗位实践样例'));
    card.append(el('h3', '', sample.title));
    const steps = el('ol', 'step-list');
    sample.steps.forEach((step, index) => steps.append(append(el('li', 'task-step'), el('span', 'step-number', String(index + 1)), el('p', '', step))));
    append(card, steps, el('div', 'deliverable', '预期产物：' + sample.deliverable));
    return card;
  }
  function exerciseCard(sample) {
    const card = el('article', 'sample-card');
    append(card, el('div', 'card-kicker', '岗位练习样例'), el('h3', '', sample.title), el('p', '', sample.prompt));
    const check = el('details', 'check-panel'); check.append(el('summary', '', '展开自查要点'));
    const list = el('ul'); sample.check.forEach(item => list.append(el('li', '', item))); check.append(list);
    card.append(check);
    return card;
  }
  function renderHome() {
    const role = currentRole(), sample = Content.role(role.id);
    const content = byId('page-content');
    append(content, heading('成员首页', 'MY WORKSPACE', '围绕当前岗位学习、练习和整理 FruitTrack 苹果检测项目的基础工作。'));
    const hero = el('section', 'hero-card');
    const roleHeading = el('h2', '', role.id + ' · ' + role.name); roleHeading.id = 'home-role';
    const welcome = model.displayName ? '欢迎回来，' + model.displayName + '。' : '欢迎回到 FruitTrack 学习工作台。';
    append(hero, el('p', 'eyebrow', 'CURRENT ROLE · ' + role.id), el('p', 'hero-welcome', welcome), roleHeading, el('p', '', role.summary));
    content.append(hero);
    Daily.home(content);
    content.append(sectionTitle('本岗位学习起点', '真实项目示例 · ' + sample.course.duration));
    const grid = el('div', 'card-grid'); grid.append(courseCard(role.id));
    const task = el('article', 'progress-card');
    append(task, el('div', 'card-kicker', '下一步实践'), el('h3', '', sample.task.title), el('p', '', sample.task.deliverable), button('查看实践任务', () => navigate('tasks')));
    grid.append(task); content.append(grid);
    append(content, sectionTitle('岗位关注点', '从小样例开始，逐步积累可核对的结果'));
    const focus = el('div', 'button-row'); role.focus.forEach(item => focus.append(el('span', 'badge', item)));
    content.append(focus);
  }
  function renderLearning() {
    const content = byId('page-content');
    if (routeParams.course) { Daily.course(content, routeParams.course); return; }
    const browsingRoleId = currentBrowseRoleId();
    append(content, heading('学习中心', roleLabel(browsingRoleId).toUpperCase(), '查看当前浏览岗位的苹果检测课程；可自由探索其他岗位，进度按岗位分别保存。'));
    renderRoleExplorer(content, browsingRoleId);
    const scopes = el('div', 'scope-row');
    scopes.append(button('当前浏览岗位课程', () => { courseScope = 'role'; render(); }, 'scope-button' + (courseScope === 'role' ? ' active' : ''), {'data-course-scope': 'role'}));
    scopes.append(button('查看所有岗位课程', () => { courseScope = 'all'; render(); }, 'scope-button' + (courseScope === 'all' ? ' active' : ''), {'data-course-scope': 'all'}));
    content.append(scopes);
    const visibleRoles = courseScope === 'all' ? Roles.ids : [browsingRoleId];
    const grid = el('div', 'card-grid'); visibleRoles.forEach(id => grid.append(courseCard(id)));
    content.append(grid);
    Daily.catalog(content, visibleRoles);
    const banner = el('div', 'info-banner');
    append(banner, el('span', 'info-icon', 'i'), el('span', '', '原有起步示例保留；第1–4周课程已开放。第5至第十二周目前展示路线图目标，具体课程待开放。'));
    content.append(banner);
  }
  function renderPractice() {
    const roleId = currentBrowseRoleId(), sample = Content.role(roleId), content = byId('page-content');
    if (routeParams.exercise) { Daily.exercise(content, routeParams.exercise); return; }
    append(content, heading('练习中心', roleLabel(roleId).toUpperCase(), '通过短练习检查概念和方法；答案只用于本地自查，不会提交到任何服务。'));
    const grid = el('div', 'card-grid'); grid.append(exerciseCard(sample.exercise)); content.append(grid);
    const previous = [...model.exerciseResultsByRole[roleId]].reverse().find(item => item.exerciseId === sample.course.id);
    const form = el('section', 'profile-card');
    append(form, el('h2', '', '保存本次练习结果'), el('p', '', '结果保存在当前成员档案和岗位下，仅用于个人学习记录。'));
    const answer = el('textarea', 'note-field'); answer.id = 'practice-answer'; answer.setAttribute('aria-label', '练习答案'); answer.value = previous ? previous.response : '';
    const status = el('p', 'stage-note'); status.id = 'practice-save-state'; status.textContent = previous ? '已载入本机上次保存的练习结果。' : '填写答案后选择保存；保存成功后才会显示已保存。';
    form.append(answer, button('保存练习结果', () => {
      if (saveChange(candidate => candidate.exerciseResultsByRole[roleId].push({exerciseId: sample.course.id, response: answer.value, savedAt: currentTimestamp()}), '练习结果已保存在本机。', status)) status.textContent = '练习结果已保存在本机。';
    }), status);
    content.append(form);
    const note = el('p', 'stage-note'); note.id = 'practice-stage-note'; note.textContent = '当前保存的是个人练习记录；团队成果提交与管理员反馈后续阶段开放。'; content.append(note);
  }
  function renderTasks() {
    const roleId = currentBrowseRoleId(), sample = Content.role(roleId), content = byId('page-content');
    if (routeParams.practice) { Daily.practice(content, routeParams.practice); return; }
    append(content, heading('实践任务', roleLabel(roleId).toUpperCase(), '每个岗位提供一个范围清楚、产物可检查的起步任务。'));
    content.append(taskCard(sample.task));
    const taskId = 'starter-' + roleId;
    const record = model.practiceTasksByRole[roleId][taskId] || {status: 'not_started', deliverable: ''};
    const form = el('section', 'profile-card');
    append(form, el('h2', '', '个人实践记录'), el('p', '', '此为自选学习样例任务，不代表管理员分配或团队验收。'));
    const label = el('label', 'field-label', '当前状态'); label.setAttribute('for', 'practice-task-status');
    const statusSelect = el('select', 'text-field'); statusSelect.id = 'practice-task-status';
    [['not_started', '未开始'], ['in_progress', '进行中'], ['completed', '已完成'], ['blocked', '遇到困难']].forEach(([value, text]) => {
      const option = el('option', '', text); option.value = value; if (value === record.status) option.selected = true; statusSelect.append(option);
    });
    const deliverableLabel = el('label', 'field-label', '交付记录'); deliverableLabel.setAttribute('for', 'practice-task-deliverable');
    const deliverable = el('textarea', 'note-field'); deliverable.id = 'practice-task-deliverable'; deliverable.value = record.deliverable;
    const saveState = el('p', 'stage-note'); saveState.id = 'task-save-state'; saveState.textContent = record.updatedAt ? '已载入本机上次保存的实践记录。' : '状态和交付记录仅在保存成功后写入本机。';
    form.append(label, statusSelect, deliverableLabel, deliverable, button('保存实践记录', () => {
      if (saveChange(candidate => { candidate.practiceTasksByRole[roleId][taskId] = {status: statusSelect.value, deliverable: deliverable.value, updatedAt: currentTimestamp()}; }, '实践状态和交付记录已保存在本机。', saveState)) saveState.textContent = '实践状态和交付记录已保存在本机。';
    }), saveState);
    content.append(form);
    const note = el('p', 'stage-note'); note.id = 'task-stage-note'; note.textContent = '个人记录不会提交给管理员；正式团队任务分配与成果提交后续阶段开放。'; content.append(note);
  }
  function renderNotes() {
    const roleId = currentBrowseRoleId(), content = byId('page-content');
    append(content, heading('我的笔记', roleLabel(roleId).toUpperCase(), '把课程疑问、数据检查发现或测试观察保存在当前成员档案中。'));
    const note = el('div', 'info-banner'); note.id = 'notes-persistence-note';
    append(note, el('span', 'info-icon', 'i'), el('span', '', '笔记按成员编号和岗位分开保存在本机浏览器中。需要移动目录或更换浏览器时，请先在“数据与设置”导出备份。'));
    content.append(note);
    const toolbar = el('div', 'notes-toolbar'); append(toolbar, el('p', '', '笔记归属：' + roleLabel(roleId)), el('span', 'badge', model.memberId));
    content.append(toolbar);
    const textarea = el('textarea', 'note-field'); textarea.id = 'member-note-draft'; textarea.setAttribute('aria-label', '本次会话笔记草稿');
    textarea.value = model.notesByRole[roleId];
    textarea.addEventListener('input', () => {
      const state = byId('note-draft-state');
      if (!saveChange(candidate => { candidate.notesByRole[roleId] = textarea.value; }, '笔记已保存在本机。', state)) state.textContent = '保存失败：笔记未写入本机，请复制内容后重试。';
    });
    content.append(textarea);
    const state = el('p', 'stage-note'); state.id = 'note-draft-state'; state.textContent = '笔记自动保存到当前成员档案；存储失败时页面会明确提示。';
    content.append(state);
  }
  function renderProgress() {
    const role = Roles.get(currentBrowseRoleId()), sample = Content.role(role.id), content = byId('page-content');
    append(content, heading('学习进度', roleLabel(role.id).toUpperCase(), '各岗位课程、练习、实践与每日任务分别统计，只显示个人实际记录。'));
    Daily.progress(content, role.id);
    const grid = el('div', 'card-grid');
    const completedCourses = model.learningProgressByRole[role.id].length;
    const exerciseCount = model.exerciseResultsByRole[role.id].length;
    const completedTasks = Object.values(model.practiceTasksByRole[role.id]).filter(item => item.status === 'completed').length;
    const rows = [
      ['▣', '学习内容', completedCourses + ' 节已标记完成 · 含起步示例和第1–4周课程', String(completedCourses)],
      ['✎', '练习记录', exerciseCount + ' 条已保存 · 当前示例练习可记录答案', String(exerciseCount)],
      ['✓', '实践记录', completedTasks + ' 项已标记完成 · 当前岗位样例任务可记录状态', String(completedTasks)]
    ];
    rows.forEach(([icon, title, detail, value]) => {
      const card = el('article', 'progress-row');
      append(card, el('span', 'progress-icon', icon), append(el('span'), el('strong', '', title), el('small', '', detail)), el('span', 'progress-value', value));
      grid.append(card);
    });
    content.append(grid);
    const banner = el('div', 'info-banner'); append(banner, el('span', 'info-icon', 'i'), el('span', '', '当前岗位：' + role.name + '。课程、练习、实践和笔记按 memberId 与 roleId 隔离。示例课程：' + sample.course.title));
    content.append(banner);
  }
  function downloadPersonalBackup() {
    let url = null;
    try {
      const json = Store.exportJSON(model.memberId);
      const blob = new Blob([json], {type: 'application/json'});
      url = URL.createObjectURL(blob);
      const link = el('a'); link.href = url; link.download = 'fruittrack-member-' + model.memberId + '.json';
      document.body.append(link); link.click(); link.remove();
      byId('backup-status').textContent = '已发起个人 JSON 下载；请确认浏览器已下载并妥善保存文件。';
    } catch (error) {
      byId('backup-status').textContent = '导出失败：' + error.message + '；未能确认备份文件已生成。';
    } finally {
      if (url) root.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
  async function restorePersonalBackup(input) {
    const status = byId('backup-status');
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (typeof file.text !== 'function') throw new Error('当前浏览器无法读取所选文件。');
      const raw = await file.text();
      const candidate = Store.inspectJSON(raw);
      if (fixedRoleId && candidate.roleId !== fixedRoleId) {
        throw new Error('备份岗位不匹配：当前入口为岗位 ' + fixedRoleId + '，备份属于岗位 ' + candidate.roleId + '。');
      }
      const exists = Store.listProfiles().some(item => item.memberId === candidate.memberId);
      const action = exists ? '覆盖本机中同 memberId 的成员记录' : '作为新的独立成员档案恢复';
      const accepted = root.confirm('已校验备份格式。\n成员：' + (candidate.displayName || '未命名') + '\n岗位：' + roleLabel(candidate.roleId) + '\nmemberId：' + candidate.memberId + '\n\n即将' + action + '。个人备份不会提交给管理员。是否继续？');
      if (!accepted) { status.textContent = '已取消恢复；当前记录未更改。'; return; }
      model = Store.restoreJSON(raw, {overwrite: exists});
      creatingProfile = false; route = 'settings'; location.hash = '#settings'; render();
      message('个人备份已恢复到 memberId ' + model.memberId + '。');
      byId('backup-status').textContent = '备份已恢复并切换到该成员档案。';
    } catch (error) {
      status.textContent = '恢复失败：' + error.message + (error.code === 'RESTORE_PARTIAL' ? '' : ' 当前成员记录未被覆盖。');
    } finally {
      input.value = '';
    }
  }
  function renderSettings() {
    const role = currentRole(), content = byId('page-content');
    append(content, heading('数据与设置', roleLabel(model.roleId).toUpperCase(), fixedRoleId ? '查看当前固定岗位的本机档案和个人学习记录。此入口不提供身份认证。' : '管理本机成员档案、岗位视图和个人学习记录。此档案不提供身份认证。'));
    const grid = el('div', fixedRoleId ? 'profile-grid fixed-role-profile-grid' : 'profile-grid');
    const profile = el('section', 'profile-card');
    append(profile, el('h2', '', '成员档案'), el('p', '', fixedRoleId ? '当前为岗位 ' + fixedRoleId + ' 固定入口；本地记录单独保存，不验证实际成员身份。' : 'memberId 独立于岗位编号；同一岗位的不同成员使用不同档案。'));
    append(profile, el('label', 'field-label', '成员唯一标识 memberId'), el('output', 'readonly-value', model.memberId)); profile.lastChild.id = 'member-id';
    append(profile, el('label', 'field-label', '当前岗位 roleId'), el('output', 'readonly-value', role.id)); profile.lastChild.id = 'role-id';
    const nameLabel = el('label', 'field-label', '显示名称 displayName'); nameLabel.setAttribute('for', 'display-name');
    const name = el('input', 'text-field'); name.id = 'display-name'; name.type = 'text'; name.maxLength = 40; name.value = model.displayName; name.placeholder = '可选';
    name.addEventListener('input', () => {
      if (saveChange(candidate => { candidate.displayName = name.value.trim(); }, '成员档案已保存在本机。', byId('settings-save-state'))) {
        byId('topbar-role').textContent = (model.displayName ? model.displayName + ' · ' : '') + '主岗位 ' + roleLabel(model.roleId);
      }
    });
    append(profile, nameLabel, name);
    const saveState = el('p', 'stage-note'); saveState.id = 'settings-save-state'; saveState.textContent = '成员档案保存到本机浏览器；写入失败时会明确提示。'; profile.append(saveState);
    if (!fixedRoleId) {
      profile.append(button('新建成员档案', () => { model = null; creatingProfile = true; byId('picker-message').textContent = ''; renderRolePicker(); }, 'button-secondary', {'data-create-member': 'true'}));
      const selector = el('section', 'profile-card');
      append(selector, el('h2', '', '切换当前岗位'), el('p', '', '岗位数据分开记录；更改当前岗位不会覆盖其他岗位的笔记、练习或进度。'));
      const switches = el('div', 'role-switches');
      Roles.list().forEach(item => switches.append(button(item.id + ' · ' + item.name, () => selectRole(item.id), 'role-switch' + (item.id === role.id ? ' active' : ''), {'data-switch-role': item.id, 'aria-pressed': item.id === role.id ? 'true' : 'false'})));
      selector.append(switches);
      append(selector, el('h2', '', '切换成员档案'), el('p', '', '选择同一岗位下的其他成员时，系统按独立 memberId 读取记录。'));
      const profileList = el('div', 'role-switches');
      try {
        Store.listProfiles().forEach(item => {
          const label = (item.displayName || item.memberId) + ' · ' + roleLabel(item.roleId);
          const switchButton = button(label, () => activateMember(item.memberId), 'role-switch' + (item.memberId === model.memberId ? ' active' : ''), {'data-switch-member': item.memberId, 'aria-pressed': item.memberId === model.memberId ? 'true' : 'false'});
          switchButton.disabled = item.memberId === model.memberId; profileList.append(switchButton);
        });
      } catch (error) { profileList.append(el('p', 'error-text', error.message)); }
      selector.append(profileList);
      grid.append(profile, selector);
    } else {
      grid.append(profile);
    }
    content.append(grid);

    const backup = el('section', 'profile-card backup-card');
    append(backup, el('h2', '', '个人 JSON 备份与恢复'), el('p', '', '仅用于本机成员个人备份。不会向管理员提交成果，也不包含管理员数据。移动文件夹或更换浏览器前，请先导出并在目标位置恢复。'));
    backup.append(button('导出个人 JSON', downloadPersonalBackup, 'button-secondary', {'data-export-member': 'true'}));
    const importLabel = el('label', 'field-label', '选择个人备份 JSON'); importLabel.setAttribute('for', 'backup-file');
    const fileInput = el('input', 'text-field'); fileInput.id = 'backup-file'; fileInput.type = 'file'; fileInput.accept = 'application/json,.json';
    fileInput.addEventListener('change', () => restorePersonalBackup(fileInput));
    const backupStatus = el('p', 'stage-note'); backupStatus.id = 'backup-status'; backupStatus.textContent = '恢复前会校验文件格式、版本和成员身份；覆盖同一 memberId 前需要再次确认。';
    append(backup, importLabel, fileInput, backupStatus);
    content.append(backup);
    const local = el('p', 'stage-note'); local.textContent = '页面完全离线运行。浏览器本地数据按文件路径和浏览器隔离；固定入口不验证身份，多人共用浏览器时无法保证个人记录隔离。不要把浏览器存储当作跨目录迁移工具。'; content.append(local);
    Daily.settings(content);
  }
  const renderers = {home: renderHome, daily: () => Daily.render(byId('page-content')), learning: renderLearning, practice: renderPractice, tasks: renderTasks, notes: renderNotes, progress: renderProgress, settings: renderSettings};
  function readRoute() {
    const [name, query = ''] = location.hash.slice(1).split('?');
    const params = Object.create(null);
    query.split('&').filter(Boolean).forEach(pair => {
      const [key, value = ''] = pair.split('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    });
    return {name, params};
  }
  function render() {
    const shell = byId('member-shell'), picker = byId('role-picker');
    byId('app-error').hidden = true;
    if (!model || !model.roleId) {
      if (fixedEntry) {
        picker.hidden = true; shell.hidden = false;
        byId('page-content').replaceChildren();
        showError(startupError || new Error('无法打开当前固定岗位的本机档案。'));
        return;
      }
      renderRolePicker(); return;
    }
    picker.hidden = true; shell.hidden = false;
    try { const parsed = readRoute(); route = parsed.name; routeParams = parsed.params; }
    catch (error) { route = 'home'; routeParams = {}; }
    if (!renderers[route]) { route = 'home'; routeParams = {}; location.hash = '#home'; }
    if (BROWSEABLE_ROUTES.has(route)) {
      const roleId = (Roles.get(routeParams.role) || {id: null}).id || roleForRouteParams(routeParams) || savedBrowseRole() || model.roleId;
      routeParams.role = roleId;
      persistBrowseRole(roleId);
    }
    renderNav();
    const content = byId('page-content'); content.replaceChildren();
    try { renderRoleContext(content); renderers[route](); }
    catch (error) { showError(error); }
  }
  function navigate(id, params = {}) {
    if (!renderers[id]) { showError(new Error('未知页面：' + id)); return; }
    const nextParams = {...params};
    if (BROWSEABLE_ROUTES.has(id) && !Roles.get(nextParams.role)) nextParams.role = currentBrowseRoleId();
    const query = Object.entries(nextParams).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
    const hash = '#' + id + (query ? '?' + query : '');
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  window.addEventListener('hashchange', render);
  byId('nav').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    const target = link.hash.slice(1).split('?')[0];
    if (!renderers[target]) { event.preventDefault(); showError(new Error('未知页面：' + target)); }
  });
  byId('create-member-profile').addEventListener('click', () => { creatingProfile = true; renderRolePicker(); });
  Daily = hub.DailyUI.create({getProfile: () => model, saveChange, navigate, rerender: render});
  initializeThemeToggle();
  render();
  hub.App = Object.freeze({
    getProfile() { return model ? JSON.parse(JSON.stringify(model)) : null; },
    selectRole,
    activateMember
  });
})(globalThis);

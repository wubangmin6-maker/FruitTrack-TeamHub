(function (root) {
  'use strict';
  const hub = root.FruitTrackMember;
  const Roles = hub.Roles, Content = hub.Content;
  const THEME_STORAGE_KEY = 'fruittrack.member.ui-theme.v1';
  const BROWSEABLE_ROUTES = new Set(['learning', 'practice', 'tasks', 'notes', 'progress', 'history']);
  const BROWSE_ROLE_KEY_PREFIX = 'fruittrack.member.browse-role.v1.';
  const fixedRoleValue = document.body && document.body.getAttribute('data-fixed-role');
  const fixedRoleId = fixedRoleValue && Roles.get(fixedRoleValue) ? fixedRoleValue : null;
  const fixedEntry = fixedRoleValue !== null && fixedRoleValue !== undefined;
  const storageNamespace = fixedRoleId ? 'fruittrack.member.fixed.v1.' + fixedRoleId + '.' : '';
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
    const rolePrefix = storageNamespace;
    function scopedKeys() {
      const length = backingStorage.length;
      if (!Number.isSafeInteger(length) || length < 0 || typeof backingStorage.key !== 'function') throw new Error('无法安全枚举当前岗位存储。');
      const keys = [];
      for (let i = 0; i < length; i++) {
        const key = backingStorage.key(i);
        if (typeof key !== 'string') throw new Error('岗位存储键在读取期间发生变化，请关闭其他编辑标签后重试。');
        if (key.startsWith(rolePrefix)) keys.push(key.slice(rolePrefix.length));
      }
      return keys.sort();
    }
    browserStorage = {
      get length() { return scopedKeys().length; },
      key(index) { return scopedKeys()[index] ?? null; },
      getItem(key) { return backingStorage.getItem(rolePrefix + key); },
      setItem(key, value) { return backingStorage.setItem(rolePrefix + key, value); },
      removeItem(key) { return backingStorage.removeItem(rolePrefix + key); }
    };
  }
  let lockManager = null;
  try { if (root.isSecureContext !== false) lockManager = root.navigator && root.navigator.locks; }
  catch (_) { /* Denied capability stays read-only. */ }
  const Writer = hub.Storage.createWriter({locks: lockManager, namespace: storageNamespace, onChange: updateWriterStatus});
  const guard = key => Writer.assertWrite(key);
  let plannedMemberId = null, pageSuspended = false, writerRequest = 0, selectedTemporaryText = '';
  const Store = hub.Storage.create(browserStorage, {guard, createId: () => plannedMemberId || hub.Storage.newMemberId()});
  const DraftStore = hub.Storage.createDrafts(browserStorage, {guard});
  const Recovery = hub.Storage.createRecovery(browserStorage, {roleId: fixedRoleId, guard});
  const History = hub.Storage.createHistory(browserStorage, {guard});
  const byId = id => document.getElementById(id);
  const navGroups = [
    ['学习', [['home', '首页', '⌂'], ['daily', '每日任务', '▦'], ['learning', '学习中心', '▣']]],
    ['实践', [['practice', '练习中心', '✎'], ['tasks', '实践任务', '✓']]],
    ['个人空间', [['notes', '我的笔记', '▤'], ['progress', '学习进度', '◷'], ['history', '学习历史', '↶'], ['settings', '数据与设置', '⚙']]]
  ];
  let model = null;
  let creatingProfile = false;
  let route = 'home', courseScope = 'role', routeParams = {}, Daily;
  let pendingSave = null, externalChange = false, renderedHash = location.hash;
  const draftFields = new Map();
  let activeDraftEditors = [];
  const historyFilters = {memberId: '', contextRole: '', role: 'all', week: 'all', course: 'all', kind: 'all', date: ''};
  const draftFieldIds = ['member-note-draft', 'display-name', 'practice-answer', 'practice-task-status', 'practice-task-deliverable', 'daily-deliverable', 'daily-block-reason', 'project-start-date'];
  if (!startupError) {
    try {
      const inspection = Recovery.scan();
      if (inspection.needed) throw new Error(inspection.issues.map(issue => issue.message).join(' ') || '成员索引异常，请先核对原有档案再恢复。');
      model = Store.loadActiveProfile();
    } catch (error) { startupError = error; }
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
    if (protectDrafts()) return;
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
  function isHostedPage() { return location.protocol === 'https:' || location.protocol === 'http:'; }
  function updateRuntimeCopy() {
    const hosted = isHostedPage(), footer = document.querySelector('.workspace-foot span');
    if (footer) footer.textContent = hosted ? '联网加载 · 数据保存在本机' : '本地副本 · 可离线使用';
    const sidebar = document.querySelector('.sidebar-foot');
    if (sidebar) {
      const version = sidebar.querySelector('.version-label');
      sidebar.replaceChildren(el('span', 'offline-dot'), el('span', '', hosted ? '本机存储' : '离线副本'));
      if (version) sidebar.append(version);
    }
    const privacy = document.querySelector('.privacy-note');
    if (privacy) privacy.textContent = '成员记录保存在本机浏览器中，不需要账号或 VPN。' +
      (hosted ? '网页需要联网加载，不保证断网重开。' : '完整本地副本可离线运行。') +
      'memberId 只是本机档案标识，不是身份认证；移动文件夹或更换浏览器前请导出个人 JSON 备份。';
  }
  function message(text) { byId('member-notice').textContent = text || ''; }
  function canEdit() {
    const state = Writer.getState();
    return !pageSuspended && !!model && state.status === 'editor' && state.memberId === model.memberId;
  }
  function updateWriterStatus() {
    const bar = byId('member-writer-status'); if (!bar) return;
    const state = Writer.getState();
    const labels = {
      idle: '只读：尚未取得成员档案编辑权限。',
      checking: '只读：正在申请编辑权限；正式记录和共享草稿暂不写入。',
      editor: '可编辑：本标签持有当前成员档案写入权限。',
      readonly: '只读：其他标签页正在编辑此档案，或当前写入权限不可用。',
      unsupported: '只读：Web Locks 不可用；不会写入正式记录或共享草稿。',
      error: '只读：锁请求或锁状态异常；请保留内容后重新申请。',
      suspended: '只读：页面已暂停或已释放编辑权限。'
    };
    const text = bar.querySelector('[data-member-writer-message]');
    const editorMismatch = state.status === 'editor' && !canEdit();
    if (text) text.textContent = (editorMismatch ? '只读：目标成员锁已取得，但当前页面档案尚未完成切换或校验。可重新申请当前档案权限。' : labels[state.status] || labels.error) + (state.error ? ' ' + state.error : '');
    bar.setAttribute('data-writer-state', editorMismatch ? 'readonly' : state.status);
    const request = bar.querySelector('[data-request-member-edit]');
    if (request) request.disabled = state.status === 'checking' || (state.status === 'editor' && !!model && state.memberId === model.memberId);
    const release = bar.querySelector('[data-release-member-edit]');
    if (release) { release.textContent = state.status === 'checking' ? '取消本次申请' : '释放编辑权限'; release.disabled = !['checking', 'editor'].includes(state.status); }
    draftFieldIds.forEach(id => {
      const field = byId(id); if (!field) return;
      if (field.localName === 'select') field.disabled = !canEdit() || activeDraftEditors.some(editor => editor.unresolved && Object.values(editor.fields).includes(field));
      else field.readOnly = !canEdit();
    });
  }
  function initializeWriterUI() {
    const bar = el('aside', 'member-writer-status'); bar.id = 'member-writer-status'; bar.setAttribute('role', 'status');
    append(bar, el('p', '', ''));
    bar.firstChild.setAttribute('data-member-writer-message', 'true');
    const controls = el('div', 'button-row');
    const download = button('下载所选临时文本', downloadSelectedText, 'button-secondary', {'data-download-selected-text': 'true'});
    download.addEventListener('pointerdown', captureSelectedText);
    document.addEventListener('selectionchange', captureSelectedText);
    document.addEventListener('focusout', event => { if (event.target && draftFieldIds.includes(event.target.id)) captureSelectedText(event.target); }, true);
    controls.append(button('重新申请编辑权限', requestEditing, 'button-secondary', {'data-request-member-edit': 'true'}),
      button('释放编辑权限', () => {
        if (protectDrafts()) return;
        writerRequest++; Writer.cancel(); updateWriterStatus();
        message('本次申请或编辑权限已取消；当前记录和持久草稿未删除。可主动重新申请。');
      }, 'button-secondary', {'data-release-member-edit': 'true'}), download);
    bar.append(controls); const main = byId('main'); main.replaceChildren(bar, ...Array.from(main.children)); updateWriterStatus();
  }
  function captureSelectedText(field) {
    let text = '';
    const focused = field && typeof field.value === 'string' ? field : document.activeElement;
    if (focused && typeof focused.value === 'string' && Number.isInteger(focused.selectionStart) && Number.isInteger(focused.selectionEnd)) text = focused.value.slice(focused.selectionStart, focused.selectionEnd);
    if (!text && root.getSelection) text = String(root.getSelection());
    selectedTemporaryText = text;
  }
  function downloadSelectedText() {
    const text = selectedTemporaryText; let url = null;
    if (!text) { message('请先选中需要保留的文本；也可直接复制。临时文本下载不是正式学习备份。'); return; }
    try {
      url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
      const link = el('a'); link.href = url; link.download = 'fruittrack-selected-unsaved-text.txt'; document.body.append(link); link.click(); link.remove();
      message('已发起所选文本下载，请确认文件已保存；未写入正式档案或共享草稿。');
    } catch (error) { message('临时文本下载失败：' + error.message + ' 请直接复制保留。'); }
    finally { if (url) root.setTimeout(() => URL.revokeObjectURL(url), 0); }
  }
  async function requestMember(memberId) {
    if (pageSuspended) return false;
    const request = ++writerRequest;
    const granted = await Writer.acquire(memberId);
    if (pageSuspended || request !== writerRequest) return false;
    updateWriterStatus();
    return granted;
  }
  async function requestEditing() {
    if (pageSuspended) return false;
    try {
      if (model) {
        const id = model.memberId;
        if (!await requestMember(id)) return false;
        const latest = Store.getProfile(id);
        if (!latest) throw new Error('取得权限后找不到当前档案；没有创建替代档案。');
        if (fixedRoleId && latest.roleId !== fixedRoleId) throw new Error('档案主岗位与入口不匹配。');
        // Read-only proof check: reacquiring a lease cannot bypass an ambiguous journal.
        History.read(id);
        if (JSON.stringify(latest) !== JSON.stringify(model) && hasUnsavedChanges()) {
          externalChange = true; showError(new Error('最新正式记录已变化。当前输入仍保留；请先复制或导出，再重新读取已保存记录。'));
        } else if (!hasUnsavedChanges()) { model = latest; externalChange = false; render(); }
        updateWriterStatus(); return true;
      }
      if (fixedRoleId && !startupError) {
        const inspection = Recovery.scan();
        if (inspection.needed) throw new Error('成员索引已变化，请重新读取后进行安全恢复。');
        const existing = Store.loadActiveProfile();
        if (existing) {
          if (existing.roleId !== fixedRoleId) throw new Error('档案主岗位与固定入口不匹配。');
          model = existing; render(); return await requestEditing();
        }
        return await createMemberProfile(fixedRoleId);
      }
      if (!startupError) { message('请选择岗位；建档前将真实申请成员和索引写入权限。'); updateWriterStatus(); }
      return false;
    } catch (error) { Writer.release('error'); updateWriterStatus(); showError(error); return false; }
  }
  async function createMemberProfile(roleId) {
    const id = hub.Storage.newMemberId();
    if (!await requestMember(id)) return false;
    try {
      const created = await Writer.structural([id], () => {
        const inspection = Recovery.scan();
        if (inspection.needed) throw new Error('成员索引或现有档案已变化，请先重新读取并安全恢复。');
        if (fixedRoleId && Store.listProfiles().length) throw new Error('此入口已有档案；未创建替代档案，请重新读取已保存记录。');
        plannedMemberId = id;
        try { return Store.createProfile(roleId); } finally { plannedMemberId = null; }
      });
      model = created; startupError = null; creatingProfile = false; render(); updateWriterStatus(); return true;
    } catch (error) { Writer.release('error'); updateWriterStatus(); throw error; }
  }
  function rememberFields(container, reset = false) {
    if (reset) draftFields.clear();
    draftFieldIds.forEach(id => {
      const field = byId(id);
      if (field && container && container.contains(field)) draftFields.set(field, field.value);
    });
  }
  function editorFor(statusNode) { return activeDraftEditors.find(editor => editor.statusNode === statusNode); }
  function editorValues(editor) { return Object.fromEntries(Object.entries(editor.fields).map(([name, field]) => [name, field.value])); }
  function setEditorDisabled(editor, disabled) { Object.values(editor.fields).forEach(field => { field.disabled = disabled; }); }
  function showDraftPanel(editor, notice) {
    if (notice !== undefined) editor.notice = notice;
    editor.panel.replaceChildren(el('strong', '', '未提交草稿'));
    const text = editor.notice || (editor.unresolved
      ? (editor.error ? '本区域草稿无效或损坏，原始内容已保留；请明确处理后继续编辑。' : '发现未提交草稿，请选择恢复或丢弃。')
      : canEdit() ? '编辑时同步保存本机草稿；正式记录仍按原来的保存方式提交。' : '当前只读：可以选择和复制内容，不会写入或清理共享草稿。');
    editor.panel.append(el('p', '', text));
    if (editor.draft) editor.panel.append(el('p', 'meta-line', '草稿更新时间：' + editor.draft.updatedAt));
    if (editor.unresolved && editor.draft && editor.draft.base !== editor.base) {
      editor.panel.append(el('p', 'error-text', '恢复冲突：正式记录与草稿基准已不同。恢复只载入编辑区，不会自动覆盖正式记录。'));
    }
    const controls = el('div', 'button-row');
    if (editor.unresolved && editor.draft) controls.append(button('恢复草稿', () => restoreEditorDraft(editor), 'button-secondary', {'data-restore-draft': 'true'}));
    if (editor.raw !== null && editor.raw !== undefined) controls.append(button('丢弃草稿', () => discardEditorDraft(editor), 'button-secondary', {'data-discard-draft': 'true'}));
    if (editor.recovered) controls.append(button('保存恢复内容', editor.commit, 'button-secondary', {'data-save-restored-draft': 'true'}));
    editor.panel.append(controls);
  }
  function readEditorDraft(editor) {
    try {
      const result = DraftStore.read(editor.ref);
      editor.raw = result.raw; editor.draft = result.draft; editor.error = result.error;
      editor.unresolved = result.raw !== null;
      setEditorDisabled(editor, editor.unresolved);
      showDraftPanel(editor);
    } catch (error) {
      editor.raw = undefined;
      showDraftPanel(editor, '草稿无法读取：' + error.message + ' 当前输入请另行保留；不会自动覆盖未知草稿。');
    }
  }
  function persistEditorDraft(editor) {
    if (!editor || editor.unresolved) return false;
    if (editor.raw === undefined) {
      readEditorDraft(editor);
      if (editor.raw === undefined || editor.unresolved) return false;
    }
    const values = editorValues(editor);
    if (!editor.draft && JSON.stringify(values) === JSON.stringify(editor.initialValues)) return true;
    if (editor.draft && JSON.stringify(values) === JSON.stringify(editor.draft.values)) return true;
    try {
      const result = DraftStore.save(editor.ref, {base: editor.draft ? editor.draft.base : editor.base, values}, editor.raw);
      editor.raw = result.raw; editor.draft = result.draft;
      showDraftPanel(editor, '草稿已保存到本机；尚未正式保存为学习记录。');
      return true;
    } catch (error) {
      showDraftPanel(editor, '草稿保存失败：' + error.message + ' 请保留当前文本，不能确认刷新后可恢复。');
      return false;
    }
  }
  function restoreEditorDraft(editor) {
    if (pendingSave || hasFormDraft()) { protectDrafts(); return; }
    try {
      const result = DraftStore.read(editor.ref);
      if (result.raw !== editor.raw || !result.draft) {
        readEditorDraft(editor); showDraftPanel(editor, '草稿已变化或无法校验，请重新核对恢复选项。'); return;
      }
      const latest = Store.getProfile(model.memberId);
      if (!latest) throw new Error('当前正式档案无法读取，草稿仍保留。');
      if (JSON.stringify(latest) !== JSON.stringify(model)) {
        externalChange = true;
        showError(new Error('其他标签页已更新正式档案。请重新读取已保存记录后再恢复草稿；本页没有覆盖、合并或丢弃任何记录。'));
        return;
      }
      if (editor.getBase(latest) !== result.draft.base && !root.confirm('正式记录已发生变化，与草稿基准冲突。继续只会把草稿载入编辑区，不会自动覆盖正式记录。请核对后再决定是否正式保存。仍要载入草稿吗？')) return;
      Object.entries(editor.fields).forEach(([name, field]) => { field.value = result.draft.values[name]; });
      editor.unresolved = false; editor.recovered = true; setEditorDisabled(editor, false);
      updateWriterStatus();
      showDraftPanel(editor, '草稿已载入编辑区，尚未正式保存。核对后可选择“保存恢复内容”；恢复本身不提交记录。');
    } catch (error) { showDraftPanel(editor, '草稿恢复失败：' + error.message + ' 草稿和正式记录均未改写。'); }
  }
  function discardEditorDraft(editor) {
    if (!root.confirm('丢弃这个编辑区域的未提交草稿？正式学习记录不会删除。请先复制仍需保留的文本。')) return;
    try {
      DraftStore.remove(editor.ref, editor.raw);
      Object.entries(editor.fields).forEach(([name, field]) => { field.value = editor.initialValues[name]; });
      editor.raw = null; editor.draft = null; editor.error = null; editor.unresolved = false; editor.recovered = false;
      if (pendingSave && pendingSave.statusId === editor.statusNode.id) pendingSave = null;
      setEditorDisabled(editor, false); rememberFields(editor.statusNode.parentNode);
      showDraftPanel(editor, '草稿已丢弃；正式学习记录未更改。');
    } catch (error) { showDraftPanel(editor, '丢弃草稿失败：' + error.message + ' 原内容仍保留，未删除正式记录。'); }
  }
  function finishEditorSave(statusNode) {
    const editor = editorFor(statusNode); if (!editor) return;
    editor.initialValues = editorValues(editor); editor.base = editor.getBase(model); editor.recovered = false;
    try {
      if (editor.raw === undefined) throw new Error('无法确认原草稿状态。');
      DraftStore.remove(editor.ref, editor.raw);
      editor.raw = null; editor.draft = null; editor.error = null;
      showDraftPanel(editor, '正式记录已保存；本区域草稿已清理。');
    } catch (error) { showDraftPanel(editor, '正式记录已保存，但草稿清理失败：' + error.message + ' 草稿仍保留，未影响正式记录。'); }
  }
  function deferRecoveredAutomatic(statusNode) {
    const editor = editorFor(statusNode);
    if (!editor || !editor.recovered) return false;
    const saved = persistEditorDraft(editor);
    statusNode.textContent = saved ? '已更新未提交草稿；请点击“保存恢复内容”后正式保存。' : '草稿保存失败，请保留当前文本后重试。';
    return true;
  }
  function attachDraftEditors(content) {
    activeDraftEditors = [];
    function attach(roleId, type, recordId, fieldIds, statusId, getBase, commit) {
      const statusNode = byId(statusId);
      const fields = Object.fromEntries(Object.entries(fieldIds).map(([name, id]) => [name, byId(id)]));
      if (!statusNode || Object.values(fields).some(field => !field)) return;
      const panel = el('aside', 'draft-recovery'); panel.setAttribute('data-draft-editor', type); panel.setAttribute('data-draft-record-id', recordId); panel.setAttribute('role', 'status');
      const editor = {ref: {memberId: model.memberId, roleId, type, recordId}, fields, statusNode, getBase, commit, panel, raw: null, draft: null, recovered: false, unresolved: false};
      editor.initialValues = editorValues(editor); editor.base = getBase(model);
      statusNode.parentNode.append(panel); activeDraftEditors.push(editor); readEditorDraft(editor);
      Object.values(fields).forEach(field => ['input', 'change'].forEach(event => field.addEventListener(event, () => persistEditorDraft(editor))));
    }
    const roleId = currentBrowseRoleId();
    attach(roleId, 'notes', 'role-notes', {text: 'member-note-draft'}, 'note-draft-state', p => JSON.stringify(p.notesByRole[roleId]), () => saveChange(p => { p.notesByRole[roleId] = byId('member-note-draft').value; }, '笔记已保存在本机。', byId('note-draft-state')));
    if (byId('practice-answer')) {
      const linked = routeParams.exercise && hub.Curriculum.exercise(routeParams.exercise);
      const owner = linked ? linked.roleId : roleId, id = linked ? linked.id : Content.role(owner).course.id;
      const save = Array.from(byId('practice-save-state').parentNode.querySelectorAll('button')).find(node => node.textContent === '保存练习结果');
      attach(owner, 'exercise', id, {response: 'practice-answer'}, 'practice-save-state', p => JSON.stringify([...p.exerciseResultsByRole[owner]].reverse().find(item => item.exerciseId === id) || null), () => save.click());
    }
    if (byId('practice-task-deliverable')) {
      const linked = routeParams.practice && hub.Curriculum.practice(routeParams.practice);
      const owner = linked ? linked.roleId : roleId, id = linked ? linked.id : 'starter-' + owner;
      const save = Array.from(byId('task-save-state').parentNode.querySelectorAll('button')).find(node => node.textContent === '保存实践记录');
      attach(owner, 'practice', id, {status: 'practice-task-status', deliverable: 'practice-task-deliverable'}, 'task-save-state', p => JSON.stringify(p.practiceTasksByRole[owner][id] || null), () => save.click());
    }
    if (byId('daily-task-detail')) {
      const id = byId('daily-task-detail').getAttribute('data-task-detail'), task = hub.Curriculum.task(id);
      const save = Array.from(byId('daily-save-state').parentNode.querySelectorAll('button')).find(node => node.textContent === '保存交付记录');
      attach(task.roleId, 'daily-task', id, {deliverable: 'daily-deliverable', blockReason: 'daily-block-reason'}, 'daily-save-state', p => JSON.stringify({record: p.dailyTaskProgressByRole[task.roleId][id] || null, scheduledDate: hub.Tasks.view(task, p).scheduledDate}), () => save.click());
    }
    attach(model.roleId, 'profile', 'displayName', {displayName: 'display-name'}, 'settings-save-state', p => JSON.stringify(p.displayName), () => {
      if (saveChange(p => { p.displayName = byId('display-name').value.trim(); }, '成员档案已保存在本机。', byId('settings-save-state'))) renderNav();
    });
    if (byId('project-start-date')) {
      const save = Array.from(byId('project-date-state').parentNode.querySelectorAll('button')).find(node => node.textContent === '调整项目开始日期');
      attach(model.roleId, 'plan', 'projectStartDate', {projectStartDate: 'project-start-date'}, 'project-date-state', p => JSON.stringify({projectStartDate: p.projectStartDate, planChanges: p.planChanges}), () => save.click());
    }
  }
  function hasFormDraft() {
    return Array.from(draftFields).some(([field, value]) => document.body.contains(field) && field.value !== value);
  }
  function hasUnsavedChanges() { return !!pendingSave || hasFormDraft(); }
  function pendingDraftIsCurrent() {
    if (!pendingSave || pendingSave.fields.every(([field, value]) => !document.body.contains(field) || field.value === value)) return true;
    showError(new Error('表单在上次失败后又有修改。请再次点击本页原来的保存按钮，更新待保存草稿；当前输入已保留。'));
    return false;
  }
  function reloadMemberRecords() {
    if (hasUnsavedChanges() && !root.confirm('本页仍有未保存内容。请先保存或导出草稿。确定放弃本页未保存内容并重新读取本机记录？')) return;
    pendingSave = null; draftFields.clear();
    location.reload();
  }
  function retryPendingSave() {
    if (!pendingSave || !pendingDraftIsCurrent()) return;
    try {
      model = Store.saveProfile(pendingSave.candidate, {expectedProfile: pendingSave.base, trackHistory: true});
      const statusNode = byId(pendingSave.statusId);
      pendingSave = null; externalChange = false;
      finishEditorSave(statusNode);
      if (statusNode) rememberFields(statusNode.parentNode);
      render(); message('未保存草稿现已写入本机。');
    } catch (error) { suspendUnsafeHistory(error); showError(error); }
  }
  function suspendUnsafeHistory(error) {
    if (error && ['HISTORY_PARTIAL', 'HISTORY_AMBIGUOUS'].includes(error.code)) {
      Writer.release('error'); externalChange = true;
    }
  }
  function exportUnsavedDraft() {
    if (!pendingSave || !pendingDraftIsCurrent()) return;
    let url = null;
    try {
      const json = Store.exportJSON(model.memberId, {profile: pendingSave.candidate});
      url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
      const link = el('a'); link.href = url; link.download = 'fruittrack-member-' + model.memberId + '-unsaved.json';
      document.body.append(link); link.click(); link.remove();
      message('已发起未保存草稿的个人 JSON 下载；请确认文件已下载。草稿备份不代表内容已保存在本机。');
      showError(new Error('草稿已发起下载；不代表已保存到本机。请确认下载文件，再处理原存储异常。'));
    } catch (error) { showError(new Error('草稿导出失败：' + error.message + ' 请先手动复制表单内容。')); }
    finally { if (url) root.setTimeout(() => URL.revokeObjectURL(url), 0); }
  }
  function showError(error) {
    const box = byId('app-error');
    box.textContent = error && error.message ? error.message : String(error);
    box.hidden = false;
    const controls = el('div', 'button-row');
    if (pendingSave) {
      controls.append(button('重试保存草稿', retryPendingSave, 'button-secondary', {'data-retry-member-save': 'true'}),
        button('导出未保存草稿 JSON', exportUnsavedDraft, 'button-secondary', {'data-export-unsaved': 'true'}));
    }
    if (pendingSave || externalChange || startupError || (error && error.code === 'UNSAVED_FORM')) {
      controls.append(button('重新读取已保存记录', reloadMemberRecords, 'button-secondary', {'data-reload-member-records': 'true'}));
      box.append(controls);
    }
  }
  function protectDrafts() {
    if (!hasUnsavedChanges()) return false;
    showError({code: 'UNSAVED_FORM', message: '本页有尚未保存的内容，已保留在当前页面。请先保存；保存失败时可重试或导出草稿。重新读取会要求确认放弃未保存内容。'});
    return true;
  }
  function currentTimestamp() { return new Date().toISOString(); }
  function saveChange(change, successText, statusNode) {
    let candidate;
    try {
      const editor = editorFor(statusNode);
      if (editor && editor.unresolved) { showError(new Error('请先恢复或丢弃本区域已有草稿，再正式保存。')); return false; }
      if (pendingSave && (!statusNode || pendingSave.statusId !== statusNode.id)) {
        protectDrafts(); return false;
      }
      if (editor) persistEditorDraft(editor);
      // A previously unreadable key may have revealed an old draft during persistence.
      if (editor && editor.unresolved) { showError(new Error('请先恢复或丢弃刚读取到的已有草稿，再正式保存。')); return false; }
      candidate = JSON.parse(JSON.stringify(model));
      change(candidate);
      model = Store.saveProfile(candidate, {expectedProfile: model, trackHistory: true});
      pendingSave = null; externalChange = false;
      finishEditorSave(statusNode);
      if (statusNode) rememberFields(statusNode.parentNode);
      if (statusNode) statusNode.textContent = successText || '本机已保存。';
      byId('app-error').hidden = true;
      return true;
    } catch (error) {
      suspendUnsafeHistory(error);
      if (candidate) pendingSave = {candidate, base: JSON.parse(JSON.stringify(model)), statusId: statusNode && statusNode.id,
        fields: Array.from(draftFields.keys(), field => [field, field.value])};
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
  function renderIndexRecovery(container) {
    if (fixedEntry && !fixedRoleId) return;
    const panel = el('section', 'panel index-recovery'); panel.id = 'index-recovery';
    const status = el('p', 'inline-message'); status.id = 'index-recovery-status'; status.setAttribute('role', 'status');
    const results = el('div', 'index-recovery-results');
    let scanned = null, selectedId = null, verifiedSnapshot = null, verificationSequence = 0;
    const repair = button('确认修复索引并打开所选档案', async () => {
      if (!scanned || !selectedId || verifiedSnapshot === null || scanned.ambiguous) return;
      if (!root.confirm('仅重建当前入口的有效成员索引，并将所选 memberId 设为当前档案。\n不会修改、合并或删除原档案及草稿；无法验证的原数据仍保留。\n请关闭其他正在编辑本入口的标签页。已验证的原始快照包含私人数据，请妥善保管。\n\n确认继续？')) {
        status.textContent = '已取消恢复；原始数据未更改。'; return;
      }
      const selected = selectedId, targetScan = scanned, snapshot = verifiedSnapshot;
      repair.disabled = true;
      status.textContent = '正在申请所选成员及索引写入权限；尚未执行修复。';
      try {
        if (!await requestMember(selected)) throw new Error('只读：未获得所选成员写入权限；未执行索引修复。');
        const ids = new Set(targetScan.entries.filter(entry => entry.key.startsWith('fruittrack.member.v1.profile.')).map(entry => entry.key.slice('fruittrack.member.v1.profile.'.length)).filter(hub.Storage.isMemberId));
        if (hub.Storage.isMemberId(targetScan.activeRaw)) ids.add(targetScan.activeRaw);
        try { const oldIndex = JSON.parse(targetScan.indexRaw); if (oldIndex && Array.isArray(oldIndex.memberIds)) oldIndex.memberIds.filter(hub.Storage.isMemberId).forEach(id => ids.add(id)); } catch (_) { /* Corrupt index retained in verified snapshot. */ }
        const result = await Writer.structural([...ids], () => Recovery.repair(targetScan, selected, {snapshotJSON: snapshot}));
        model = result.profile; startupError = null; creatingProfile = false; externalChange = false;
        route = 'home'; courseScope = 'role'; location.hash = '#home'; render();
        message('成员索引已修复并读回验证。原档案及持久草稿未改写；请立即导出个人 JSON 并核对历史记录。');
      } catch (error) {
        verificationSequence++; verifiedSnapshot = null; repair.disabled = true;
        status.textContent = '索引修复失败：' + error.message + ' 请保留原始快照，重新扫描后再处理；不要清空浏览器数据。';
      }
    }, 'button-primary', {'data-confirm-index-repair': 'true'});
    repair.disabled = true;
    const preview = el('div', 'index-recovery-preview'); preview.id = 'index-recovery-preview';
    const download = button('下载原始恢复快照（含私人数据）', () => {
      if (!scanned) return;
      let url = null;
      try {
        const raw = Recovery.snapshotJSON(scanned);
        url = URL.createObjectURL(new Blob([raw], {type: 'application/json'}));
        const link = el('a'); link.href = url; link.download = 'fruittrack-index-recovery-' + (fixedRoleId || 'local') + '.json';
        document.body.append(link); link.click(); link.remove();
        status.textContent = '已发起原始快照下载。请确认文件落盘，再在下方重新选择该文件验证；此快照不是普通个人 JSON，不包含持久草稿。';
      } catch (error) {
        verificationSequence++; verifiedSnapshot = null; repair.disabled = true;
        status.textContent = '快照生成或下载失败：' + error.message + ' 无法确认原始备份，修复保持禁用。';
      } finally { if (url) root.setTimeout(() => URL.revokeObjectURL(url), 0); }
    }, 'button-secondary', {'data-download-index-snapshot': 'true'});
    download.disabled = true;
    const verifyLabel = el('label', '', '重新选择已下载的原始快照以验证备份');
    const verify = el('input'); verify.type = 'file'; verify.accept = '.json,application/json'; verify.setAttribute('data-verify-index-snapshot', 'true');
    verify.addEventListener('change', async () => {
      const verification = ++verificationSequence;
      verifiedSnapshot = null; repair.disabled = true;
      const file = verify.files && verify.files[0], target = scanned;
      if (!file || !target) return;
      try {
        if (typeof file.text !== 'function') throw new Error('浏览器无法读取所选快照。');
        const expected = Recovery.snapshotJSON(target);
        if (typeof file.size === 'number' && file.size !== new Blob([expected]).size) throw new Error('文件大小与本次快照不匹配。');
        const raw = await file.text();
        if (verification !== verificationSequence || target !== scanned || !document.body.contains(panel)) return;
        if (raw !== expected) throw new Error('文件与本次只读扫描的原始快照不匹配。');
        verifiedSnapshot = raw; repair.disabled = !selectedId || target.ambiguous || !target.candidates.length;
        status.textContent = target.ambiguous ? '原始快照文件已逐字验证，但存在重复编号或身份冲突，修复仍被禁止；请联系负责人核对。' :
          !target.candidates.length ? '原始快照文件已逐字验证，但没有可恢复档案，不能修复索引；请保留快照供诊断。' :
          '原始快照文件已逐字验证。请预览并选择要打开的档案，然后确认修复；其他有效档案一并登记，不合并记录。';
      } catch (error) {
        if (verification === verificationSequence && target === scanned && document.body.contains(panel)) status.textContent = '快照验证失败：' + error.message + ' 未写入任何成员数据。';
      }
      finally { verify.value = ''; }
    });
    verifyLabel.append(verify);
    const runScan = button('只读扫描可恢复档案', () => {
      verificationSequence++;
      scanned = null; selectedId = null; verifiedSnapshot = null; repair.disabled = true; download.disabled = true;
      results.replaceChildren(); preview.replaceChildren();
      try {
        scanned = Recovery.scan();
        download.disabled = false;
        status.textContent = scanned.candidates.length ? '只读扫描完成：' + scanned.candidates.length + ' 个可恢复档案，' + scanned.invalid.length + ' 个无法验证的档案。请逐项预览并选择当前档案。' : '没有可恢复档案（0 个有效候选）；未改写数据。可下载原始快照交由负责人诊断。';
        if (scanned.ambiguous) status.textContent += ' 检测到重复编号或成员身份冲突，禁止修复；请保留快照并联系负责人。';
        scanned.issues.forEach(issue => results.append(el('p', 'muted', issue.message)));
        scanned.candidates.forEach(candidate => {
          const choice = button('预览档案 ' + candidate.memberId + ' · 主岗位 ' + candidate.roleId, () => {
            selectedId = candidate.memberId;
            results.querySelectorAll('[data-preview-index-member]').forEach(node => node.setAttribute('aria-pressed', String(node === choice)));
            preview.replaceChildren(el('h3', '', '将打开的档案'),
              el('p', '', 'memberId：' + candidate.memberId + ' · 主岗位：' + roleLabel(candidate.roleId)),
              el('p', '', '档案校验通过 · 原始版本：' + candidate.schemaVersion + ' · 最近更新：' + candidate.updatedAt),
              el('p', 'muted', '不展示笔记或答案正文。修复会登记本次全部有效候选，仅将这一档案设为当前成员；原档案字节保持不变。'));
            repair.disabled = verifiedSnapshot === null || scanned.ambiguous;
          }, 'button-secondary', {'data-preview-index-member': candidate.memberId, 'aria-pressed': 'false'});
          results.append(choice);
        });
        scanned.invalid.forEach(item => results.append(el('p', 'muted', '无法验证：' + item.key + ' · ' + item.message + ' 原始数据保留于快照，不自动修复内容。')));
      } catch (error) { status.textContent = '只读扫描失败：' + error.message + ' 没有进行任何修复。'; }
    }, 'button-secondary', {'data-scan-index': 'true'});
    append(panel, el('h2', '', '安全恢复成员索引'),
      el('p', '', '先只读扫描当前入口，再预览档案、下载并验证原始快照，最后由你确认修复。不会新建替代档案，也不会清理任何持久草稿。'),
      runScan, status, results, preview, download, verifyLabel, repair);
    container.append(panel);
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
    catch (error) { startupError = error; }
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
    const previousRecovery = byId('picker-recovery'); if (previousRecovery) previousRecovery.remove();
    if (startupError) {
      byId('picker-message').textContent = startupError.message + ' 请勿清空浏览器数据；本页不会自动修复或覆盖历史记录。';
      roleBlock.hidden = true; createButton.hidden = true; savedProfiles.hidden = false; savedProfiles.replaceChildren();
      const recovery = button('重新读取已保存记录', reloadMemberRecords, 'button-secondary', {'data-reload-member-records': 'true'});
      recovery.id = 'picker-recovery'; savedProfiles.append(recovery);
      renderIndexRecovery(savedProfiles);
    } else if (!profiles.length) byId('picker-message').textContent = '';
  }
  async function selectRole(roleId) {
    if (protectDrafts()) return;
    const role = Roles.get(roleId);
    if (fixedEntry && (!fixedRoleId || roleId !== fixedRoleId)) {
      showError(new Error(fixedRoleId ? '此固定入口只能使用岗位 ' + fixedRoleId + '。' : '固定岗位入口配置无效。'));
      return;
    }
    if (!role) { byId('picker-message').textContent = '无法识别这个岗位，请从 A–E 中重新选择。'; return; }
    if (startupError) { byId('picker-message').textContent = startupError.message; return; }
    try {
      if (!model) { if (!await createMemberProfile(role.id)) return; }
      else {
        const updated = {...model, roleId: role.id};
        History.settle(model.memberId);
        model = Store.saveProfile(updated, {expectedProfile: model});
      }
    } catch (error) {
      suspendUnsafeHistory(error);
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
  async function activateMember(memberId) {
    if (protectDrafts()) return;
    if (fixedEntry) { showError(new Error('固定岗位入口不能切换本机成员档案。')); return; }
    if (startupError) { byId('picker-message').textContent = startupError.message + ' 请先完成索引恢复或重新读取记录。'; return; }
    try {
      if (!await requestMember(memberId)) throw new Error('只读：该成员正在其他标签页编辑，未更改当前成员。');
      model = await Writer.structural([memberId], () => Store.setActiveMember(memberId));
    }
    catch (error) { byId('picker-message').textContent = '无法打开成员档案：' + error.message; return; }
    startupError = null;
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
  function completeCourse(roleId, courseId, undo = false) {
    const saved = saveChange(candidate => {
      const completed = candidate.learningProgressByRole[roleId];
      if (undo) candidate.learningProgressByRole[roleId] = completed.filter(id => id !== courseId);
      else if (!completed.includes(courseId)) completed.push(courseId);
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
    if (isCompleted) card.append(button('撤销本节课程完成', () => completeCourse(roleId, sample.course.id, true), 'button-secondary', {'data-undo-course': sample.course.id}));
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
      if (deferRecoveredAutomatic(state)) return;
      if (!saveChange(candidate => { candidate.notesByRole[roleId] = textarea.value; }, '笔记已保存在本机。', state)) state.textContent = '保存失败：笔记未写入本机，请复制内容后重试。';
    });
    content.append(textarea);
    const state = el('p', 'stage-note'); state.id = 'note-draft-state'; state.textContent = '笔记自动保存到当前成员档案；存储失败时页面会明确提示。';
    content.append(state);
  }
  const historyKindLabels = {course_completed: '课程自评完成', course_uncompleted: '撤销课程完成', exercise_submitted: '练习提交', task_completed: '任务完成', task_reopened: '任务重新打开', practice_saved: '实践记录保存'};
  const historyStatusLabels = {not_started: '未开始', in_progress: '进行中', completed: '已完成', blocked: '受阻', not_completed: '未完成', submitted: '已提交'};
  const historyStatus = value => value === null ? '无' : historyStatusLabels[value] || value;
  function historyLink(roleId, recordId) {
    const task = hub.Curriculum.tasks(roleId).find(item => [item.taskId, item.courseId, item.exerciseId, item.practiceId].includes(recordId));
    const sample = Content.role(roleId);
    if (task) return {week: task.week, courseId: task.courseId, title: task.title, task};
    if (sample && [sample.course.id, 'starter-' + roleId].includes(recordId)) return {week: 0, courseId: sample.course.id, title: sample.course.title, task: null};
    return {week: null, courseId: '', title: '未识别关联：' + recordId, task: null};
  }
  function historyLocalDate(time) {
    const d = new Date(time);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  function historyMatches(roleId, recordId, occurredAt) {
    const linked = historyLink(roleId, recordId);
    return (historyFilters.role === 'all' || historyFilters.role === roleId) &&
      (historyFilters.week === 'all' || String(linked.week) === historyFilters.week) &&
      (historyFilters.course === 'all' || linked.courseId === historyFilters.course) &&
      (!occurredAt || !historyFilters.date || historyLocalDate(occurredAt) === historyFilters.date);
  }
  function downloadHistory(raw, filename, status) {
    let url = null;
    try {
      url = URL.createObjectURL(new Blob([raw], {type: 'application/json'}));
      const link = el('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      status.textContent = '已发起下载，请确认文件落盘。历史备份与个人学习记录 JSON 需分别保管。';
    } catch (error) { status.textContent = '历史下载失败：' + error.message; }
    finally { if (url) root.setTimeout(() => URL.revokeObjectURL(url), 0); }
  }
  async function restoreHistoryBackup(input) {
    const file = input.files && input.files[0], status = byId('history-backup-state');
    if (!file || protectDrafts()) return;
    const id = model.memberId, roleId = model.roleId, permissionRequest = writerRequest;
    try {
      if (typeof file.text !== 'function' || (typeof file.size === 'number' && file.size > 10000000)) throw new Error('历史备份文件无法读取或超过10MB。');
      const raw = await file.text();
      if (pageSuspended || permissionRequest !== writerRequest || !model || model.memberId !== id || !document.body.contains(input)) throw new Error('页面或成员已变化，本次历史恢复已取消。');
      const data = History.inspectJSON(raw, {memberId: id, roleId});
      const expectedRaw = History.raw(id);
      if (!root.confirm('已校验独立历史备份。\nmemberId：' + id + '\n主岗位：' + roleId + '\n历史事件：' + data.events.length + '条。\n仅按事件ID合并历史，保留已有事件；同ID内容冲突会拒绝。不会修改课程完成、答案、笔记、任务状态，也不会认证知识掌握。\n请先导出当前历史。是否继续？')) { status.textContent = '已取消历史恢复；当前记录未改动。'; return; }
      if (!await requestMember(id)) throw new Error('只读：没有获得此成员写入权限。');
      if (protectDrafts()) return;
      History.restoreJSON(raw, {memberId: id, roleId, expectedRaw});
      render(); byId('history-backup-state').textContent = '历史已合并恢复；重复事件未重复添加，正式学习状态未改变。';
    } catch (error) { suspendUnsafeHistory(error); status.textContent = '历史恢复失败：' + error.message; }
    finally { input.value = ''; }
  }
  function renderHistory() {
    const content = byId('page-content'), browsingRole = currentBrowseRoleId();
    if (historyFilters.memberId !== model.memberId || historyFilters.contextRole !== browsingRole) Object.assign(historyFilters, {memberId: model.memberId, contextRole: browsingRole, role: browsingRole, week: 'all', course: 'all', kind: 'all', date: ''});
    append(content, heading('学习历史中心', 'LEARNING HISTORY', '历史事件、当前状态与成果分别展示；课程完成属于自评，不代表已通过知识掌握测评。打开页面、复制AI提示词和笔记逐字输入不会生成事件。'));
    const tools = el('section', 'history-filters'); tools.setAttribute('aria-label', '学习历史筛选');
    function filter(id, label, values, key) {
      const wrap = el('label', 'field-label', label), select = el('select', 'text-field'); select.id = id;
      values.forEach(([value, text]) => { const option = el('option', '', text); option.value = String(value); select.append(option); });
      select.value = historyFilters[key]; select.addEventListener('change', () => { historyFilters[key] = select.value; render(); }); wrap.append(select); tools.append(wrap);
    }
    filter('history-role', '岗位', [['all', '全部岗位'], ...Roles.list().map(role => [role.id, roleLabel(role.id)])], 'role');
    filter('history-week', '周次', [['all', '全部周次'], ['0', '起步示例'], ...Array.from({length: 12}, (_, i) => [i + 1, '第' + (i + 1) + '周'])], 'week');
    const courses = Roles.list().flatMap(role => [[Content.role(role.id).course.id, role.id + ' · ' + Content.role(role.id).course.title], ...hub.Curriculum.tasks(role.id).map(task => [task.courseId, role.id + ' · 第' + task.week + '周 · ' + task.title])]);
    filter('history-course', '课程', [['all', '全部课程'], ...courses], 'course');
    filter('history-kind', '事件类型', [['all', '全部类型'], ...Object.entries(historyKindLabels)], 'kind');
    const dateLabel = el('label', 'field-label', '日期（本机时区）'), date = el('input', 'text-field'); date.id = 'history-date'; date.type = 'date'; date.value = historyFilters.date;
    date.addEventListener('change', () => { historyFilters.date = date.value; render(); }); dateLabel.append(date); tools.append(dateLabel);
    tools.append(button('重置筛选', () => { Object.assign(historyFilters, {role: 'all', week: 'all', course: 'all', kind: 'all', date: ''}); render(); })); content.append(tools);
    const current = el('section', 'panel history-current'); current.id = 'history-current-state'; current.append(el('h2', '', '当前状态（不等于完整历史）'));
    const roles = Roles.list().filter(role => historyFilters.role === 'all' || historyFilters.role === role.id);
    roles.forEach(role => {
      const ids = [...new Set(model.learningProgressByRole[role.id])];
      current.append(el('p', '', roleLabel(role.id) + '：当前自评完成' + ids.length + '节；练习' + model.exerciseResultsByRole[role.id].length + '条；当前已完成任务' + Object.values(model.dailyTaskProgressByRole[role.id]).filter(record => record.status === 'completed').length + '项。'));
      ids.filter(id => historyMatches(role.id, id)).forEach(id => current.append(el('p', 'meta-line', historyLink(role.id, id).title + ' · 当前自评完成；旧进度本身的完成时间未记录，请以已记录的历史事件为时间依据。')));
    });
    current.append(el('p', 'stage-note', '当前状态不按历史日期回放；撤销或导入备份可能改变它。未进行掌握测评，也不把练习提交认定为答案正确。')); content.append(current);
    const timeline = el('section', 'panel'); timeline.id = 'history-events'; timeline.append(el('h2', '', '已记录的历史事件'));
    try {
      const result = History.read(model.memberId);
      if (result.pendingState !== 'none') {
        timeline.append(el('p', 'stage-note', result.pendingState === 'applied' ? '发现中断保存：当前档案与待提交结果完全一致，下方仅投影可核对的事件；请整理记录后再继续。' : '发现中断保存：正式档案仍为原值，不把未提交操作计作事件。'));
        timeline.append(button('核对并整理中断记录', () => { try { History.settle(model.memberId); render(); } catch (error) { suspendUnsafeHistory(error); showError(error); } }, 'button-secondary', {'data-settle-learning-history': 'true'}));
      }
      const shown = result.data.events.filter(event => historyMatches(event.roleId, event.recordId, event.occurredAt) && (historyFilters.kind === 'all' || historyFilters.kind === event.kind)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.sequence - a.sequence);
      timeline.append(el('p', 'meta-line', '筛选到' + shown.length + '条事件。事件说明当时的操作，不保证当前状态或证明当次成果仍是最新版本。'));
      if (!shown.length) timeline.append(el('p', 'empty-state', '暂无符合条件的真实历史事件。旧课程完成标记不会被补造为带时间的事件。'));
      shown.forEach(event => {
        const linked = historyLink(event.roleId, event.recordId), row = el('article', 'history-event');
        row.setAttribute('data-learning-event', event.eventId); row.setAttribute('data-event-role', event.roleId); row.setAttribute('data-event-time', event.occurredAt);
        append(row, el('h3', '', historyKindLabels[event.kind] + ' · ' + linked.title), el('p', 'meta-line', roleLabel(event.roleId) + ' · ' + (linked.week === null ? '周次未识别' : linked.week === 0 ? '起步示例' : '第' + linked.week + '周') + ' · ' + new Date(event.occurredAt).toLocaleString('zh-CN', {hour12: false})),
          el('p', '', '当时状态：' + historyStatus(event.fromStatus) + ' → ' + historyStatus(event.toStatus)), el('p', 'meta-line', event.recordId + ' · ' + event.eventId + ' · 原始时间：' + event.occurredAt));
        if (linked.courseId) row.append(button('查看关联课程', () => navigate('learning', linked.task ? {role: event.roleId, course: linked.courseId} : {role: event.roleId}), 'button-secondary'));
        if (event.kind === 'exercise_submitted') row.append(button('查看当前练习记录', () => navigate('practice', linked.task ? {role: event.roleId, exercise: event.recordId} : {role: event.roleId}), 'button-secondary'));
        if (event.kind === 'practice_saved') row.append(button('查看当前实践记录', () => navigate('tasks', linked.task ? {role: event.roleId, practice: event.recordId} : {role: event.roleId}), 'button-secondary'));
        timeline.append(row);
      });
    } catch (error) { timeline.append(el('p', 'error-text', '历史不可读取：' + error.message + ' 原始内容未覆盖。可下载原始历史供诊断；不要用空历史覆盖它。')); }
    content.append(timeline);
    const evidence = el('section', 'panel'); evidence.id = 'history-existing-records';
    append(evidence, el('h2', '', '现存学习成果与既有时间佐证'), el('p', 'stage-note', '这里读取正式档案，不计入上面的事件数量。答案仅代表提交内容；任务仅有最近完成时间，实践只保留最新交付，笔记无专属时间。关联按钮展示当前版本，不是当次成果的版本快照。'));
    let evidenceCount = 0;
    function artifact(title, text) { const details = el('details', 'history-artifact'); append(details, el('summary', '', title), el('pre', 'history-text', text || '未填写内容')); evidence.append(details); evidenceCount++; }
    roles.forEach(role => {
      model.exerciseResultsByRole[role.id].forEach((record, index) => { if (historyMatches(role.id, record.exerciseId, record.savedAt)) artifact(role.id + ' · 练习记录' + (index + 1) + ' · ' + historyLink(role.id, record.exerciseId).title + ' · 原记录提交时间：' + record.savedAt, record.response); });
      Object.entries(model.practiceTasksByRole[role.id]).forEach(([id, record]) => { if (historyMatches(role.id, id, record.updatedAt)) artifact(role.id + ' · 当前实践：' + id + ' · 状态' + historyStatus(record.status) + ' · 最近更新：' + record.updatedAt, record.deliverable); });
      Object.entries(model.dailyTaskProgressByRole[role.id]).forEach(([id, record]) => { if (historyMatches(role.id, id, record.completedAt || record.updatedAt)) artifact(role.id + ' · 当前任务：' + id + ' · 状态' + historyStatus(record.status) + ' · 上次完成：' + (record.completedAt || '未记录'), record.deliverable); });
      if (historyFilters.week === 'all' && historyFilters.course === 'all' && !historyFilters.date && model.notesByRole[role.id]) artifact(role.id + ' · 当前笔记 · 修改时间未单独记录', model.notesByRole[role.id]);
    });
    if (!evidenceCount) evidence.append(el('p', 'empty-state', '当前筛选下没有可展示的正式成果或既有时间佐证。')); content.append(evidence);
    const backup = el('section', 'panel'); backup.id = 'history-backup'; const status = el('p', 'stage-note'); status.id = 'history-backup-state'; status.setAttribute('role', 'status');
    append(backup, el('h2', '', '历史备份与恢复'), el('p', '', '独立历史JSON仅包含事件，不含答案、笔记、实践正文或共享草稿。原个人JSON仍只含正式学习档案；迁移前请分别导出两份。历史恢复只合并事件，不改变当前完成状态。'));
    backup.append(button('导出历史 JSON', () => { try { downloadHistory(History.exportJSON(model.memberId, model.roleId), 'fruittrack-history-' + model.memberId + '.json', status); } catch (error) { status.textContent = '历史导出失败：' + error.message; } }, 'button-secondary', {'data-export-learning-history': 'true'}));
    const fileLabel = el('label', 'field-label', '选择同成员的独立历史备份'), file = el('input', 'text-field'); file.id = 'history-backup-file'; file.type = 'file'; file.accept = '.json,application/json'; file.addEventListener('change', () => restoreHistoryBackup(file)); fileLabel.append(file);
    backup.append(fileLabel, button('下载原始历史诊断文件', () => { try { const raw = History.raw(model.memberId); if (raw === null) { status.textContent = '当前没有已持久化的历史原始文件。'; return; } downloadHistory(raw, 'fruittrack-history-raw-' + model.memberId + '.json', status); } catch (error) { status.textContent = '原始历史导出失败：' + error.message; } }, 'button-secondary'), status); content.append(backup);
  }
  function renderProgress() {
    const role = Roles.get(currentBrowseRoleId()), sample = Content.role(role.id), content = byId('page-content');
    append(content, heading('学习进度', roleLabel(role.id).toUpperCase(), '各岗位课程、练习、实践与每日任务分别统计，只显示个人实际记录。'));
    Daily.progress(content, role.id);
    const grid = el('div', 'card-grid');
    const completedCourses = new Set(model.learningProgressByRole[role.id]).size;
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
    if (protectDrafts()) { input.value = ''; return; }
    const permissionRequest = writerRequest;
    try {
      if (typeof file.text !== 'function') throw new Error('当前浏览器无法读取所选文件。');
      const raw = await file.text();
      if (pageSuspended || permissionRequest !== writerRequest) { status.textContent = '页面或编辑权限状态已变化，本次导入已取消；未修改成员数据。'; return; }
      if (protectDrafts()) return;
      const candidate = Store.inspectJSON(raw);
      if (fixedRoleId && candidate.roleId !== fixedRoleId) {
        throw new Error('备份岗位不匹配：当前入口为岗位 ' + fixedRoleId + '，备份属于岗位 ' + candidate.roleId + '。');
      }
      const exists = Store.listProfiles().some(item => item.memberId === candidate.memberId);
      const targetRaw = browserStorage.getItem(hub.Storage.keys.profile(candidate.memberId));
      const action = exists ? '覆盖本机中同 memberId 的成员记录' : '作为新的独立成员档案恢复';
      const accepted = root.confirm('已校验备份格式。\n成员：' + (candidate.displayName || '未命名') + '\n岗位：' + roleLabel(candidate.roleId) + '\nmemberId：' + candidate.memberId + '\n备份记录更新时间：' + candidate.updatedAt +
        '\n\n即将' + action + (exists ? '，会替换该档案所有岗位的课程、练习、实践、笔记及每日任务记录，不会自动合并。请先导出本机当前记录，旧备份可能早于本机记录' : '') + '。已有历史事件单独保留；恢复后的当前状态可能与过去的事件不同。个人备份不会提交给管理员。是否继续？');
      if (!accepted) { status.textContent = '已取消恢复；当前记录未更改。'; return; }
      status.textContent = '正在申请目标成员及索引写入权限；备份尚未导入。';
      if (!await requestMember(candidate.memberId)) throw new Error('只读：其他标签正在编辑目标成员，未获得写入权限。');
      if (protectDrafts()) return;
      const restored = await Writer.structural([candidate.memberId], () => {
        if (browserStorage.getItem(hub.Storage.keys.profile(candidate.memberId)) !== targetRaw) throw new Error('确认后目标档案已变化；未导入，请重新核对备份并确认。');
        History.settle(candidate.memberId);
        return Store.restoreJSON(raw, {overwrite: exists});
      });
      model = restored;
      creatingProfile = false; route = 'settings'; location.hash = '#settings'; render();
      message('个人备份已恢复到 memberId ' + model.memberId + '。');
      byId('backup-status').textContent = '备份已恢复并切换到该成员档案。';
    } catch (error) {
      suspendUnsafeHistory(error);
      status.textContent = '恢复失败：' + error.message + (['RESTORE_PARTIAL', 'HISTORY_PARTIAL'].includes(error.code) ? '' : ' 当前成员记录未被覆盖。');
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
      if (deferRecoveredAutomatic(byId('settings-save-state'))) return;
      if (saveChange(candidate => { candidate.displayName = name.value.trim(); }, '成员档案已保存在本机。', byId('settings-save-state'))) {
        byId('topbar-role').textContent = (model.displayName ? model.displayName + ' · ' : '') + '主岗位 ' + roleLabel(model.roleId);
      }
    });
    append(profile, nameLabel, name);
    const saveState = el('p', 'stage-note'); saveState.id = 'settings-save-state'; saveState.textContent = '成员档案保存到本机浏览器；写入失败时会明确提示。'; profile.append(saveState);
    if (!fixedRoleId) {
      profile.append(button('新建成员档案', () => { if (protectDrafts()) return; model = null; creatingProfile = true; byId('picker-message').textContent = ''; renderRolePicker(); }, 'button-secondary', {'data-create-member': 'true'}));
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
    append(backup, el('h2', '', '个人 JSON 备份与恢复'), el('p', '', '仅用于本机成员个人备份。不会向管理员提交成果，也不包含管理员数据。移动文件夹或更换浏览器前，请先导出并在目标位置恢复。独立学习历史不在此JSON中，请到学习历史中心另行备份；恢复此文件不会删除已有历史事件。'));
    backup.append(button('导出个人 JSON', downloadPersonalBackup, 'button-secondary', {'data-export-member': 'true'}));
    const importLabel = el('label', 'field-label', '选择个人备份 JSON'); importLabel.setAttribute('for', 'backup-file');
    const fileInput = el('input', 'text-field'); fileInput.id = 'backup-file'; fileInput.type = 'file'; fileInput.accept = 'application/json,.json';
    fileInput.addEventListener('change', () => restorePersonalBackup(fileInput));
    const backupStatus = el('p', 'stage-note'); backupStatus.id = 'backup-status'; backupStatus.textContent = '恢复前会校验文件格式、版本和成员身份；覆盖同一 memberId 前需要再次确认。';
    append(backup, importLabel, fileInput, backupStatus);
    content.append(backup);
    const hosted = isHostedPage();
    const local = el('p', 'stage-note'); local.textContent = (hosted
      ? '网页需要联网加载；加载后的页面操作使用本机数据，不保证断网后刷新或重新打开仍可用。HTTPS/HTTP 本地存储按浏览器同源（协议、域名、端口）隔离，不按网页目录隔离。'
      : '完整本地副本可离线使用；文件页面的本地存储行为由浏览器决定，移动文件或更换浏览器前请导出备份。') +
      ' 固定入口不验证身份，多人共用浏览器时无法保证个人记录隔离；不同浏览器、设备及网址之间不会自动同步。升级请保留原网址、浏览器和存储键，不要把浏览器存储当作跨目录迁移工具。'; content.append(local);
    Daily.settings(content);
  }
  const renderers = {home: renderHome, daily: () => Daily.render(byId('page-content')), learning: renderLearning, practice: renderPractice, tasks: renderTasks, notes: renderNotes, progress: renderProgress, history: renderHistory, settings: renderSettings};
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
    updateRuntimeCopy();
    if (hasUnsavedChanges()) {
      if (location.hash !== renderedHash) location.hash = renderedHash;
      protectDrafts(); return;
    }
    const shell = byId('member-shell'), picker = byId('role-picker');
    byId('app-error').hidden = true;
    if (!model || !model.roleId) {
      if (fixedEntry) {
        picker.hidden = true; shell.hidden = false;
        byId('page-content').replaceChildren();
        showError(startupError || new Error('无法打开当前固定岗位的本机档案。'));
        renderIndexRecovery(byId('page-content'));
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
    renderedHash = location.hash;
    rememberFields(content, true);
    attachDraftEditors(content);
    updateWriterStatus();
    if (externalChange) showError(new Error('检测到其他标签页修改了本机成员记录。本页未自动覆盖或重载；请重新读取已保存记录。'));
  }
  function navigate(id, params = {}) {
    if (protectDrafts()) return;
    if (!renderers[id]) { showError(new Error('未知页面：' + id)); return; }
    const nextParams = {...params};
    if (BROWSEABLE_ROUTES.has(id) && !Roles.get(nextParams.role)) nextParams.role = currentBrowseRoleId();
    const query = Object.entries(nextParams).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
    const hash = '#' + id + (query ? '?' + query : '');
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', event => {
    activeDraftEditors.forEach(editor => persistEditorDraft(editor));
    if (!hasUnsavedChanges()) return;
    event.preventDefault(); event.returnValue = '';
  });
  window.addEventListener('pagehide', () => {
    if (canEdit()) activeDraftEditors.forEach(editor => persistEditorDraft(editor));
    pageSuspended = true; writerRequest++; Writer.release('suspended'); updateWriterStatus();
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    pageSuspended = false; updateWriterStatus();
    message('页面已恢复为只读，请重新申请编辑权限；当前输入未丢弃。');
  });
  window.addEventListener('storage', event => {
    if (!model) return;
    const keys = [hub.Storage.keys.profile(model.memberId), hub.Storage.keys.index, hub.Storage.keys.active].map(key => storageNamespace + key);
    if (event.key !== null && !keys.includes(event.key)) return;
    if (event.key === storageNamespace + hub.Storage.keys.active) return;
    if (event.key === storageNamespace + hub.Storage.keys.index) {
      try { if (JSON.stringify(Store.getProfile(model.memberId)) === JSON.stringify(model)) return; } catch (_) { /* Surface an invalid membership change. */ }
    }
    externalChange = true;
    showError(new Error('检测到其他标签页修改了本机成员记录。本页未自动覆盖或重载；请先保留未保存内容，再重新读取已保存记录。'));
  });
  byId('nav').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    const target = link.hash.slice(1).split('?')[0];
    if (!renderers[target]) { event.preventDefault(); showError(new Error('未知页面：' + target)); }
  });
  byId('create-member-profile').addEventListener('click', () => { creatingProfile = true; renderRolePicker(); });
  Daily = hub.DailyUI.create({getProfile: () => model, saveChange, navigate, rerender: render});
  initializeThemeToggle();
  initializeWriterUI();
  render();
  const ready = startupError ? Promise.resolve(false) : requestEditing();
  hub.App = Object.freeze({
    ready,
    getProfile() { return model ? JSON.parse(JSON.stringify(model)) : null; },
    selectRole,
    activateMember
  });
})(globalThis);

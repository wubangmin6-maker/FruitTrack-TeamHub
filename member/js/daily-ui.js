(function (root) {
  'use strict';
  const hub = root.FruitTrackMember;
  const Curriculum = hub.Curriculum, Tasks = hub.Tasks;
  const labels = {not_started: '未开始', in_progress: '进行中', completed: '已完成', blocked: '阻塞'};
  const lessonTypeLabels = {core_knowledge: '核心知识', core_practice: '基础实践', extension_knowledge: '拓展知识', reinforcement_exercise: '巩固练习', integrated_case: '综合案例'};
  const phaseLabels = {foundation: '基础理解', advanced: '技术进阶', integration: '综合应用'};

  function create(options) {
    const {getProfile, saveChange, navigate, rerender} = options;
    const state = {identity: '', date: '', view: 'today', taskId: null, feedback: '', settingsFeedback: '', catalogWeek: 0};
    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function button(text, action, attributes = {}) {
      const node = el('button', 'button-secondary', text); node.type = 'button';
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      node.addEventListener('click', action); return node;
    }
    function append(parent, ...children) {
      children.forEach(child => { if (child) parent.append(child); });
      return parent;
    }
    function list(values, ordered = false) {
      const node = el(ordered ? 'ol' : 'ul', 'lesson-list');
      values.forEach(value => node.append(el('li', '', value))); return node;
    }
    function panel(title) { const node = el('section', 'profile-card lesson-panel'); node.append(el('h2', '', title)); return node; }
    function head(content, title, description) {
      const node = el('header', 'page-head'), inner = el('div');
      const h1 = el('h1', '', title); h1.id = 'page-title';
      inner.append(el('p', 'eyebrow', 'DAILY LEARNING · ' + getProfile().roleId), h1, el('p', '', description));
      node.append(inner); content.append(node);
    }
    function sync() {
      const profile = getProfile(), identity = profile.memberId + ':' + profile.roleId;
      if (state.identity !== identity) {
        state.identity = identity; state.date = Tasks.today(); state.view = 'today'; state.taskId = null; state.feedback = '';
      }
      return profile;
    }
    function views(roleId) { const profile = sync(); return Curriculum.tasks(roleId || profile.roleId).map(task => Tasks.view(task, profile)); }
    function allDefinitions() { return hub.Roles.ids.flatMap(role => Curriculum.tasks(role)); }
    function taskFor(field, id) { return allDefinitions().find(task => task[field] === id); }
    function statusText(view) { return labels[view.status] + (view.isOverdue ? ' · 逾期' : ''); }
    function summary(items, id) {
      const counts = Tasks.stats(items), electives = items.filter(task => task.required === false);
      const electiveCompleted = electives.filter(task => task.status === 'completed').length;
      const node = el('p', 'info-banner', '已开放 ' + items.length + ' 节课程 · 必修完成 ' + counts.completed + '/' + counts.total +
        ' · 选修完成 ' + electiveCompleted + '/' + electives.length + ' · 必修逾期 ' + counts.overdue + ' · 必修阻塞 ' + counts.blocked);
      if (id) node.id = id;
      return node;
    }
    function courseSection(id, title) {
      const section = el('section', 'course-section'); section.id = id;
      section.setAttribute('tabindex', '-1');
      section.append(el('h2', '', title));
      return section;
    }
    function scrollToSection(id) {
      const target = document.getElementById(id);
      if (!target) return;
      if (typeof target.scrollIntoView === 'function') target.scrollIntoView({block: 'start'});
      if (typeof target.focus === 'function') target.focus();
    }
    async function copyText(text) {
      if (root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function') {
        try { await root.navigator.clipboard.writeText(text); return; }
        catch (error) { /* Try the local copy fallback when clipboard permission is unavailable. */ }
      }
      const area = el('textarea', 'copy-fallback'); area.value = text;
      area.setAttribute('aria-label', '待复制的通用 AI 学习提示词'); area.setAttribute('readonly', '');
      document.body.append(area);
      try {
        area.select();
        if (!document.execCommand || !document.execCommand('copy')) throw new Error('浏览器未允许复制到剪贴板。');
      } finally { area.remove(); }
    }
    function genericStudyPrompt(task, course) {
      return [
        '我正在学习 FruitTrack 苹果检测项目。请作为耐心的学习辅导者，用中文帮助我理解下面这节课。',
        '岗位：' + task.roleId + '；周次：第 ' + task.week + ' 周；课程：' + course.title + '；任务编号：' + task.taskId + '。',
        '学习目标：' + task.learningObjectives.join('；') + '。',
        '前置知识：' + task.prerequisites.join('；') + '。',
        '课程实例：' + course.projectExample,
        '请按“概念关系—通俗讲解—逐步例题—让我先独立尝试的练习—检查思路的提示”组织回答。先引导我思考，不要直接替我完成交付。',
        '只使用本课程给出的信息；教学模拟数据必须明确标记为模拟，不要编造数据集许可、模型结果或准确率。指出不确定之处，并提醒我核对课程里的交付与验收标准。',
        '我可以把这段提示词粘贴到自己选择的任意 AI 工具中；本工作台不会连接或调用 AI 服务。'
      ].join('\n');
    }
    function taskCard(view) {
      const card = el('article', 'sample-card daily-task-card'); card.setAttribute('data-daily-task', view.taskId);
      card.setAttribute('data-task-required', String(view.required !== false)); card.setAttribute('data-lesson-type', view.lessonType || ''); card.setAttribute('data-task-phase', view.phase || '');
      const kicker = el('div', 'card-kicker');
      kicker.append(el('span', view.required === false ? 'badge elective' : 'badge', view.required === false ? '选修' : '必修'),
        el('span', 'badge', lessonTypeLabels[view.lessonType] || '课程'),
        el('span', '', (view.required === false ? '建议日 ' : '') + view.scheduledDate + ' · ' + view.estimatedMinutes + ' 分钟'));
      card.append(kicker, el('h3', '', view.title), el('p', 'task-status', statusText(view)), el('p', '', view.deliverable));
      if (view.completedAt) card.append(el('p', 'meta-line', '完成时间：' + view.completedAt));
      card.append(button('任务详情', () => { state.taskId = view.taskId; state.feedback = ''; rerender(); }, {'data-open-task': view.taskId}));
      return card;
    }
    function links(task) {
      const row = el('div', 'button-row');
      row.append(button('学习课程', () => navigate('learning', {course: task.courseId, role: task.roleId}), {'data-task-link': 'course'}),
        button('完成练习', () => navigate('practice', {exercise: task.exerciseId, role: task.roleId}), {'data-task-link': 'exercise'}),
        button('实践步骤', () => navigate('tasks', {practice: task.practiceId, role: task.roleId}), {'data-task-link': 'practice'}));
      row.classList.add('task-detail-links');
      return row;
    }
    function detailSection(key, title, children) {
      const node = el('section', 'task-detail-section');
      node.setAttribute('data-task-detail-section', key);
      node.append(el('h3', '', title));
      children.forEach(child => node.append(child));
      return node;
    }
    function detail(content, taskId) {
      const task = Curriculum.task(taskId);
      if (!task || task.roleId !== getProfile().roleId) { state.taskId = null; return; }
      const view = Tasks.view(task, getProfile());
      const section = panel(task.title); section.id = 'daily-task-detail'; section.setAttribute('data-task-detail', taskId);
      section.setAttribute('data-task-required', String(task.required !== false));
      section.append(el('p', 'info-banner', (phaseLabels[task.phase] || '课程') + ' · ' + (task.required ? '必修' : '选修') + ' · ' + (lessonTypeLabels[task.lessonType] || '课程类型待补')));
      section.append(el('p', 'task-status', task.taskId + ' · ' + view.scheduledDate + ' · ' + statusText(view)));
      const context = el('div', 'task-detail-context');
      context.append(detailSection('goals', '学习目标', [list(task.learningObjectives)]), detailSection('prerequisites', '前置知识', [list(task.prerequisites)]));
      const steps = detailSection('steps', '任务步骤', [list(task.steps, true)]);
      steps.classList.add('task-detail-steps');
      const outcomes = el('div', 'task-detail-outcomes');
      outcomes.append(detailSection('deliverable', '交付物', [el('p', '', task.deliverable)]), detailSection('acceptance', '验收标准', [list(task.acceptanceCriteria)]));
      section.append(context, steps, outcomes, links(task));
      const deliverableLabel = el('label', 'field-label', '个人交付记录（仅保存在本机）'); deliverableLabel.setAttribute('for', 'daily-deliverable');
      const deliverable = el('textarea', 'note-field'); deliverable.id = 'daily-deliverable'; deliverable.value = view.deliverableText;
      const blockedLabel = el('label', 'field-label', '阻塞原因'); blockedLabel.setAttribute('for', 'daily-block-reason');
      const reason = el('input', 'text-field'); reason.id = 'daily-block-reason'; reason.type = 'text'; reason.value = view.blockReason;
      const saveState = el('p', 'stage-note', state.feedback || '课程和练习记录不会自动完成此任务；请自查验收标准后手动标记。'); saveState.id = 'daily-save-state'; saveState.setAttribute('role', 'status');
      function updateStatus(status) {
        const success = saveChange(candidate => Object.assign(candidate, Tasks.update(candidate, task, status, {deliverable: deliverable.value, blockReason: reason.value})), '任务记录已保存在本机。', saveState);
        if (success) { state.feedback = '任务记录已保存在本机。'; rerender(); }
      }
      const controls = el('div', 'button-row');
      controls.append(button(view.status === 'completed' ? '重新开始任务' : '开始任务', () => updateStatus('in_progress'), {'data-task-status': 'in_progress'}),
        button('标记完成', () => updateStatus('completed'), {'data-task-status': 'completed'}),
        button('标记阻塞', () => updateStatus('blocked'), {'data-task-status': 'blocked'}),
        button('保存交付记录', () => updateStatus(view.status)));
      const execution = el('section', 'task-execution-record');
      execution.setAttribute('data-task-execution-record', 'true');
      execution.append(el('h3', '', '个人执行记录'), el('p', 'task-record-intro', '记录自己的实践结果和遇到的困难；内容保存在当前成员档案中。'));
      const fields = el('div', 'task-record-fields');
      fields.append(append(el('div', 'task-record-field'), deliverableLabel, deliverable), append(el('div', 'task-record-field'), blockedLabel, reason));
      execution.append(fields, controls, saveState);
      if (view.startedAt) execution.append(el('p', 'meta-line', '首次开始：' + view.startedAt));
      if (view.completedAt) execution.append(el('p', 'meta-line', (view.status === 'completed' ? '完成时间：' : '上次完成：') + view.completedAt));
      section.append(execution);
      content.append(section);
    }
    function roadmap(content) {
      const rows = el('div', 'roadmap-list');
      Curriculum.weeks(getProfile().roleId).forEach(week => {
        const row = panel('第 ' + week.week + ' 周 · ' + week.title);
        row.setAttribute('data-roadmap-week', String(week.week)); row.setAttribute('data-availability', week.availability); row.setAttribute('data-roadmap-phase', week.phase);
        row.append(el('span', 'badge', phaseLabels[week.phase] || '学习阶段'), el('span', 'badge', week.availability === 'open' ? '第' + week.week + '周课程已开放' : '待开放'), list(week.learningObjectives));
        if (week.availability === 'open') row.append(button('查看本周任务', () => { state.date = Tasks.addDays(getProfile().projectStartDate, (week.week - 1) * 7); state.view = 'week'; state.taskId = null; rerender(); }, {'data-open-week': String(week.week)}));
        else row.append(el('p', 'stage-note', '本周目前只有路线图目标；课程、练习和每日任务尚未开放，不计入完成率。'));
        rows.append(row);
      });
      content.append(rows);
    }
    function render(content) {
      const profile = sync(), items = views();
      head(content, '每日任务', '当前岗位第1–4周已开放24节课程，其中12节必修、12节选修；周日可选复盘或休息；第5–12周课程待开放。');
      content.append(summary(items, 'daily-summary'));
      const tools = el('div', 'daily-toolbar'), dateLabel = el('label', 'field-label', '任务日期'); dateLabel.setAttribute('for', 'daily-date');
      const dateInput = el('input', 'text-field'); dateInput.id = 'daily-date'; dateInput.type = 'date'; dateInput.value = state.date;
      dateInput.addEventListener('change', () => {
        try { Tasks.addDays(dateInput.value, 0); state.date = dateInput.value; state.taskId = null; rerender(); }
        catch (error) { document.getElementById('daily-date-error').textContent = error.message; }
      });
      tools.append(dateLabel, dateInput, button('上一天', () => { state.date = Tasks.addDays(state.date, -1); state.taskId = null; rerender(); }), button('回到今天', () => { state.date = Tasks.today(); state.view = 'today'; state.taskId = null; rerender(); }), button('下一天', () => { state.date = Tasks.addDays(state.date, 1); state.taskId = null; rerender(); }));
      const dateError = el('p', 'stage-note'); dateError.id = 'daily-date-error'; dateError.setAttribute('role', 'alert'); content.append(tools, dateError);
      const tabs = el('div', 'scope-row');
      [['today', '今日任务'], ['week', '本周计划'], ['history', '历史任务'], ['roadmap', '12周路线图']].forEach(([id, title]) => {
        const tab = button(title, () => { state.view = id; state.taskId = null; state.feedback = ''; rerender(); }, {'data-daily-view': id, 'aria-pressed': String(state.view === id)});
        tab.classList.add('scope-button');
        if (state.view === id) tab.classList.add('active'); tabs.append(tab);
      }); content.append(tabs);
      if (state.view === 'roadmap') { roadmap(content); return; }
      let shown;
      if (state.view === 'week') {
        const week = Tasks.weekNumber(state.date, profile.projectStartDate), monday = Tasks.addDays(profile.projectStartDate, (week - 1) * 7), sunday = Tasks.addDays(monday, 6);
        content.append(el('h2', '', '所选周：' + monday + ' — ' + sunday));
        shown = items.filter(task => task.scheduledDate >= monday && task.scheduledDate <= sunday);
        content.append(summary(shown));
        const calendar = el('div', 'daily-calendar');
        for (let day = 0; day < 7; day++) {
          const date = Tasks.addDays(monday, day), column = el('section', 'day-column');
          column.append(el('h3', '', '周' + '一二三四五六日'[day] + ' · ' + date));
          const daily = shown.filter(task => task.scheduledDate === date);
          daily.forEach(task => column.append(taskCard(task)));
          if (!daily.length) column.append(el('p', 'stage-note', day === 6 ? '可选复盘或休息，不计入必做完成率。' : '当日没有已开放的任务；后续课程待开放。'));
          calendar.append(column);
        }
        content.append(calendar);
      } else {
        shown = state.view === 'history' ? items.filter(task => task.scheduledDate < Tasks.today() || task.status === 'completed') : items.filter(task => task.scheduledDate === state.date);
        shown.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
        const cards = el('div', 'card-grid'); shown.forEach(task => cards.append(taskCard(task))); content.append(cards);
        if (!shown.length) {
          const text = state.view === 'history' ? '暂无历史任务。完成或到达计划日期后，记录会显示在这里。' : Tasks.isRestDay(state.date) ? '周日可选复盘或休息，不计入必做任务完成率。' : '此日期暂无已开放任务。第1–4周已开放，第5–12周课程待开放。';
          const empty = el('p', 'info-banner', text); empty.id = 'daily-empty'; content.append(empty);
        }
      }
      if (state.taskId) detail(content, state.taskId);
    }
    function home(content) {
      const profile = sync(), items = views(), today = items.filter(task => task.scheduledDate === Tasks.today());
      const roleTasks = Curriculum.tasks(profile.roleId);
      const completedCourses = profile.learningProgressByRole[profile.roleId];
      const requiredCourses = roleTasks.filter(task => task.required !== false);
      const completedRequired = requiredCourses.filter(task => completedCourses.includes(task.courseId)).length;
      const completionRate = requiredCourses.length ? Math.round(completedRequired / requiredCourses.length * 100) : 0;
      const todayDate = Tasks.today(), weekday = new Date(todayDate + 'T00:00:00.000Z').getUTCDay();
      const monday = Tasks.addDays(todayDate, -((weekday + 6) % 7)), sunday = Tasks.addDays(monday, 6);
      const weeklyRequired = items.filter(task => task.required !== false && task.scheduledDate >= monday && task.scheduledDate <= sunday);
      const weeklyCompleted = weeklyRequired.filter(task => task.status === 'completed').length;
      const nextCourse = requiredCourses.find(task => !completedCourses.includes(task.courseId)) || roleTasks[0];
      const section = panel('今日学习与实践'); section.id = 'home-daily'; section.classList.add('home-dashboard');
      const overview = el('div', 'home-overview');
      const progress = el('div', 'home-progress-card');
      append(progress, el('p', 'eyebrow', '本岗位必修进度'));
      const progressValue = el('strong', '', completedRequired + ' / ' + requiredCourses.length); progressValue.id = 'home-required-progress';
      append(progress, progressValue, el('span', 'progress-caption', '节课程已自评完成 · 不代表知识已认证掌握'));
      const progressTrack = el('div', 'home-progress-track'); progressTrack.setAttribute('role', 'progressbar'); progressTrack.setAttribute('aria-label', '本岗位必修课程进度');
      progressTrack.setAttribute('aria-valuemin', '0'); progressTrack.setAttribute('aria-valuemax', String(requiredCourses.length)); progressTrack.setAttribute('aria-valuenow', String(completedRequired));
      const progressFill = el('span', 'home-progress-fill'); progressFill.style.width = completionRate + '%'; progressTrack.append(progressFill); progress.append(progressTrack);
      const weekCard = el('div', 'home-week-card');
      append(weekCard, el('p', 'eyebrow', '本周必修任务'));
      const weekValue = el('strong', '', weeklyCompleted + ' / ' + weeklyRequired.length); weekValue.id = 'home-week-progress';
      append(weekCard, weekValue, el('span', 'progress-caption', weeklyRequired.length ? monday + ' — ' + sunday + ' · 按任务状态记录' : '本周没有已开放的必修任务'));
      const continueCard = el('div', 'home-continue-card');
      append(continueCard, el('p', 'eyebrow', '继续学习'), el('h3', '', nextCourse ? nextCourse.title : '当前课程已全部开放'), el('p', '', nextCourse ? '从上次学习进度继续；练习和实践可以按自己的节奏完成。' : '请查看每日任务或学习中心。'));
      if (nextCourse) continueCard.append(button('打开课程', () => navigate('learning', {course: nextCourse.courseId}), {'data-continue-learning': nextCourse.courseId}));
      overview.append(progress, weekCard, continueCard); section.append(el('p', 'home-date-line', todayDate + ' · ' + profile.roleId + ' 岗位'), overview, summary(items));
      today.forEach(task => {
        const card = el('article', 'home-today-task');
        append(card, el('span', task.required === false ? 'badge elective' : 'badge', task.required === false ? '选修' : '必修'), el('h3', '', task.title), el('p', 'task-status', statusText(task) + ' · 预计 ' + task.estimatedMinutes + ' 分钟'),
          button('查看今日任务', () => { state.date = Tasks.today(); state.view = 'today'; state.taskId = task.taskId; navigate('daily'); }, {'data-home-task': task.taskId}));
        section.append(card);
      });
      if (!today.length) section.append(el('p', 'home-empty', Tasks.isRestDay(Tasks.today()) ? '今天为周日，可选复盘或休息。' : '今天暂无已开放任务，可以继续课程或查看本周计划。'));
      section.append(button('打开每日任务', () => navigate('daily'), {'data-open-daily-tasks': 'true'})); content.append(section);
    }
    function catalog(content, roleIds) {
      const section = panel('第1–4周已开放课程');
      section.append(el('p', '', '每个岗位每周6节：2节核心知识、1节基础实践为必修；拓展知识、巩固练习和综合案例为选修。选修可记录进度，不计入必修完成率或逾期，也不会阻碍后续课程。'));
      const weekNav = el('div', 'course-outline week-filter'); weekNav.id = 'course-week-nav'; weekNav.setAttribute('role', 'group'); weekNav.setAttribute('aria-label', '按课程周次筛选');
      const weekOptions = [[0, '全部已开放'], [1, '第1周'], [2, '第2周'], [3, '第3周'], [4, '第4周']];
      weekOptions.forEach(([week, title]) => {
        const count = week === 0
          ? roleIds.reduce((total, roleId) => total + Curriculum.tasks(roleId).length, 0)
          : roleIds.reduce((total, roleId) => total + Curriculum.tasks(roleId).filter(task => task.week === week).length, 0);
        const filter = button(title + ' · ' + count, () => { state.catalogWeek = week; rerender(); }, {'data-week-filter': String(week), 'aria-pressed': String(state.catalogWeek === week)});
        filter.classList.add('scope-button'); if (state.catalogWeek === week) filter.classList.add('active'); weekNav.append(filter);
      });
      section.append(weekNav);
      const grid = el('div', 'card-grid');
      roleIds.forEach(roleId => Curriculum.tasks(roleId).filter(task => !state.catalogWeek || task.week === state.catalogWeek).forEach(task => {
        const card = el('article', 'course-card curriculum-card');
        card.setAttribute('data-course-role', roleId); card.setAttribute('data-course-id', task.courseId);
        card.setAttribute('data-course-week', String(task.week));
        card.setAttribute('data-course-required', String(task.required)); card.setAttribute('data-course-type', task.lessonType); card.setAttribute('data-course-phase', task.phase);
        const completed = getProfile().learningProgressByRole[roleId].includes(task.courseId);
        const roleBadge = roleId === getProfile().roleId ? roleId + ' · 本岗位' : roleId + ' · 跨岗位选学';
        const kindBadge = roleId !== getProfile().roleId ? '跨岗位选修' : task.required ? '必修' : '选修';
        const badges = el('div', 'course-card-badges');
        badges.append(el('span', 'badge', roleBadge), el('span', task.required && roleId === getProfile().roleId ? 'badge' : 'badge elective', kindBadge),
          el('span', 'badge', lessonTypeLabels[task.lessonType]), el('span', completed ? 'badge course-complete' : 'badge course-open', completed ? '已学会' : '未标记'));
        card.append(badges, el('span', 'course-week-label', '第 ' + task.week + ' 周'), el('h3', '', task.title), el('p', '', task.learningObjectives.join('；')),
          button(completed ? '重新阅读课程' : '开始学习', () => navigate('learning', {course: task.courseId, role: roleId}), {'data-open-course': task.courseId}));
        grid.append(card);
      }));
      section.append(grid, button('查看12周路线图', () => { sync(); state.view = 'roadmap'; navigate('daily'); })); content.append(section);
    }
    function course(content, courseId) {
      const course = Curriculum.course(courseId), task = taskFor('courseId', courseId);
      if (!course || !task) throw new Error('没有找到这节已开放课程；请从每日任务或学习中心重新进入。');
      const ownRole = course.roleId === getProfile().roleId;
      head(content, course.title, (ownRole ? (task.required ? '本岗位必修课程' : '本岗位选修课程') : '跨岗位选学课程') + ' · 完成记录不代表知识已掌握。');
      const section = panel('本节学习材料'); section.id = 'linked-course'; section.classList.add('course-reading');
      section.setAttribute('data-course-required', String(task.required)); section.setAttribute('data-course-type', task.lessonType); section.setAttribute('data-course-phase', task.phase);
      const trackingNote = ownRole
        ? (course.required ? '必修：计入当前岗位必修完成率和逾期统计。' : '选修：可自主学习和记录，不计入必修完成率或逾期，也不阻碍后续课程。')
        : '跨岗位选修：可自主学习和记录，不进入当前岗位必修完成率或逾期统计。';
      const outline = el('nav', 'course-outline'); outline.id = 'course-outline'; outline.setAttribute('aria-label', '本课内容导航');
      [['course-knowledge', '知识结构'], ['course-explanation', '通俗讲解'], ['course-project', '项目实例'], ['course-worked-example', '完整例题'], ['course-exercise', '练习答案'], ['course-summary', '总结复习']].forEach(([id, label]) => {
        outline.append(button(label, () => scrollToSection(id), {'data-course-jump': id}));
      });
      const knowledge = courseSection('course-knowledge', '知识结构与前置知识');
      knowledge.append(el('p', 'info-banner', (phaseLabels[course.phase] || '学习阶段') + ' · ' + (lessonTypeLabels[course.lessonType] || '课程类型') + ' · ' + trackingNote));
      knowledge.append(el('h3', '', '开始前需要知道'), list(course.prerequisites));
      course.knowledgeStructure.forEach(group => knowledge.append(el('h3', '', group.title), list(group.points)));
      const explanation = courseSection('course-explanation', '通俗讲解');
      course.explanation.forEach(paragraph => explanation.append(el('p', '', paragraph)));
      const project = courseSection('course-project', 'FruitTrack 项目实例');
      project.append(el('p', '', course.projectExample));
      if (course.simulationNotice) project.append(el('p', 'info-banner', course.simulationNotice));
      course.materials.forEach(material => project.append(el('h3', '', material.title), el('pre', 'lesson-material', material.text)));
      const example = course.workedExample;
      const worked = courseSection('course-worked-example', '完整例题：' + example.title);
      worked.append(el('p', '', example.given), list(example.steps, true), el('h3', '', '答案解析'), el('p', 'deliverable', '例题答案：' + example.answer));
      const exercise = Curriculum.exercise(task.exerciseId);
      const exerciseSection = courseSection('course-exercise', '自主练习与参考答案');
      if (exercise.knowledgeChecks) {
        const foundation = exercise.knowledgeChecks.understanding, application = exercise.knowledgeChecks.application;
        exerciseSection.append(el('h3', '', '基础理解题'), el('p', '', foundation.question));
        const foundationAnswer = el('details', 'check-panel'); foundationAnswer.append(el('summary', '', '查看理解题参考答案'), el('p', '', foundation.answer)); exerciseSection.append(foundationAnswer);
        exerciseSection.append(el('h3', '', '应用分析题'), el('p', '', application.question));
        const applicationAnswer = el('details', 'check-panel'); applicationAnswer.append(el('summary', '', '查看应用题参考答案'), el('p', '', application.answer), el('p', '', application.explanation)); exerciseSection.append(applicationAnswer);
      } else exerciseSection.append(el('p', '', exercise.prompt), el('h3', '', '参考答案'), el('p', '', exercise.answer), el('h3', '', '答案解析'), el('p', '', exercise.explanation));
      const summarySection = courseSection('course-summary', '知识总结与复习提示');
      summarySection.append(el('p', '', course.summary), el('h3', '', '复习提示'), el('p', '', course.reviewPrompt));
      const aiSection = courseSection('course-ai-help', '使用你常用的 AI 工具');
      aiSection.append(el('p', '', '复制这节课的通用提示词，再粘贴到你选择的 AI 工具。工作台不会连接 AI 服务。'));
      const promptStatus = el('p', 'stage-note', '提示词只包含本课学习目标与教学要求，不会发送任何数据。'); promptStatus.id = 'ai-study-prompt-status'; promptStatus.setAttribute('role', 'status');
      aiSection.append(button('复制通用 AI 学习提示词', async () => {
        try { await copyText(genericStudyPrompt(task, course)); promptStatus.textContent = '已复制。可粘贴到你常用的任意 AI 工具。'; }
        catch (error) { promptStatus.textContent = '复制失败：' + error.message + '；你仍可手动阅读并复制本页内容。'; }
      }, {'data-generic-ai-prompt': 'true'}), promptStatus);
      section.append(outline, knowledge, explanation, project, worked, exerciseSection, summarySection, aiSection, links(task));
      const completed = getProfile().learningProgressByRole[course.roleId].includes(courseId);
      const mark = button(completed ? '课程已完成' : '标记课程完成', () => {
        const saved = saveChange(candidate => { if (!candidate.learningProgressByRole[course.roleId].includes(courseId)) candidate.learningProgressByRole[course.roleId].push(courseId); }, '课程进度已保存。');
        if (saved) rerender();
      }, {'data-complete-linked-course': courseId}); mark.disabled = completed;
      section.append(mark, el('p', 'stage-note', '标记课程完成只记录课程学习进度，不代表知识已掌握；本阶段不进行掌握评分。每日任务需按验收标准单独记录。')); content.append(section);
    }
    function exercise(content, exerciseId) {
      const exercise = Curriculum.exercise(exerciseId), task = taskFor('exerciseId', exerciseId);
      if (!exercise || !task) throw new Error('没有找到对应练习。');
      head(content, exercise.title, '离线自查练习；答案和评分标准供你核对，不会自动生成成绩或团队反馈。');
      const section = panel('练习题'); section.id = 'linked-exercise';
      if (exercise.knowledgeChecks) {
        section.append(el('h3', '', '基础理解题'), el('p', '', exercise.knowledgeChecks.understanding.question),
          el('h3', '', '应用分析题'), el('p', '', exercise.knowledgeChecks.application.question));
      } else section.append(el('p', '', exercise.prompt));
      const reference = el('details', 'check-panel'); reference.id = 'reference-answer';
      reference.append(el('summary', '', '查看参考答案与评分标准'), el('p', '', exercise.answer));
      if (exercise.explanation) reference.append(el('h3', '', '答案解析'), el('p', '', exercise.explanation));
      if (exercise.knowledgeChecks) reference.append(el('h3', '', '基础理解题参考答案'), el('p', '', exercise.knowledgeChecks.understanding.answer));
      reference.append(list(exercise.gradingCriteria));
      const previous = [...getProfile().exerciseResultsByRole[exercise.roleId]].reverse().find(item => item.exerciseId === exerciseId);
      const label = el('label', 'field-label', exercise.knowledgeChecks ? '我的答案（请分别标记理解题和应用题）' : '我的答案'); label.setAttribute('for', 'practice-answer');
      const answer = el('textarea', 'note-field'); answer.id = 'practice-answer'; answer.value = previous ? previous.response : '';
      const status = el('p', 'stage-note', previous ? '已载入已保存的答案。' : '填写后手动保存。'); status.id = 'practice-save-state';
      section.append(label, answer, button('保存练习结果', () => saveChange(candidate => candidate.exerciseResultsByRole[exercise.roleId].push({exerciseId, response: answer.value, savedAt: new Date().toISOString()}), '练习结果已保存在本机。', status)), status, reference, links(task)); content.append(section);
    }
    function practice(content, practiceId) {
      const practice = Curriculum.practice(practiceId), task = taskFor('practiceId', practiceId);
      if (!practice || !task) throw new Error('没有找到对应实践内容。');
      head(content, practice.title, '按步骤整理个人产物。此页面记录实践结果，每日任务状态仍需单独更新。');
      const section = panel('实践操作步骤'); section.id = 'linked-practice';
      section.append(list(practice.steps, true), el('h3', '', '交付物'), el('p', '', practice.deliverable), el('h3', '', '验收标准'), list(practice.acceptanceCriteria));
      const record = getProfile().practiceTasksByRole[practice.roleId][practiceId] || {status: 'not_started', deliverable: ''};
      const statusLabel = el('label', 'field-label', '实践状态'); statusLabel.setAttribute('for', 'practice-task-status');
      const select = el('select', 'text-field'); select.id = 'practice-task-status';
      Object.entries(labels).forEach(([value, text]) => { const option = el('option', '', text); option.value = value; option.selected = value === record.status; select.append(option); });
      const textLabel = el('label', 'field-label', '实践结果与交付记录'); textLabel.setAttribute('for', 'practice-task-deliverable');
      const deliverable = el('textarea', 'note-field'); deliverable.id = 'practice-task-deliverable'; deliverable.value = record.deliverable;
      const status = el('p', 'stage-note', '实践和每日任务分别保存，避免课程操作误改任务完成状态。'); status.id = 'task-save-state';
      section.append(statusLabel, select, textLabel, deliverable, button('保存实践记录', () => saveChange(candidate => { candidate.practiceTasksByRole[practice.roleId][practiceId] = {status: select.value, deliverable: deliverable.value, updatedAt: new Date().toISOString()}; }, '实践记录已保存在本机。', status)), status, links(task)); content.append(section);
    }
    function progress(content, roleId = getProfile().roleId) { const section = panel('每日任务进度'); const items = views(roleId); const required = items.filter(task => task.required !== false).length; section.append(summary(items), el('p', '', '当前浏览岗位 ' + roleId + ' 已开放' + required + '节必修课；选修课程仍可记录进度，但不进入必修分母或逾期统计。周日和待开放周次不计入分母。')); content.append(section); }
    function settings(content) {
      const section = panel('项目计划日期');
      section.append(el('p', '', '默认开始日期为2026-10-19。请选择周一；修改只重排没有个人记录的任务，已有任务记录保留原计划日期和完成时间。'));
      const label = el('label', 'field-label', '项目开始日期'); label.setAttribute('for', 'project-start-date');
      const input = el('input', 'text-field'); input.id = 'project-start-date'; input.type = 'date'; input.value = getProfile().projectStartDate;
      const status = el('p', 'stage-note', state.settingsFeedback || '计划日期不会随电脑日期变化而自动重置。'); status.id = 'project-date-state';
      section.append(label, input, button('调整项目开始日期', () => {
        try {
          const candidate = Tasks.changeStartDate(getProfile(), input.value);
          if (!root.confirm('将没有个人记录的任务改为以 ' + input.value + ' 为开始日期。已记录任务的日期和历史保持不变。是否继续？')) return;
          if (saveChange(profile => Object.assign(profile, candidate), '计划日期已保存在本机。', status)) { state.settingsFeedback = '计划日期已保存在本机。'; state.date = input.value; state.taskId = null; rerender(); }
        } catch (error) { status.textContent = '调整失败：' + error.message; }
      }), status); content.append(section);
    }
    return Object.freeze({render, home, catalog, course, exercise, practice, progress, settings});
  }
  hub.DailyUI = Object.freeze({create});
})(globalThis);

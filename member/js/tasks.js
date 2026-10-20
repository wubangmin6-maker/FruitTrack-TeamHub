(function (root) {
  'use strict';
  const DAY = 86400000;
  const STATUSES = new Set(['not_started', 'in_progress', 'completed', 'blocked']);
  const clone = value => JSON.parse(JSON.stringify(value));

  function dateValue(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期必须为 YYYY-MM-DD。');
    const [year, month, day] = value.split('-').map(Number);
    const time = Date.UTC(year, month - 1, day), date = new Date(time);
    if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw new Error('日期不存在：' + value);
    return time;
  }
  function addDays(value, amount) {
    if (!Number.isInteger(amount)) throw new Error('日期偏移必须为整数天。');
    const date = new Date(dateValue(value) + amount * DAY);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999 || date.getUTCFullYear() < 1000) throw new Error('日期超出支持范围。');
    return date.toISOString().slice(0, 10);
  }
  function today(date = new Date()) {
    if (!Number.isFinite(date.getTime())) throw new Error('电脑日期无效。');
    return String(date.getFullYear()).padStart(4, '0') + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function timestamp(value) {
    const date = new Date(value);
    if (typeof value !== 'string' || !Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error('任务记录时间无效。');
    return value;
  }
  function dateFor(task, startDate) {
    if (!task || !Number.isInteger(task.week) || task.week < 1 || task.week > 12 || !Number.isInteger(task.day) || task.day < 1 || task.day > 6) throw new Error('必做任务仅安排在第1–12周的周一至周六。');
    return addDays(startDate, (task.week - 1) * 7 + task.day - 1);
  }
  function weekNumber(date, startDate) { return Math.floor((dateValue(date) - dateValue(startDate)) / (7 * DAY)) + 1; }
  function isRestDay(date) { return new Date(dateValue(date)).getUTCDay() === 0; }
  function view(task, profile, currentDate = today()) {
    dateValue(currentDate);
    const record = profile.dailyTaskProgressByRole[task.roleId][task.taskId];
    const scheduledDate = record ? record.scheduledDate : dateFor(task, profile.projectStartDate);
    const status = record ? record.status : 'not_started';
    const required = task.required !== false;
    return {...clone(task), scheduledDate, status, isOverdue: required && status !== 'completed' && scheduledDate < currentDate,
      startedAt: record ? record.startedAt : null, completedAt: record ? record.completedAt : null,
      deliverableText: record ? record.deliverable : '', blockReason: record ? record.blockReason : ''};
  }
  function stats(views) {
    const required = views.filter(task => task.required !== false);
    const completed = required.filter(task => task.status === 'completed').length;
    return {total: required.length, completed, remaining: required.length - completed,
      overdue: required.filter(task => task.isOverdue).length, blocked: required.filter(task => task.status === 'blocked').length};
  }
  function update(profile, task, status, options = {}) {
    if (!STATUSES.has(status)) throw new Error('不支持这个任务状态；逾期由日期动态计算。');
    const expectedId = 'FTM-' + task.roleId + '-W' + String(task.week).padStart(2, '0') + '-D' + String(task.day).padStart(2, '0');
    if (!/^[A-E]$/.test(task.roleId) || task.taskId !== expectedId) throw new Error('任务编号与岗位、周次或星期不一致。');
    const plannedDate = dateFor(task, profile.projectStartDate);
    const now = timestamp(options.now || new Date().toISOString());
    const result = clone(profile), roleRecords = result.dailyTaskProgressByRole[task.roleId];
    const previous = roleRecords[task.taskId];
    const record = previous || {status: 'not_started', startedAt: null, completedAt: null, updatedAt: now, scheduledDate: plannedDate, deliverable: '', blockReason: ''};
    const previousStatus = record.status;
    record.status = status;
    record.updatedAt = now;
    if (status !== 'not_started' && !record.startedAt) record.startedAt = now;
    if (status === 'completed' && previousStatus !== 'completed') record.completedAt = now;
    if (options.deliverable !== undefined) {
      if (typeof options.deliverable !== 'string') throw new Error('交付记录必须为文字。');
      record.deliverable = options.deliverable;
    }
    if (options.blockReason !== undefined) {
      if (typeof options.blockReason !== 'string') throw new Error('阻塞原因必须为文字。');
      record.blockReason = options.blockReason;
    }
    roleRecords[task.taskId] = record;
    return result;
  }
  function changeStartDate(profile, startDate, changedAt = new Date().toISOString()) {
    if (new Date(dateValue(startDate)).getUTCDay() !== 1) throw new Error('项目开始日期请选择周一，以保持周一至周六任务和周日休息。');
    addDays(startDate, 83);
    timestamp(changedAt);
    const result = clone(profile);
    if (result.projectStartDate !== startDate) {
      result.planChanges.push({previousStartDate: result.projectStartDate, newStartDate: startDate, changedAt});
      result.projectStartDate = startDate;
    }
    return result;
  }

  const api = Object.freeze({addDays, today, dateFor, weekNumber, isRestDay, view, stats, update, changeStartDate});
  root.FruitTrackMember = root.FruitTrackMember || {};
  root.FruitTrackMember.Tasks = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

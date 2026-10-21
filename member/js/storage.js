(function (root) {
  'use strict';

  const INDEX_VERSION = 1;
  const PROFILE_VERSION = 2;
  const FORMAT_VERSION = 2;
  const DRAFT_VERSION = 1;
  const HISTORY_VERSION = 1;
  const HISTORY_FORMAT = 'fruittrack-member-history-backup';
  const HISTORY_PREFIX = 'fruittrack.member.history.v1.';
  const HISTORY_MAX_LENGTH = 5000000;
  const HISTORY_BACKUP_MAX_LENGTH = 10000000;
  const HISTORY_PROFILE_MAX_LENGTH = 2000000;
  const VERSION = PROFILE_VERSION;
  const DEFAULT_PROJECT_START_DATE = '2026-10-19';
  const FORMAT = 'fruittrack-member-backup';
  const ROLE_IDS = Object.freeze(['A', 'B', 'C', 'D', 'E']);
  const PREFIX = 'fruittrack.member.v1.';
  const INDEX_KEY = PREFIX + 'index';
  const ACTIVE_KEY = PREFIX + 'active';
  const ID_PATTERN = /^FTM-[A-Z0-9-]{8,80}$/;
  const DAILY_TASK_ID_PATTERN = /^FTM-([A-E])-W(0[1-9]|1[0-2])-D0[1-6]$/;
  const STATUS_VALUES = new Set(['not_started', 'in_progress', 'completed', 'blocked']);
  const DRAFT_PREFIX = 'fruittrack.member.drafts.v1.';
  const DRAFT_REF_FIELDS = ['memberId', 'roleId', 'type', 'recordId'];
  const DRAFT_VALUE_FIELDS = {
    notes: ['text'],
    exercise: ['response'],
    practice: ['status', 'deliverable'],
    'daily-task': ['deliverable', 'blockReason'],
    profile: ['displayName'],
    plan: ['projectStartDate']
  };

  class MemberStorageError extends Error {
    constructor(code, message, cause) {
      super(message);
      this.name = 'MemberStorageError';
      this.code = code;
      if (cause) this.cause = cause;
    }
  }

  function fail(code, message, cause) { throw new MemberStorageError(code, message, cause); }
  function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function hasOnlyKeys(value, allowed) { return Object.keys(value).every(key => allowed.includes(key)); }
  function hasRoleKeys(value) { return hasOnlyKeys(value, ROLE_IDS) && ROLE_IDS.every(roleId => Object.prototype.hasOwnProperty.call(value, roleId)); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function isTimestamp(value) {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  }
  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1000 && date.toISOString().slice(0, 10) === value;
  }
  function isProjectStartDate(value) {
    if (!isDate(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return date.getUTCDay() === 1 && new Date(date.getTime() + 83 * 86400000).getUTCFullYear() <= 9999;
  }
  function isTaskDate(value) {
    return isDate(value) && new Date(value + 'T00:00:00.000Z').getUTCDay() !== 0;
  }
  function validMemberId(value) { return typeof value === 'string' && ID_PATTERN.test(value); }
  function roleObject(factory) { return Object.fromEntries(ROLE_IDS.map(id => [id, factory(id)])); }
  function defaultId() {
    const cryptoApi = root.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      const values = new Uint32Array(4);
      cryptoApi.getRandomValues(values);
      return 'FTM-' + Array.from(values, value => value.toString(16).padStart(8, '0')).join('').toUpperCase();
    }
    const random = Math.random().toString(36).slice(2, 14).toUpperCase().padEnd(12, '0');
    return 'FTM-' + Date.now().toString(36).toUpperCase() + '-' + random;
  }

  function validateProfile(value) {
    const legacyKeys = ['schemaVersion', 'memberId', 'roleId', 'displayName', 'createdAt', 'updatedAt', 'learningProgressByRole', 'exerciseResultsByRole', 'practiceTasksByRole', 'notesByRole'];
    const profileKeys = isRecord(value) && value.schemaVersion === 1 ? legacyKeys : [...legacyKeys, 'projectStartDate', 'planChanges', 'dailyTaskProgressByRole'];
    if (!isRecord(value) || !hasOnlyKeys(value, profileKeys) || ![1, PROFILE_VERSION].includes(value.schemaVersion) || !validMemberId(value.memberId) ||
        !ROLE_IDS.includes(value.roleId) || typeof value.displayName !== 'string' || value.displayName.length > 40 ||
        !isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) {
      fail('INVALID_DATA', '成员档案字段无效或版本不受支持。');
    }
    const learning = value.learningProgressByRole;
    const exercises = value.exerciseResultsByRole;
    const tasks = value.practiceTasksByRole;
    const notes = value.notesByRole;
    if (!isRecord(learning) || !hasRoleKeys(learning) || !isRecord(exercises) || !hasRoleKeys(exercises) ||
        !isRecord(tasks) || !hasRoleKeys(tasks) || !isRecord(notes) || !hasRoleKeys(notes)) {
      fail('INVALID_DATA', '成员学习记录结构不完整。');
    }
    for (const roleId of ROLE_IDS) {
      if (!Array.isArray(learning[roleId]) || !learning[roleId].every(item => typeof item === 'string' && item.length <= 160)) {
        fail('INVALID_DATA', '课程进度数据无效：岗位 ' + roleId + '。');
      }
      if (!Array.isArray(exercises[roleId]) || !exercises[roleId].every(item =>
        isRecord(item) && hasOnlyKeys(item, ['exerciseId', 'response', 'savedAt']) && typeof item.exerciseId === 'string' && item.exerciseId.length > 0 && item.exerciseId.length <= 160 &&
        typeof item.response === 'string' && item.response.length <= 100000 && isTimestamp(item.savedAt))) {
        fail('INVALID_DATA', '练习结果数据无效：岗位 ' + roleId + '。');
      }
      if (!isRecord(tasks[roleId])) fail('INVALID_DATA', '实践任务数据无效：岗位 ' + roleId + '。');
      for (const [taskId, task] of Object.entries(tasks[roleId])) {
        if (taskId.length < 1 || taskId.length > 160 || !isRecord(task) || !hasOnlyKeys(task, ['status', 'deliverable', 'updatedAt']) || !STATUS_VALUES.has(task.status) ||
            typeof task.deliverable !== 'string' || task.deliverable.length > 100000 || !isTimestamp(task.updatedAt)) {
          fail('INVALID_DATA', '实践任务状态字段无效：岗位 ' + roleId + '。');
        }
      }
      if (typeof notes[roleId] !== 'string' || notes[roleId].length > 200000) {
        fail('INVALID_DATA', '个人笔记数据无效：岗位 ' + roleId + '。');
      }
    }
    const profile = value.schemaVersion === 1 ? {
      ...value,
      schemaVersion: PROFILE_VERSION,
      projectStartDate: DEFAULT_PROJECT_START_DATE,
      planChanges: [],
      dailyTaskProgressByRole: roleObject(() => ({}))
    } : value;
    if (!isProjectStartDate(profile.projectStartDate) || !Array.isArray(profile.planChanges) || !profile.planChanges.every(change =>
      isRecord(change) && hasOnlyKeys(change, ['previousStartDate', 'newStartDate', 'changedAt']) &&
      isProjectStartDate(change.previousStartDate) && isProjectStartDate(change.newStartDate) && isTimestamp(change.changedAt))) {
      fail('INVALID_DATA', '项目起始日期或计划调整记录无效。');
    }
    const dailyTasks = profile.dailyTaskProgressByRole;
    if (!isRecord(dailyTasks) || !hasRoleKeys(dailyTasks)) fail('INVALID_DATA', '每日任务记录结构不完整。');
    for (const roleId of ROLE_IDS) {
      if (!isRecord(dailyTasks[roleId])) fail('INVALID_DATA', '每日任务记录无效：岗位 ' + roleId + '。');
      for (const [taskId, task] of Object.entries(dailyTasks[roleId])) {
        const match = DAILY_TASK_ID_PATTERN.exec(taskId);
        if (!match || match[1] !== roleId || !isRecord(task) ||
            !hasOnlyKeys(task, ['status', 'startedAt', 'completedAt', 'updatedAt', 'scheduledDate', 'deliverable', 'blockReason']) ||
            !STATUS_VALUES.has(task.status) || !(task.startedAt === null || isTimestamp(task.startedAt)) ||
            !(task.completedAt === null || isTimestamp(task.completedAt)) || !isTimestamp(task.updatedAt) || !isTaskDate(task.scheduledDate) ||
            (task.status !== 'not_started' && task.startedAt === null) || (task.status === 'completed' && task.completedAt === null) ||
            typeof task.deliverable !== 'string' || task.deliverable.length > 100000 ||
            typeof task.blockReason !== 'string' || task.blockReason.length > 100000) {
          fail('INVALID_DATA', '每日任务状态字段无效：岗位 ' + roleId + '。');
        }
      }
    }
    return clone(profile);
  }

  function hasDraftFields(value, fields) {
    return isRecord(value) && Reflect.ownKeys(value).length === fields.length &&
      fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
  }

  function validateDraftRef(ref) {
    if (!hasDraftFields(ref, DRAFT_REF_FIELDS) || !validMemberId(ref.memberId) || !ROLE_IDS.includes(ref.roleId) ||
        typeof ref.type !== 'string' || !Object.prototype.hasOwnProperty.call(DRAFT_VALUE_FIELDS, ref.type) ||
        typeof ref.recordId !== 'string' || !/^[A-Za-z0-9-]{1,160}$/.test(ref.recordId)) {
      fail('INVALID_DRAFT', '草稿的成员、岗位、类型或记录编号无效。');
    }
  }

  function draftKey(ref) {
    validateDraftRef(ref);
    return DRAFT_PREFIX + encodeURIComponent(ref.memberId) + '.' + ref.roleId + '.' + ref.type + '.' + encodeURIComponent(ref.recordId);
  }

  function validateDraftPayload(type, payload) {
    const fields = DRAFT_VALUE_FIELDS[type];
    if (!hasDraftFields(payload, ['base', 'values']) || typeof payload.base !== 'string' || payload.base.length > 600000 ||
        !hasDraftFields(payload.values, fields) || !fields.every(field =>
          typeof payload.values[field] === 'string' && payload.values[field].length <= 250000) ||
        (type === 'practice' && !STATUS_VALUES.has(payload.values.status))) {
      fail('INVALID_DRAFT', '草稿字段无效或内容超过本机草稿大小限制。');
    }
    try { JSON.parse(payload.base); }
    catch (error) { fail('INVALID_DRAFT', '草稿的正式记录快照不是有效 JSON。', error); }
    return {base: payload.base, values: Object.fromEntries(fields.map(field => [field, payload.values[field]]))};
  }

  function parseDraft(raw, ref) {
    if (typeof raw !== 'string' || raw.length > 1200000) fail('INVALID_DRAFT', '本机草稿格式无效或超过大小限制；原始数据已保留。');
    let draft;
    try { draft = JSON.parse(raw); }
    catch (error) { fail('INVALID_DRAFT', '本机草稿已损坏；原始数据已保留。', error); }
    if (!hasDraftFields(draft, ['draftVersion', ...DRAFT_REF_FIELDS, 'updatedAt', 'base', 'values']) ||
        draft.draftVersion !== DRAFT_VERSION || !DRAFT_REF_FIELDS.every(field => draft[field] === ref[field]) ||
        !isTimestamp(draft.updatedAt)) {
      fail('INVALID_DRAFT', '本机草稿版本、身份或保存时间无效；原始数据已保留。');
    }
    validateDraftPayload(ref.type, {base: draft.base, values: draft.values});
    return draft;
  }

  function historyKey(memberId) {
    if (!validMemberId(memberId)) fail('INVALID_MEMBER_ID', '学习历史的成员编号无效。');
    return HISTORY_PREFIX + memberId;
  }
  function emptyHistory(memberId) { return {historyVersion: HISTORY_VERSION, memberId, nextSequence: 1, events: [], pending: null}; }
  function validateHistoryEvent(value, memberId) {
    if (!hasDraftFields(value, ['eventId', 'sequence', 'roleId', 'kind', 'recordId', 'occurredAt', 'fromStatus', 'toStatus']) ||
        !Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.sequence >= Number.MAX_SAFE_INTEGER ||
        value.eventId !== memberId + '-H' + value.sequence || !ROLE_IDS.includes(value.roleId) ||
        typeof value.recordId !== 'string' || !value.recordId.length || value.recordId.length > 160 || !isTimestamp(value.occurredAt)) {
      fail('HISTORY_INVALID', '学习历史事件的标识、岗位或时间字段无效；原始数据未更改。');
    }
    const from = value.fromStatus, to = value.toStatus;
    const validTransition = value.kind === 'course_completed' ? from === 'not_completed' && to === 'completed' :
      value.kind === 'course_uncompleted' ? from === 'completed' && to === 'not_completed' :
      value.kind === 'exercise_submitted' ? from === null && to === 'submitted' :
      value.kind === 'task_completed' ? STATUS_VALUES.has(from) && from !== 'completed' && to === 'completed' :
      value.kind === 'task_reopened' ? from === 'completed' && STATUS_VALUES.has(to) && to !== 'completed' :
      value.kind === 'practice_saved' ? (from === null || STATUS_VALUES.has(from)) && STATUS_VALUES.has(to) : false;
    if (!validTransition) fail('HISTORY_INVALID', '学习历史事件类型与状态变化不匹配；原始数据未更改。');
    return clone(value);
  }
  function validateHistoryData(value, memberId, allowPending = true) {
    if (!hasDraftFields(value, ['historyVersion', 'memberId', 'nextSequence', 'events', 'pending']) || value.historyVersion !== HISTORY_VERSION ||
        value.memberId !== memberId || !Number.isSafeInteger(value.nextSequence) || value.nextSequence < 1 ||
        !Array.isArray(value.events) || value.events.length > 100000) fail('HISTORY_INVALID', '学习历史结构、版本或成员身份无效；原始数据未更改。');
    let previous = 0;
    for (const item of value.events) {
      validateHistoryEvent(item, memberId);
      if (item.sequence <= previous || item.sequence >= value.nextSequence) fail('HISTORY_INVALID', '学习历史事件编号重复、顺序错误或序号边界无效。');
      previous = item.sequence;
    }
    if (value.pending !== null) {
      const pending = value.pending;
      if (!allowPending || !hasDraftFields(pending, ['before', 'after', 'events']) ||
          typeof pending.before !== 'string' || typeof pending.after !== 'string' || pending.before === pending.after ||
          pending.before.length > HISTORY_PROFILE_MAX_LENGTH || pending.after.length > HISTORY_PROFILE_MAX_LENGTH ||
          !Array.isArray(pending.events) || !pending.events.length || pending.events.length > 100000) {
        fail('HISTORY_INVALID', '学习历史待确认日志无效；不能推断是否已经保存。');
      }
      const snapshots = [];
      for (const raw of [pending.before, pending.after]) {
        let profile;
        try { profile = validateProfile(JSON.parse(raw)); }
        catch (error) { fail('HISTORY_INVALID', '待确认日志的正式档案快照无法校验。', error); }
        if (profile.memberId !== memberId) fail('HISTORY_INVALID', '待确认日志中的成员身份不匹配。');
        snapshots.push(profile);
      }
      pending.events.forEach((item, index) => {
        validateHistoryEvent(item, memberId);
        if (item.sequence !== value.nextSequence + index) fail('HISTORY_INVALID', '待确认事件序号与历史记录不连续。');
      });
      if (!Number.isSafeInteger(value.nextSequence + pending.events.length)) fail('HISTORY_INVALID', '学习历史序号超过安全范围。');
      let expected;
      try { expected = historyIntents(snapshots[0], snapshots[1]); }
      catch (error) { fail('HISTORY_INVALID', '待确认日志的档案变化无法对应历史事件。', error); }
      if (expected.length !== pending.events.length || expected.some((intent, index) =>
        Object.keys(intent).some(field => intent[field] !== pending.events[index][field]))) {
        fail('HISTORY_INVALID', '待确认历史事件与正式档案前后变化不一致；没有自动认定为已完成。');
      }
    }
    return clone(value);
  }
  function historyRaw(storage, key) {
    try { const raw = storage.getItem(key); if (raw !== null && typeof raw !== 'string') throw new Error('Invalid storage value'); return raw; }
    catch (error) { fail('HISTORY_READ', '无法读取学习历史；请保留当前输入并检查浏览器存储。', error); }
  }
  function historySerialize(value) {
    const raw = JSON.stringify(value);
    if (raw.length > HISTORY_MAX_LENGTH) fail('HISTORY_SIZE', '学习历史或待确认快照超过本机 500 万字符限制；没有自动裁剪旧事件，请先导出并联系负责人处理。');
    return raw;
  }
  function parseHistoryRaw(raw, memberId) {
    if (raw === null) return emptyHistory(memberId);
    if (typeof raw !== 'string' || raw.length > HISTORY_MAX_LENGTH) fail('HISTORY_INVALID', '学习历史文件已损坏或超过大小限制；原始数据已保留。');
    try { return validateHistoryData(JSON.parse(raw), memberId); }
    catch (error) { if (error instanceof MemberStorageError) throw error; fail('HISTORY_INVALID', '学习历史 JSON 无法解析；原始数据已保留。', error); }
  }
  function readHistoryState(storage, memberId) {
    const raw = historyRaw(storage, historyKey(memberId)), stored = parseHistoryRaw(raw, memberId);
    let pendingState = 'none';
    if (stored.pending !== null) {
      const profileRaw = historyRaw(storage, PREFIX + 'profile.' + memberId);
      pendingState = profileRaw === stored.pending.before ? 'unapplied' : profileRaw === stored.pending.after ? 'applied' : 'ambiguous';
      if (pendingState === 'ambiguous') fail('HISTORY_AMBIGUOUS', '正式档案与待确认历史日志的前后快照均不一致；请停止写入并导出原始诊断数据，不能自动确定历史。');
    }
    const data = pendingState === 'applied' ? {...stored, nextSequence: stored.nextSequence + stored.pending.events.length,
      events: [...stored.events, ...stored.pending.events], pending: null} : {...stored, pending: null};
    return {raw, data: clone(data), pendingState};
  }
  function historyTransaction(storage, guard, original, operations) {
    const attempted = new Map();
    try {
      for (const operation of operations) {
        guard(operation.key);
        if (historyRaw(storage, operation.key) !== operation.before) fail('HISTORY_CONFLICT', '保存期间学习记录已变化；没有覆盖未知版本。');
        const known = attempted.get(operation.key) || new Set(); known.add(operation.after); attempted.set(operation.key, known);
        if (operation.after === null) storage.removeItem(operation.key); else storage.setItem(operation.key, operation.after);
        if (historyRaw(storage, operation.key) !== operation.after) throw new Error('History write verification failed');
      }
      const final = new Map(operations.map(operation => [operation.key, operation.after]));
      for (const [key, expected] of final) if (historyRaw(storage, key) !== expected) throw new Error('Combined history/profile final verification failed');
    } catch (error) {
      let complete = true, preserveProfile = false;
      for (const key of [...attempted.keys()]) {
        if (preserveProfile && key.startsWith(PREFIX + 'profile.')) { complete = false; continue; }
        try {
          const before = original.get(key), current = historyRaw(storage, key);
          if (current === before) continue;
          if (!attempted.get(key).has(current)) { complete = false; if (key.startsWith(HISTORY_PREFIX)) preserveProfile = true; continue; }
          guard(key);
          if (before === null) storage.removeItem(key); else storage.setItem(key, before);
          if (historyRaw(storage, key) !== before) { complete = false; if (key.startsWith(HISTORY_PREFIX)) preserveProfile = true; }
        } catch (_) { complete = false; if (key.startsWith(HISTORY_PREFIX)) preserveProfile = true; }
      }
      if (!complete) fail('HISTORY_PARTIAL', '学习记录与历史联合保存失败，无法确认已完整回滚。请保留草稿和原始日志、停止写入并联系负责人；不要清空浏览器数据。', error);
      if (error && /^WRITER_/.test(error.code || '')) throw error;
      fail('HISTORY_WRITE', '学习记录与历史保存失败；本次已写入的数据已恢复原值，未报告保存成功，请保留草稿后重试。', error);
    }
  }
  function createHistory(storage, options = {}) {
    const guard = typeof options.guard === 'function' ? options.guard : () => {};
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    function raw(memberId) { return historyRaw(storage, historyKey(memberId)); }
    function read(memberId) { return readHistoryState(storage, memberId); }
    function settle(memberId) {
      const state = read(memberId);
      if (state.pendingState === 'none') return state;
      const key = historyKey(memberId), next = historySerialize(state.data);
      historyTransaction(storage, guard, new Map([[key, state.raw]]), [{key, before: state.raw, after: next}]);
      return read(memberId);
    }
    function requireIdentity(memberId, roleId) {
      historyKey(memberId);
      if (!ROLE_IDS.includes(roleId)) fail('HISTORY_IDENTITY', '历史备份目标岗位无效。');
      const profileRaw = historyRaw(storage, PREFIX + 'profile.' + memberId);
      let profile;
      try { profile = profileRaw === null ? null : validateProfile(JSON.parse(profileRaw)); }
      catch (error) { fail('HISTORY_IDENTITY', '目标正式档案无法校验；历史没有恢复。', error); }
      if (!profile || profile.memberId !== memberId || profile.roleId !== roleId) fail('HISTORY_IDENTITY', '历史备份的目标成员或主岗位与当前正式档案不匹配。');
    }
    function exportJSON(memberId, roleId) {
      requireIdentity(memberId, roleId);
      const exportedAt = now(); if (!isTimestamp(exportedAt)) fail('HISTORY_INVALID', '历史备份导出时间无效。');
      return JSON.stringify({format: HISTORY_FORMAT, formatVersion: HISTORY_VERSION, exportedAt, roleId, history: read(memberId).data}, null, 2);
    }
    function inspectJSON(input, target = {}) {
      if (typeof input !== 'string' || input.length > HISTORY_BACKUP_MAX_LENGTH) fail('HISTORY_INVALID', '历史备份文件无效或超过 1000 万字符限制。');
      let envelope;
      try { envelope = JSON.parse(input); } catch (error) { fail('HISTORY_INVALID', '历史备份 JSON 无法解析。', error); }
      if (!hasDraftFields(envelope, ['format', 'formatVersion', 'exportedAt', 'roleId', 'history']) ||
          envelope.format !== HISTORY_FORMAT || envelope.formatVersion !== HISTORY_VERSION || !isTimestamp(envelope.exportedAt)) fail('HISTORY_INVALID', '历史备份格式或版本无效；不能作为普通个人备份导入。');
      requireIdentity(target.memberId, target.roleId);
      if (envelope.roleId !== target.roleId) fail('HISTORY_IDENTITY', '历史备份主岗位不匹配；没有跨岗位入口导入。');
      const data = validateHistoryData(envelope.history, target.memberId, false);
      historySerialize(data);
      return data;
    }
    function restoreJSON(input, target = {}) {
      const incoming = inspectJSON(input, target), current = read(target.memberId), key = historyKey(target.memberId);
      guard(key);
      if (target.expectedRaw !== current.raw) fail('HISTORY_CONFLICT', '确认后本机历史已变化；请重新预览，不会静默覆盖。');
      if (current.pendingState !== 'none') fail('HISTORY_PENDING', '本机历史尚有待确认日志；请先明确处理，再合并历史备份。');
      const merged = new Map(current.data.events.map(item => [item.eventId, item]));
      for (const item of incoming.events) {
        const existing = merged.get(item.eventId);
        if (existing && Object.keys(existing).some(field => existing[field] !== item[field])) fail('HISTORY_CONFLICT', '相同历史事件编号对应不同内容，不能自动选择或合并。');
        merged.set(item.eventId, item);
      }
      const data = {historyVersion: HISTORY_VERSION, memberId: target.memberId,
        nextSequence: Math.max(current.data.nextSequence, incoming.nextSequence), events: [...merged.values()].sort((a, b) => a.sequence - b.sequence), pending: null};
      validateHistoryData(data, target.memberId, false);
      const next = historySerialize(data);
      if (next !== current.raw) historyTransaction(storage, guard, new Map([[key, current.raw]]), [{key, before: current.raw, after: next}]);
      return read(target.memberId);
    }
    return Object.freeze({read, raw, settle, exportJSON, inspectJSON, restoreJSON});
  }
  function historyIntents(before, after) {
    const intents = [];
    const add = (roleId, kind, recordId, fromStatus, toStatus) => intents.push({roleId, kind, recordId, fromStatus, toStatus});
    for (const roleId of ROLE_IDS) {
      const oldCourses = new Set(before.learningProgressByRole[roleId]), courses = new Set(after.learningProgressByRole[roleId]);
      courses.forEach(id => { if (!oldCourses.has(id)) add(roleId, 'course_completed', id, 'not_completed', 'completed'); });
      oldCourses.forEach(id => { if (!courses.has(id)) add(roleId, 'course_uncompleted', id, 'completed', 'not_completed'); });
      const oldAnswers = before.exerciseResultsByRole[roleId], answers = after.exerciseResultsByRole[roleId];
      if (answers.length < oldAnswers.length || oldAnswers.some((item, index) => JSON.stringify(item) !== JSON.stringify(answers[index]))) {
        fail('HISTORY_DIFF', '练习历史只支持追加提交；检测到旧答案被改写或删除，未保存本次变更。请使用明确的个人 JSON 恢复流程。');
      }
      answers.slice(oldAnswers.length).forEach(item => add(roleId, 'exercise_submitted', item.exerciseId, null, 'submitted'));
      for (const [id, record] of Object.entries(after.dailyTaskProgressByRole[roleId])) {
        const previous = before.dailyTaskProgressByRole[roleId][id], from = previous ? previous.status : 'not_started';
        if (record.status === 'completed' && from !== 'completed') add(roleId, 'task_completed', id, from, 'completed');
        else if (from === 'completed' && record.status !== 'completed') add(roleId, 'task_reopened', id, 'completed', record.status);
      }
      for (const [id, record] of Object.entries(after.practiceTasksByRole[roleId])) {
        const previous = before.practiceTasksByRole[roleId][id];
        if (!previous || previous.status !== record.status || previous.deliverable !== record.deliverable) add(roleId, 'practice_saved', id, previous ? previous.status : null, record.status);
      }
    }
    return intents;
  }
  function commitHistoryProfile(storage, options, before, after, timestamp) {
    const guard = options.guard, memberId = after.memberId, history = createHistory(storage, options);
    const intents = historyIntents(before, after);
    const state = history.settle(memberId);
    if (!intents.length) return false;
    const profileKey = PREFIX + 'profile.' + memberId, key = historyKey(memberId);
    const beforeRaw = historyRaw(storage, profileKey), afterRaw = JSON.stringify(after);
    if (beforeRaw === null || JSON.stringify(validateProfile(JSON.parse(beforeRaw))) !== JSON.stringify(before)) fail('HISTORY_CONFLICT', '正式档案在保存前发生变化，未写入历史。');
    if (beforeRaw.length > HISTORY_PROFILE_MAX_LENGTH || afterRaw.length > HISTORY_PROFILE_MAX_LENGTH) fail('HISTORY_SIZE', '正式档案超过历史联合保存的单份 200 万字符限制；请先备份，系统没有裁剪或丢弃历史。');
    const events = intents.map((intent, index) => ({eventId: memberId + '-H' + (state.data.nextSequence + index), sequence: state.data.nextSequence + index,
      roleId: intent.roleId, kind: intent.kind, recordId: intent.recordId, occurredAt: timestamp, fromStatus: intent.fromStatus, toStatus: intent.toStatus}));
    const pending = {...state.data, pending: {before: beforeRaw, after: afterRaw, events}};
    validateHistoryData(pending, memberId);
    const pendingRaw = historySerialize(pending), finalRaw = historySerialize({...state.data, nextSequence: state.data.nextSequence + events.length, events: [...state.data.events, ...events]});
    historyTransaction(storage, guard, new Map([[key, state.raw], [profileKey, beforeRaw]]),
      [{key, before: state.raw, after: pendingRaw}, {key: profileKey, before: beforeRaw, after: afterRaw}, {key, before: pendingRaw, after: finalRaw}]);
    return true;
  }

  function createWriter(options = {}) {
    const locks = options.locks;
    const namespace = typeof options.namespace === 'string' ? options.namespace : '';
    let request = null, supportError = null;
    try { const candidate = locks && locks.request; if (typeof candidate === 'function') request = candidate; }
    catch (error) { supportError = error; }
    const supported = typeof request === 'function';
    const namePrefix = 'fruittrack.member.writer.v1.' + encodeURIComponent(namespace);
    let generation = 0, lease = null, capability = null, operation = null;
    let state = Object.freeze(supportError ? {status: 'error', memberId: null, error: String(supportError.message || supportError)} : {status: supported ? 'idle' : 'unsupported', memberId: null});
    function invalidate() {
      generation++;
      const previous = lease; lease = null; capability = null;
      if (previous) previous.finish();
    }
    function notify(status, memberId = state.memberId, error) {
      state = Object.freeze(error ? {status, memberId, error: String(error.message || error)} : {status, memberId});
      if (typeof options.onChange !== 'function') return;
      try { options.onChange(state); }
      catch (notificationError) {
        invalidate();
        state = Object.freeze({status: 'error', memberId, error: '写权限状态通知失败：' + String(notificationError.message || notificationError)});
      }
    }
    function validLease(memberId) { return lease && lease.generation === generation && lease.memberId === memberId; }
    function release(reason = 'suspended') { invalidate(); notify(reason); }
    function acquire(memberId) {
      if (!validMemberId(memberId)) return Promise.reject(new MemberStorageError('INVALID_MEMBER_ID', '待获取写权限的成员编号无效。'));
      if (validLease(memberId) && state.status === 'editor') return Promise.resolve(true);
      invalidate();
      const expected = generation;
      if (!supported) { notify(supportError ? 'error' : 'unsupported', memberId, supportError); return Promise.resolve(false); }
      notify('checking', memberId);
      return new Promise(resolve => {
        let settled = false;
        const settle = result => { if (!settled) { settled = true; resolve(result); } };
        if (expected !== generation) { settle(false); return; }
        try {
          const requested = request.call(locks, namePrefix + '.member.' + memberId, {mode: 'exclusive', ifAvailable: true}, lock => {
            if (expected !== generation) { settle(false); return; }
            if (!lock) { notify('readonly', memberId); settle(false); return; }
            let finish;
            const held = new Promise(done => { finish = done; });
            lease = {memberId, generation: expected, finish};
            notify('editor', memberId);
            settle(!!validLease(memberId) && expected === generation);
            return held;
          });
          Promise.resolve(requested).then(() => {
            if (expected === generation && lease && lease.generation === expected) {
              invalidate();
              notify('error', memberId, new Error('浏览器写锁意外结束，已撤销本页写权限；请保留输入并重新申请。'));
            }
            if (!settled) {
              if (expected === generation) { invalidate(); notify('error', memberId, new Error('浏览器没有返回有效写锁。')); }
              settle(false);
            }
          }, error => {
            if (expected === generation) { invalidate(); notify('error', memberId, error); }
            settle(false);
          });
        } catch (error) {
          if (expected === generation) { invalidate(); notify('error', memberId, error); }
          settle(false);
        }
      });
    }
    function assertWrite(key) {
      const structural = capability && capability.generation === generation;
      if (key === INDEX_KEY || key === ACTIVE_KEY) {
        if (!structural) fail('WRITER_STRUCTURE', '此操作需要短期索引写锁；没有修改成员索引或选择记录。');
        return;
      }
      let memberId = null;
      if (typeof key === 'string' && key.startsWith(PREFIX + 'profile.')) memberId = key.slice((PREFIX + 'profile.').length);
      else if (typeof key === 'string' && key.startsWith(HISTORY_PREFIX)) memberId = key.slice(HISTORY_PREFIX.length);
      else if (typeof key === 'string' && key.startsWith(DRAFT_PREFIX)) {
        const encoded = key.slice(DRAFT_PREFIX.length).split('.')[0];
        try { memberId = decodeURIComponent(encoded); } catch (_) { memberId = null; }
      }
      if (!validMemberId(memberId)) fail('WRITER_KEY', '此存储键不在成员写权限范围内。');
      if (!validLease(memberId) && !(structural && capability.memberIds.has(memberId))) {
        fail('WRITER_READONLY', '本页没有此成员的独占写权限；请保留输入并在可编辑标签页中保存。');
      }
    }
    async function structural(memberIds, callback) {
      if (!supported) fail('WRITER_UNSUPPORTED', '浏览器未提供安全写锁，索引操作保持只读。');
      if (!Array.isArray(memberIds) || !memberIds.every(validMemberId) || typeof callback !== 'function') {
        fail('INVALID_MEMBER_ID', '索引操作涉及的成员编号或回调无效。');
      }
      if (operation) fail('WRITER_BUSY', '本页已有索引操作，请稍后主动重试。');
      const marker = {}, expected = generation, own = lease;
      const ids = [...new Set(memberIds)].sort();
      operation = marker;
      const current = () => {
        if (expected !== generation || operation !== marker || (own && own !== lease)) fail('WRITER_CANCELLED', '写权限已释放或页面已暂停，索引操作已取消。');
      };
      async function requestMember(index) {
        current();
        if (index === ids.length) {
          capability = {generation: expected, memberIds: new Set(ids)};
          try {
            const result = callback();
            if (result && typeof result.then === 'function') fail('WRITER_ASYNC', '索引锁内只允许同步存储操作；异步操作不能持有写能力。');
            current();
            return result;
          } finally { capability = null; }
        }
        const memberId = ids[index];
        if (validLease(memberId)) return requestMember(index + 1);
        return request.call(locks, namePrefix + '.member.' + memberId, {mode: 'exclusive', ifAvailable: true}, lock => {
          current();
          if (!lock) fail('WRITER_BUSY', '相关成员正在其他标签页中编辑，未执行索引操作；请关闭编辑页后重试。');
          return requestMember(index + 1);
        });
      }
      try {
        return await request.call(locks, namePrefix + '.index', {mode: 'exclusive', ifAvailable: true}, lock => {
          current();
          if (!lock) fail('WRITER_BUSY', '其他标签页正在更新成员索引，未执行本次操作；请稍后主动重试。');
          return requestMember(0);
        });
      } finally { if (operation === marker) operation = null; }
    }
    return Object.freeze({acquire, release, cancel: () => release(), getState: () => state, assertWrite, structural});
  }

  function createDrafts(storage, options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    const guard = typeof options.guard === 'function' ? options.guard : () => {};

    function readRaw(key) {
      try { return storage.getItem(key); }
      catch (error) { fail('DRAFT_READ', '无法读取本机草稿，请保留当前输入后重试。', error); }
    }
    function validateExpectedRaw(expectedRaw) {
      if (expectedRaw !== null && typeof expectedRaw !== 'string') fail('INVALID_DRAFT', '草稿原始记录比对值无效。');
    }
    function requireCurrentRaw(key, expectedRaw) {
      const raw = readRaw(key);
      // This guards stale writes; localStorage does not provide a cross-tab atomic transaction.
      if (raw !== expectedRaw) fail('DRAFT_CONFLICT', '其他标签页中的本机草稿已变化，本页没有覆盖或删除它。');
      return raw;
    }
    function read(ref) {
      const raw = readRaw(draftKey(ref));
      if (raw === null) return {raw: null, draft: null, error: null};
      try { return {raw, draft: parseDraft(raw, ref), error: null}; }
      catch (error) { return {raw, draft: null, error}; }
    }
    function save(ref, input, expectedRaw) {
      const key = draftKey(ref);
      validateExpectedRaw(expectedRaw);
      const payload = validateDraftPayload(ref.type, input);
      const previousRaw = requireCurrentRaw(key, expectedRaw);
      if (previousRaw !== null) parseDraft(previousRaw, ref);
      const updatedAt = now();
      if (!isTimestamp(updatedAt)) fail('INVALID_DRAFT', '草稿保存时间无效。');
      const draft = {
        draftVersion: DRAFT_VERSION,
        memberId: ref.memberId,
        roleId: ref.roleId,
        type: ref.type,
        recordId: ref.recordId,
        updatedAt,
        base: payload.base,
        values: payload.values
      };
      const raw = JSON.stringify(draft);
      if (raw.length > 1200000) fail('INVALID_DRAFT', '草稿内容超过本机草稿大小限制。');
      guard(key);
      try { storage.setItem(key, raw); }
      catch (error) { fail('DRAFT_WRITE', '本机草稿保存失败，请保留当前输入并检查浏览器存储空间。', error); }
      return {raw, draft, error: null};
    }
    function remove(ref, expectedRaw) {
      const key = draftKey(ref);
      validateExpectedRaw(expectedRaw);
      if (requireCurrentRaw(key, expectedRaw) === null) return;
      guard(key);
      try {
        if (typeof storage.removeItem !== 'function') throw new Error('removeItem unavailable');
        storage.removeItem(key);
      } catch (error) { fail('DRAFT_WRITE', '本机草稿删除失败，原始草稿仍需保留。', error); }
    }

    return Object.freeze({read, save, remove});
  }

  function createRecovery(storage, options = {}) {
    const guard = typeof options.guard === 'function' ? options.guard : () => {};
    const scopeRoleId = options.roleId === undefined ? null : options.roleId;
    if (scopeRoleId !== null && !ROLE_IDS.includes(scopeRoleId)) fail('INVALID_ROLE', '恢复扫描的岗位范围无效。');
    const profilePrefix = PREFIX + 'profile.';
    const scans = new WeakMap();

    function freeze(value) {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    }
    function readRaw(key) {
      try {
        if (!storage || typeof storage.getItem !== 'function') throw new Error('getItem unavailable');
        const raw = storage.getItem(key);
        if (raw !== null && typeof raw !== 'string') throw new Error('Invalid storage value');
        return raw;
      } catch (error) { fail('RECOVERY_READ', '无法读取恢复所需的原始数据；没有改写任何成员记录，请检查浏览器存储权限后重试。', error); }
    }
    function profileKeys() {
      try {
        if (!storage || typeof storage.key !== 'function') throw new Error('Storage enumeration unavailable');
        const length = storage.length;
        if (!Number.isSafeInteger(length) || length < 0) throw new Error('Invalid storage length');
        const all = new Set();
        const result = [];
        for (let index = 0; index < length; index++) {
          const key = storage.key(index);
          if (typeof key !== 'string' || all.has(key)) throw new Error('Storage keys changed during enumeration');
          all.add(key);
          if (key.startsWith(profilePrefix)) result.push(key);
        }
        if (storage.length !== length) throw new Error('Storage length changed during enumeration');
        return result.sort();
      } catch (error) { fail('RECOVERY_READ', '无法完整扫描本入口的成员档案键；系统没有将此情况当作新成员，也没有写入记录。', error); }
    }
    function capture() {
      const keys = profileKeys();
      const entries = [{key: INDEX_KEY, raw: readRaw(INDEX_KEY)}, {key: ACTIVE_KEY, raw: readRaw(ACTIVE_KEY)},
        ...keys.map(key => ({key, raw: readRaw(key)}))];
      if (JSON.stringify(keys) !== JSON.stringify(profileKeys())) {
        fail('RECOVERY_READ', '扫描期间档案键发生变化，请重新扫描；系统没有写入记录。');
      }
      if (entries.slice(2).some(entry => entry.raw === null)) fail('RECOVERY_READ', '扫描期间成员档案消失，请重新扫描。');
      return entries;
    }
    function requireScan(scan) {
      const issued = scan && scans.get(scan);
      if (!issued) fail('RECOVERY_SCAN', '恢复预览无效，请重新执行只读扫描。');
      return issued;
    }
    function scan() {
      const entries = capture();
      const indexRaw = entries[0].raw;
      const activeRaw = entries[1].raw;
      const issues = [];
      const candidates = [];
      const invalid = [];
      const profiles = new Map();
      const embeddedIds = new Set();
      let ambiguous = false;
      const issue = (code, message, key) => issues.push(key ? {code, message, key} : {code, message});
      for (const {key, raw} of entries.slice(2)) {
        const memberId = key.slice(profilePrefix.length);
        let value;
        try {
          try { value = JSON.parse(raw); }
          catch (error) { fail('CORRUPT_PROFILE', '档案 JSON 无法解析；原始内容已保留。', error); }
          if (isRecord(value) && validMemberId(value.memberId)) {
            if (embeddedIds.has(value.memberId)) {
              ambiguous = true;
              issue('DUPLICATE_MEMBER_ID', '多个存储位置声明相同成员编号，需要人工核对，不能自动合并。', key);
            }
            embeddedIds.add(value.memberId);
            if (value.memberId !== memberId) {
              ambiguous = true;
              fail('MEMBER_ID_CONFLICT', '档案编号与存储位置不一致；需要人工核对原始数据。');
            }
          }
          if (!validMemberId(memberId)) fail('INVALID_MEMBER_ID', '档案存储键中的成员编号无效。');
          const profile = validateProfile(value);
          if (scopeRoleId !== null && profile.roleId !== scopeRoleId) {
            ambiguous = true;
            fail('ROLE_CONFLICT', '档案主岗位与当前固定入口不一致；不能跨入口合并或自动迁移。');
          }
          profiles.set(memberId, profile);
          candidates.push({memberId, roleId: profile.roleId, displayName: profile.displayName,
            createdAt: profile.createdAt, updatedAt: profile.updatedAt, schemaVersion: value.schemaVersion});
        } catch (error) {
          invalid.push({key, memberId: validMemberId(memberId) ? memberId : null,
            code: error.code || 'INVALID_DATA', message: error.message});
          issue('INVALID_PROFILE', '存在无法验证的档案；仅保留并提供原始快照，不修复其内容。', key);
        }
      }
      let index = null;
      if (indexRaw !== null) {
        try {
          const value = JSON.parse(indexRaw);
          if (isRecord(value) && Array.isArray(value.memberIds) &&
              new Set(value.memberIds).size !== value.memberIds.length) {
            ambiguous = true;
            issue('DUPLICATE_INDEX_ID', '索引存在重复成员编号，需要人工核对。', INDEX_KEY);
          }
          if (!isRecord(value) || !hasDraftFields(value, ['schemaVersion', 'memberIds']) || value.schemaVersion !== INDEX_VERSION ||
              !Array.isArray(value.memberIds) || !value.memberIds.every(validMemberId) || new Set(value.memberIds).size !== value.memberIds.length) {
            throw new Error('Invalid index structure');
          }
          index = value;
        } catch (_) { issue('CORRUPT_INDEX', '成员索引已损坏：JSON、版本或结构无效；原始索引已保留。', INDEX_KEY); }
      } else if (entries.length > 2 || activeRaw !== null) {
        issue('MISSING_INDEX', '成员索引缺失，但仍有档案或当前成员选择记录。', INDEX_KEY);
      }
      if (index) {
        for (const memberId of index.memberIds) {
          if (!profiles.has(memberId)) issue('DANGLING_INDEX', '索引指向不存在或无法验证的成员档案。', profilePrefix + memberId);
        }
        for (const memberId of profiles.keys()) {
          if (!index.memberIds.includes(memberId)) issue('ORPHAN_PROFILE', '发现未登记到索引的有效成员档案。', profilePrefix + memberId);
        }
      }
      if (activeRaw === null) {
        if (entries.length > 2 || (index && index.memberIds.length > 0)) issue('MISSING_ACTIVE', '尚未选择当前成员：成员选择记录缺失。', ACTIVE_KEY);
      } else if (!validMemberId(activeRaw) || !profiles.has(activeRaw) || !index || !index.memberIds.includes(activeRaw)) {
        issue('INVALID_ACTIVE', '当前成员选择记录无效或无法关联到有效索引与档案。', ACTIVE_KEY);
      }
      // A retained corrupt orphan remains diagnosable without trapping a repaired valid member forever.
      // When no valid member can be opened, corrupt bytes still block automatic replacement creation.
      const needed = ambiguous || issues.some(item => item.code !== 'INVALID_PROFILE') || (invalid.length > 0 && candidates.length === 0);
      const result = freeze({needed, issues, candidates, invalid, ambiguous, entries, indexRaw, activeRaw});
      const snapshot = JSON.stringify({format: 'fruittrack-index-recovery-snapshot', formatVersion: 1, scopeRoleId, entries}, null, 2);
      scans.set(result, {entries, profiles, snapshot});
      return result;
    }
    function snapshotJSON(scan) { return requireScan(scan).snapshot; }
    function repair(scan, memberId, repairOptions = {}) {
      const issued = requireScan(scan);
      if (scan.ambiguous) fail('RECOVERY_AMBIGUOUS', '存在重复成员编号或身份冲突；系统不会自动选择、合并或修复索引，请先保存原始快照并人工核对。');
      if (!validMemberId(memberId) || !issued.profiles.has(memberId)) fail('RECOVERY_CANDIDATE', '请明确选择一个已经通过校验的成员档案；没有可恢复档案时不能执行修复。');
      if (repairOptions.snapshotJSON !== issued.snapshot) fail('RECOVERY_SNAPSHOT', '未验证恢复前的原始快照文件；请先导出快照，再重新选择该文件进行核对。');
      if (JSON.stringify(capture()) !== JSON.stringify(issued.entries)) fail('RECOVERY_STALE', '扫描后的本机数据已变化；没有执行修复，请重新扫描、备份并确认。');
      const relatedIds = new Set(issued.entries.slice(2).map(entry => entry.key.slice(profilePrefix.length)).filter(validMemberId));
      if (validMemberId(scan.activeRaw)) relatedIds.add(scan.activeRaw);
      try {
        const priorIndex = JSON.parse(scan.indexRaw);
        if (isRecord(priorIndex) && Array.isArray(priorIndex.memberIds)) priorIndex.memberIds.filter(validMemberId).forEach(id => relatedIds.add(id));
      } catch (_) { /* A corrupt index contributes no reliable member identifiers. */ }
      [...relatedIds].sort().forEach(id => guard(profilePrefix + id));
      guard(INDEX_KEY);
      const index = {schemaVersion: INDEX_VERSION, memberIds: [...issued.profiles.keys()]};
      let existingIndex;
      try { existingIndex = JSON.parse(scan.indexRaw); } catch (_) { existingIndex = null; }
      // Keep an already correct index byte-for-byte, including its existing member order.
      const sameIndex = existingIndex && existingIndex.schemaVersion === INDEX_VERSION && Array.isArray(existingIndex.memberIds) &&
        existingIndex.memberIds.length === index.memberIds.length && index.memberIds.every(id => existingIndex.memberIds.includes(id)) &&
        new Set(existingIndex.memberIds).size === index.memberIds.length && hasDraftFields(existingIndex, ['schemaVersion', 'memberIds']);
      if (sameIndex) index.memberIds = [...existingIndex.memberIds];
      const changes = [{key: INDEX_KEY, before: scan.indexRaw, after: sameIndex ? scan.indexRaw : JSON.stringify(index)},
        {key: ACTIVE_KEY, before: scan.activeRaw, after: memberId}].filter(change => change.before !== change.after);
      const attempted = [];
      try {
        for (const change of changes) {
          if (readRaw(change.key) !== change.before) throw new Error('Selection changed before write');
          attempted.push(change);
          if (typeof storage.setItem !== 'function') throw new Error('setItem unavailable');
          guard(change.key);
          storage.setItem(change.key, change.after);
          if (readRaw(change.key) !== change.after) throw new Error('Recovery write verification failed');
        }
        const expected = issued.entries.map(entry => {
          const changed = changes.find(change => change.key === entry.key);
          return changed ? {key: entry.key, raw: changed.after} : entry;
        });
        if (JSON.stringify(capture()) !== JSON.stringify(expected)) throw new Error('Recovery final verification failed');
      } catch (error) {
        let rolledBack = true;
        for (const change of [...attempted].reverse()) {
          try {
            const current = readRaw(change.key);
            if (current === change.before) continue;
            // Never overwrite an unexpected value from another page. This is not a transaction.
            if (current !== change.after) { rolledBack = false; continue; }
            guard(change.key);
            if (change.before === null) {
              if (typeof storage.removeItem !== 'function') throw new Error('removeItem unavailable');
              storage.removeItem(change.key);
            } else storage.setItem(change.key, change.before);
            if (readRaw(change.key) !== change.before) rolledBack = false;
          } catch (_) { rolledBack = false; }
        }
        if (!rolledBack) fail('RECOVERY_PARTIAL', '索引恢复失败，且无法确认已完整回滚；没有改写原始档案或草稿。请保留原始快照，停止继续写入并重新扫描。', error);
        fail('RECOVERY_WRITE', '索引恢复失败；本次已尝试的索引和成员选择写入已恢复原值，原始档案与草稿未改写。请保留快照并重试。', error);
      }
      return {profile: clone(issued.profiles.get(memberId)), index: clone(index), repaired: true};
    }

    return Object.freeze({scan, snapshotJSON, repair});
  }

  function create(storage, options = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      fail('STORAGE_UNAVAILABLE', '浏览器本地存储不可用，成员记录无法保存。');
    }
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    const createId = typeof options.createId === 'function' ? options.createId : defaultId;
    const guard = typeof options.guard === 'function' ? options.guard : () => {};

    function read(key) {
      try { return storage.getItem(key); }
      catch (error) { fail('STORAGE_READ', '无法读取本机成员记录。请检查浏览器存储设置后重试。', error); }
    }
    function write(key, value) {
      guard(key);
      try { storage.setItem(key, value); }
      catch (error) { fail('STORAGE_WRITE', '本机成员记录保存失败。请检查浏览器存储设置和可用空间；页面不会将未保存内容报告为已保存。', error); }
    }
    function removeOwnKey(key) {
      guard(key);
      if (typeof storage.removeItem !== 'function') return;
      try { storage.removeItem(key); } catch (_) { /* Keep the original storage error visible. */ }
    }
    function readIndex() {
      const raw = read(INDEX_KEY);
      if (raw === null) return {schemaVersion: INDEX_VERSION, memberIds: []};
      let value;
      try { value = JSON.parse(raw); }
      catch (error) { fail('CORRUPT_INDEX', '成员档案索引已损坏；为避免覆盖，系统没有改写它。', error); }
      if (!isRecord(value) || value.schemaVersion !== INDEX_VERSION || !Array.isArray(value.memberIds) ||
          !value.memberIds.every(validMemberId) || new Set(value.memberIds).size !== value.memberIds.length) {
        fail('CORRUPT_INDEX', '成员档案索引格式无效；为避免覆盖，系统没有改写它。');
      }
      return value;
    }
    function profileKey(memberId) { return PREFIX + 'profile.' + memberId; }
    function readProfile(memberId) {
      if (!validMemberId(memberId)) fail('INVALID_MEMBER_ID', '成员编号格式无效。');
      const raw = read(profileKey(memberId));
      if (raw === null) return null;
      let value;
      try { value = JSON.parse(raw); }
      catch (error) { fail('CORRUPT_PROFILE', '成员档案数据已损坏；为避免覆盖，系统没有改写它。', error); }
      const profile = validateProfile(value);
      if (profile.memberId !== memberId) fail('CORRUPT_PROFILE', '成员档案编号与存储位置不一致；为避免覆盖，系统没有改写它。');
      return profile;
    }
    function saveIndex(index) { write(INDEX_KEY, JSON.stringify(index)); }
    function writeProfile(profile) { write(profileKey(profile.memberId), JSON.stringify(profile)); }
    function createEmptyProfile(roleId, displayName = '') {
      if (!ROLE_IDS.includes(roleId)) fail('INVALID_ROLE', '岗位编号无效，请选择 A–E。');
      if (typeof displayName !== 'string' || displayName.length > 40) fail('INVALID_DATA', '显示名称最多 40 个字符。');
      const timestamp = now();
      const profile = {
        schemaVersion: PROFILE_VERSION,
        memberId: '',
        roleId,
        displayName: displayName.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
        learningProgressByRole: roleObject(() => []),
        exerciseResultsByRole: roleObject(() => []),
        practiceTasksByRole: roleObject(() => ({})),
        notesByRole: roleObject(() => ''),
        projectStartDate: DEFAULT_PROJECT_START_DATE,
        planChanges: [],
        dailyTaskProgressByRole: roleObject(() => ({}))
      };
      return profile;
    }
    function createProfile(roleId, options = {}) {
      const index = readIndex();
      let memberId;
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = createId();
        if (validMemberId(candidate) && !index.memberIds.includes(candidate) && read(profileKey(candidate)) === null) {
          memberId = candidate; break;
        }
      }
      if (!memberId) fail('ID_GENERATION_FAILED', '无法生成唯一成员编号，请重试。');
      const profile = createEmptyProfile(roleId, options.displayName || '');
      profile.memberId = memberId;
      const key = profileKey(memberId);
      guard(key); guard(INDEX_KEY);
      writeProfile(profile);
      try { saveIndex({schemaVersion: INDEX_VERSION, memberIds: [...index.memberIds, memberId]}); }
      catch (error) { removeOwnKey(key); throw error; }
      write(ACTIVE_KEY, memberId);
      return clone(profile);
    }
    function getProfile(memberId) {
      const index = readIndex();
      if (!index.memberIds.includes(memberId)) return null;
      return readProfile(memberId);
    }
    function listProfiles() {
      const index = readIndex();
      return index.memberIds.map(id => {
        const profile = readProfile(id);
        if (!profile) fail('CORRUPT_INDEX', '成员档案索引指向不存在的数据；为避免覆盖，系统没有改写它。');
        return {memberId: profile.memberId, roleId: profile.roleId, displayName: profile.displayName, updatedAt: profile.updatedAt};
      });
    }
    function saveProfile(input, saveOptions = {}) {
      const profile = validateProfile(input);
      const index = readIndex();
      const current = index.memberIds.includes(profile.memberId) ? readProfile(profile.memberId) : null;
      if (!current) {
        fail('MEMBER_NOT_FOUND', '找不到要保存的成员档案；请重新选择或创建成员档案。');
      }
      // Compare the full validated snapshot: timestamps alone can coincide within a millisecond.
      // This is a stale-write guard, not an atomic transaction across browser processes.
      if (saveOptions.expectedProfile !== undefined) {
        const expected = validateProfile(saveOptions.expectedProfile);
        if (expected.memberId !== profile.memberId || JSON.stringify(expected) !== JSON.stringify(current)) {
          fail('STORAGE_CONFLICT', '其他标签页中的成员记录已变化；本页没有覆盖它。请先导出未保存草稿，再重新读取已保存记录。');
        }
      }
      profile.updatedAt = now();
      if (!saveOptions.trackHistory || !commitHistoryProfile(storage, {guard, now}, current, profile, profile.updatedAt)) writeProfile(profile);
      return clone(profile);
    }
    function getActiveMemberId() {
      const id = read(ACTIVE_KEY);
      if (id === null) return null;
      if (!validMemberId(id)) fail('CORRUPT_ACTIVE_PROFILE', '当前成员选择记录无效。');
      return id;
    }
    function setActiveMember(memberId) {
      if (!getProfile(memberId)) fail('MEMBER_NOT_FOUND', '找不到这个成员档案。');
      guard(profileKey(memberId));
      write(ACTIVE_KEY, memberId);
      return readProfile(memberId);
    }
    function loadActiveProfile() {
      const memberId = getActiveMemberId();
      if (!memberId) return null;
      const profile = getProfile(memberId);
      if (!profile) fail('CORRUPT_ACTIVE_PROFILE', '当前成员档案不存在；为避免覆盖，系统没有改写记录。');
      return profile;
    }
    function inspectJSON(raw) {
      if (typeof raw !== 'string' || raw.length > 5000000) fail('INVALID_JSON', '备份文件无效或超过 5 MB。');
      let envelope;
      try { envelope = JSON.parse(raw); }
      catch (error) { fail('INVALID_JSON', '无法解析这个 JSON 文件；请确认它是完整的 FruitTrack 成员备份。', error); }
      if (!isRecord(envelope) || !hasOnlyKeys(envelope, ['format', 'formatVersion', 'exportedAt', 'profile']) || envelope.format !== FORMAT) fail('INVALID_DATA', '这不是有效的 FruitTrack 成员个人备份文件。');
      if (![1, FORMAT_VERSION].includes(envelope.formatVersion)) fail('UNSUPPORTED_VERSION', '备份格式版本不受支持：' + String(envelope.formatVersion) + '。');
      if (!isTimestamp(envelope.exportedAt)) fail('INVALID_DATA', '备份导出时间无效。');
      return validateProfile(envelope.profile);
    }
    function exportJSON(memberId, exportOptions = {}) {
      // A failed write can still be rescued using the existing personal-backup format.
      const profile = exportOptions.profile === undefined ? getProfile(memberId) : validateProfile(exportOptions.profile);
      if (!profile) fail('MEMBER_NOT_FOUND', '找不到要导出的成员档案。');
      if (profile.memberId !== memberId) fail('INVALID_MEMBER_ID', '导出档案与当前成员编号不一致。');
      return JSON.stringify({format: FORMAT, formatVersion: FORMAT_VERSION, exportedAt: now(), profile}, null, 2);
    }
    function restoreJSON(raw, restoreOptions = {}) {
      const profile = inspectJSON(raw);
      guard(profileKey(profile.memberId)); guard(INDEX_KEY);
      const index = readIndex();
      const exists = index.memberIds.includes(profile.memberId);
      if (exists && restoreOptions.overwrite !== true) {
        fail('MEMBER_EXISTS', '这个 memberId 已有本機档案。请先核对身份，并明确确认覆盖后再恢复。');
      }
      if (exists && !readProfile(profile.memberId)) fail('CORRUPT_INDEX', '成员档案索引指向不存在的数据；为避免覆盖，系统没有改写它。');
      const key = profileKey(profile.memberId);
      const previousRaw = exists ? read(key) : null;
      if (!exists && read(key) !== null) fail('ORPHAN_MEMBER', '这个 memberId 已有未登记的本机数据；为避免覆盖，无法导入。');
      const previousActive = getActiveMemberId();
      if (!exists) {
        writeProfile(profile);
        try { saveIndex({schemaVersion: INDEX_VERSION, memberIds: [...index.memberIds, profile.memberId]}); }
        catch (error) { removeOwnKey(key); throw error; }
      } else {
        writeProfile(profile);
      }
      if (previousActive !== profile.memberId) {
        try { write(ACTIVE_KEY, profile.memberId); }
        catch (error) {
          try {
            if (exists && previousRaw !== null) write(key, previousRaw);
            else {
              saveIndex(index);
              removeOwnKey(key);
            }
          } catch (rollbackError) {
            fail('RESTORE_PARTIAL', '恢复时本机存储发生错误，且无法确认是否完整回滚。请不要继续覆盖数据，先保留原备份文件。', rollbackError);
          }
          throw error;
        }
      }
      return clone(profile);
    }

    return Object.freeze({
      version: VERSION,
      createProfile,
      getProfile,
      listProfiles,
      saveProfile,
      getActiveMemberId,
      setActiveMember,
      loadActiveProfile,
      exportJSON,
      inspectJSON,
      restoreJSON
    });
  }

  const api = Object.freeze({
    VERSION,
    INDEX_VERSION,
    PROFILE_VERSION,
    FORMAT_VERSION,
    DRAFT_VERSION,
    HISTORY_VERSION,
    HISTORY_FORMAT,
    FORMAT,
    ROLE_IDS,
    keys: Object.freeze({index: INDEX_KEY, active: ACTIVE_KEY, profile: memberId => PREFIX + 'profile.' + memberId}),
    create,
    createWriter,
    newMemberId: defaultId,
    isMemberId: validMemberId,
    createRecovery,
    createDrafts,
    createHistory,
    historyKey,
    draftKey,
    MemberStorageError,
    validateProfile
  });
  root.FruitTrackMember = root.FruitTrackMember || {};
  root.FruitTrackMember.Storage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

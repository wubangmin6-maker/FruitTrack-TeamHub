(function (root) {
  'use strict';

  const INDEX_VERSION = 1;
  const PROFILE_VERSION = 2;
  const FORMAT_VERSION = 2;
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

  function create(storage, options = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      fail('STORAGE_UNAVAILABLE', '浏览器本地存储不可用，成员记录无法保存。');
    }
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    const createId = typeof options.createId === 'function' ? options.createId : defaultId;

    function read(key) {
      try { return storage.getItem(key); }
      catch (error) { fail('STORAGE_READ', '无法读取本机成员记录。请检查浏览器存储设置后重试。', error); }
    }
    function write(key, value) {
      try { storage.setItem(key, value); }
      catch (error) { fail('STORAGE_WRITE', '本机成员记录保存失败。请检查浏览器存储设置和可用空间；页面不会将未保存内容报告为已保存。', error); }
    }
    function removeOwnKey(key) {
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
    function saveProfile(input) {
      const profile = validateProfile(input);
      const index = readIndex();
      if (!index.memberIds.includes(profile.memberId) || !readProfile(profile.memberId)) {
        fail('MEMBER_NOT_FOUND', '找不到要保存的成员档案；请重新选择或创建成员档案。');
      }
      profile.updatedAt = now();
      writeProfile(profile);
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
    function exportJSON(memberId) {
      const profile = getProfile(memberId);
      if (!profile) fail('MEMBER_NOT_FOUND', '找不到要导出的成员档案。');
      return JSON.stringify({format: FORMAT, formatVersion: FORMAT_VERSION, exportedAt: now(), profile}, null, 2);
    }
    function restoreJSON(raw, restoreOptions = {}) {
      const profile = inspectJSON(raw);
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
    FORMAT,
    ROLE_IDS,
    keys: Object.freeze({index: INDEX_KEY, active: ACTIVE_KEY, profile: memberId => PREFIX + 'profile.' + memberId}),
    create,
    MemberStorageError,
    validateProfile
  });
  root.FruitTrackMember = root.FruitTrackMember || {};
  root.FruitTrackMember.Storage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

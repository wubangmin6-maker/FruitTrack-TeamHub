(function (root) {
  'use strict';
  const roles = [
    {id: 'A', name: '数据集调研', short: '数据', icon: '◉', summary: '找到适合苹果检测的数据，先弄清许可、划分和质量。', focus: ['数据集来源与许可', '训练／验证／测试划分', '图像质量与类别检查']},
    {id: 'B', name: '数据标注与视频素材', short: '标注', icon: '▧', summary: '整理视频素材并检查苹果目标框与 YOLO 标签。', focus: ['图像和视频素材整理', 'YOLO 标签格式', '标注规范与质量检查']},
    {id: 'C', name: '软件测试', short: '测试', icon: '✓', summary: '用可复现的用例和人工计数验证检测结果。', focus: ['测试用例与 Bug 复现', '人工苹果计数和误差核对', '回归测试']},
    {id: 'D', name: '算法研究辅助', short: '算法', icon: '⌘', summary: '协助理解检测与跟踪流程，记录可比较的实验。', focus: ['Python 与 OpenCV 基础', 'YOLO 与 ByteTrack 原理', '实验记录与评估方法']},
    {id: 'E', name: '文档与成果交付', short: '交付', icon: '▤', summary: '把 FruitTrack 的需求、实验和结果整理成可验收材料。', focus: ['需求与验收条目', '技术文档和流程图', '周报、演示与交付']}
  ];
  const byId = Object.fromEntries(roles.map(role => [role.id, role]));
  const api = Object.freeze({
    ids: Object.freeze(roles.map(role => role.id)),
    list() { return roles.map(role => ({...role, focus: [...role.focus]})); },
    get(id) { const role = byId[id]; return role ? {...role, focus: [...role.focus]} : null; }
  });
  root.FruitTrackMember = root.FruitTrackMember || {};
  root.FruitTrackMember.Roles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

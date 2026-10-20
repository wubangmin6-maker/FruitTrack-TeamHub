(function (root, factory) {
  'use strict';
  const bundle = factory();
  if (typeof module === 'object' && module.exports) module.exports = bundle;
  root.FruitTrackMember = root.FruitTrackMember || {};
  root.FruitTrackMember.CurriculumExtensions = root.FruitTrackMember.CurriculumExtensions || {};
  root.FruitTrackMember.CurriculumExtensions.D = bundle;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const simulationNotice = '本课所有检测记录、图像尺寸、视频元数据、轨迹、代码预期输出和计算结果均为教学模拟；代码未执行，未运行 OpenCV、模型或 ByteTrack，也不代表真实 FruitTrack 项目结果。真实素材使用前须由项目负责人核对具体资产、许可版本与范围、署名要求及预定用途；网页公开不等于获准使用。';
  const rows = [
    {
      title: '用变量保存一条检测记录', aim: '认识字符串、整数与小数变量', check: '把记录字段与变量名一一对应',
      rule: 'Python 的赋值把右侧值绑定给左侧名字；字符串加引号，整数和小数不加引号。变量名应表达字段含义。',
      caution: '示例代码只是供阅读的教学片段，预期值按给定数据手算，不能写成已经运行过 Python 或检测模型。',
      scene: 'FruitTrack 模拟单帧 F-D21 有一个 apple 检测，辅助岗需把 frame_id、class_name 和 score 作为不同类型的变量记录。',
      material: '模拟记录 DET-D21：frame_id=7（零起始整数），class_name="apple"（文本），score=0.82（小数），source_id="clip-D21"。教学代码：frame_id = 7；class_name = "apple"；score = 0.82。分号在材料中用于分隔语句，抄为 Python 时每条独占一行。',
      given: 'DET-D21 的 frame_id 为 7，class_name 为 apple，score 为 0.82；需要解释三种值。',
      reasoning: ['frame_id 是可参与序号运算的整数 7。', 'class_name 是文本，Python 写为 "apple"。', 'score 是小数 0.82；变量名表达含义而不改变数值。'],
      answer: '可读的三行是 frame_id = 7、class_name = "apple"、score = 0.82。预期读取值分别为整数7、字符串apple、小数0.82；这是纸面解释，不是运行输出。',
      prompt: '模拟同伴写 frame_id = "7"、class_name = apple、score = "0.82"。指出三个类型或引用问题，并给出修订。',
      response: 'frame_id 与 score 被误写成文本，class_name 的 apple 未加引号会被当变量名。改为 frame_id = 7、class_name = "apple"、score = 0.82。',
      explanation: '变量让同一字段在后续条件和循环中被引用。区分数字与文本，才不会在比较阈值时误用字符串。',
      artifact: 'DET-D21 四字段变量卡与类型说明',
      practice: ['把四个字段写成各占一行的赋值语句。', '在旁边标注整数、字符串或小数。', '手工核对赋值与原始教学卡一致。'],
      accept: ['frame_id=7、class_name="apple"、score=0.82 的类型正确', '注明代码未执行且记录为教学模拟']
    },
    {
      title: '用列表整理同帧候选分数', aim: '认识列表顺序和零起始索引', check: '从列表位置取出指定候选',
      rule: 'Python 列表用方括号保存有序值；第一项索引为 0，len(scores) 给出项数而不是最后一个索引。',
      caution: '列表位置只表示本次记录的排列，不是跨帧苹果身份。若过滤或排序改变顺序，应保留检测 ID。',
      scene: 'FruitTrack 模拟帧 F-D22 的三个候选分数为 0.91、0.43、0.76，顺序对应检测 A、B、C。',
      material: '模拟 DET-D22：detections=[A,B,C]；scores=[0.91,0.43,0.76]；索引 0→A、1→B、2→C。可阅读代码片段 scores = [0.91, 0.43, 0.76]；third = scores[2]；count = len(scores)。所有结果为手算预期，未运行。',
      given: 'scores=[0.91,0.43,0.76]，按 A、B、C 顺序排列。',
      reasoning: ['列表有三项，因此 len(scores)=3。', 'Python 从索引 0 开始：A→0、B→1、C→2。', '第三项 scores[2] 是 0.76，不是 scores[3]。'],
      answer: '列表长度为 3，第三项索引为 2，scores[2] 的纸面预期值是 0.76。索引 3 超过有效范围 0—2；候选身份需另存 A/B/C。',
      prompt: '模拟同伴要取 B 的分数，却写 scores[2]，又把 len(scores)=3 当作最后索引。请修正两处。',
      response: 'B 对应索引 1，应取 scores[1]=0.43。长度 3 表示三项，最后有效索引是 2；scores[3] 会越界。',
      explanation: '零起始索引是后续视频帧号和 Python 容器的共同约定，但列表位置不等于稳定对象 ID。',
      artifact: 'F-D22 分数列表与索引对照卡',
      practice: ['抄写 A/B/C 与三个分数的对应表。', '标出索引 0、1、2 和列表长度。', '写出读取 B 与 C 的 Python 表达式及手算值。'],
      accept: ['B=0.43 来自 scores[1]，C=0.76 来自 scores[2]', '不把列表位置写成跨帧苹果身份']
    },
    {
      title: '用条件判断置信门槛', aim: '读懂 if 条件和布尔判断', check: '区分通过门槛与模型正确性',
      rule: '比较 score >= threshold 会得到 True 或 False；if 只决定执行哪个分支，不证明检测框是苹果。',
      caution: '阈值相等时，>= 包含边界值。不能把高分直接称作已验证正确，也不能从少量模拟值选真实部署阈值。',
      scene: 'FruitTrack 模拟筛选 F-D23 三个分数 0.62、0.50、0.49，教学门槛为 0.50。',
      material: '教学片段：threshold = 0.50；for score in [0.62, 0.50, 0.49]:；    if score >= threshold:；        keep。分号表示教学卡换行；keep 在这里是纸面动作“保留该候选”，不是可直接执行的函数。真实代码需写完整语句。',
      given: 'F-D23 分数为 0.62、0.50、0.49，条件为 score >= 0.50。',
      reasoning: ['0.62 大于 0.50，条件为 True。', '0.50 等于门槛，因 >= 条件也为 True。', '0.49 小于门槛，条件为 False。'],
      answer: '教学筛选保留 0.62 与 0.50 两个候选，拒绝 0.49。这个判断只执行阈值规则，不是人工真值或准确率结论。',
      prompt: '若同一模拟分数改用 score > 0.50，哪一项结果变化？为何不能据此宣称误检必定减少？',
      response: '等于 0.50 的候选会从保留改为拒绝，0.62 与 0.49 不变。缺少人工真值与更多样本，不能判断被拒绝的是误检还是真苹果。',
      explanation: '条件句把一条明确的规则应用到每个值。比较符号只差一个等号，边界样本就可能改变。',
      artifact: 'F-D23 三候选布尔判断与边界表',
      practice: ['写 threshold=0.50 和 >= 条件。', '逐个比较三个分数，列 True/False。', '在结果旁注明尚未验证真实类别。'],
      accept: ['保留 0.62 与 0.50，拒绝 0.49', '说明阈值筛选不等于检测正确']
    },
    {
      title: '用循环累加逐帧候选数', aim: '理解 for 每次取一个元素', check: '避免把观察次数称为唯一苹果数',
      rule: 'for 会依次访问列表中的元素；计数器可每遇到一个满足条件的检测加 1。跨帧计数和跨帧唯一目标数是不同概念。',
      caution: '同一只苹果可能出现在多个帧。各帧候选数相加只是框观察次数，不能当作视频中不同苹果的数量。',
      scene: 'FruitTrack 模拟 F-D24 的每帧已保留检测数是 [2,3,1]，学习者用循环逐项累加。',
      material: '模拟序列 frame_counts=[2,3,1]，分别对应 frame_id 0、1、2。教学片段：total = 0；for count in frame_counts:；    total = total + count。分号表示换行，缩进体为循环内语句；未实际运行 Python。',
      given: 'frame_counts=[2,3,1]，每项是该帧保留的检测框数。',
      reasoning: ['初始 total=0，访问首项 2 后 total=2。', '访问第二项 3 后 total=5。', '访问第三项 1 后 total=6。'],
      answer: '循环结束纸面预期 total=6，代表三帧检测框观察次数合计。逐帧数分别为 2、3、1；没有关联证据，不能说有 6 只不同苹果。',
      prompt: '模拟有人把 [2,3,1] 循环和 6 写成“视频里六只唯一苹果”。请改成准确指标，并说明还缺什么。',
      response: '应写三帧检测框观察次数总计 6，逐帧为 2、3、1。跨帧唯一目标需可靠关联及人工核查；检测框还可能误检或漏检。',
      explanation: '循环把重复的逐项工作写成一次规则。计数器本身不理解两个框是否属于同一目标，结论必须跟随输入定义。',
      artifact: 'F-D24 三帧累加轨迹表与计数口径',
      practice: ['写 frame_counts 和 total 初始值。', '按每次迭代列出 count 与 total。', '给最终 6 写清“框观察次数”单位。'],
      accept: ['累加轨迹为 0→2→5→6', '不把 6 写成不同苹果数']
    },
    {
      title: '把筛选规则装进简单函数', aim: '认识参数、返回值和复用', check: '用边界输入手推函数结果',
      rule: '函数把输入参数传入固定步骤并返回结果。return 产生可供后续使用的值；函数定义本身不自动处理任何帧。',
      caution: '函数只实现写下的条件。若输入含 None、字符串或无效分数，需另定验证策略，不能静默当作正常检测。',
      scene: 'FruitTrack 模拟辅助函数 keep_score(score, threshold) 为 F-D25 的三个候选做纸面布尔判断。',
      material: '模拟伪代码按 Python 行书写：def keep_score(score, threshold):\n    return score >= threshold\n测试卡：调用 keep_score(0.7,0.5)、keep_score(0.5,0.5)、keep_score(0.4,0.5)。所有输入均为数值，无真实运行结果。',
      given: 'keep_score 返回 score >= threshold；测试输入分别为 (0.7,0.5)、(0.5,0.5)、(0.4,0.5)。',
      reasoning: ['第一组 0.7≥0.5，返回 True。', '第二组 0.5≥0.5，返回 True。', '第三组 0.4≥0.5 不成立，返回 False。'],
      answer: '按函数定义手推返回 True、True、False。threshold 是每次调用的参数，不是硬编码常量；这只验证示例规则，不证明检测质量。',
      prompt: '同伴写 def keep_score(score, threshold): return score > threshold。与本课 >= 规则相比，三组里哪组结果不同？',
      response: '只有边界输入 (0.5,0.5) 不同：原规则返回 True，改为 > 后返回 False。其他两组仍为 True、False。',
      explanation: '函数减少重复抄写比较式，使所有候选采用同一门槛。练习要核对参数与边界值，避免代码看似相近但行为不同。',
      artifact: 'keep_score 教学函数与三条预期值卡',
      practice: ['抄写函数定义和缩进的 return 行。', '手算三组调用的返回布尔值。', '记录无效输入待另行设计处理。'],
      accept: ['三组结果依次 True、True、False', '指出函数未运行且无效输入未覆盖']
    },
    {
      title: '封存尚未运行的 Python 入门笔记', aim: '串联变量、列表、条件、循环和函数', check: '为每段手推结果保留输入与局限',
      rule: '阶段笔记应同时写输入卡、代码片段、逐步手推预期、检查点和未执行声明；每个字段有明确数据类型。',
      caution: '纸面预期不是执行日志。不要把分数门槛通过数或跨帧累加值写成真实模型性能或唯一苹果数。',
      scene: 'FruitTrack 模拟 clip-D26 两帧分别有分数 [0.8,0.2] 与 [0.5]，门槛 0.5；笔记要计算每帧保留数。',
      material: '阶段卡：clip-D26 的 frame0 scores=[0.8,0.2]，frame1 scores=[0.5]，threshold=0.5，规则 >=。教学函数 keep_score 如前课，逐帧使用列表循环。材料仅描述虚构检测记录，未获取视频、运行 Python 或模型。',
      given: 'clip-D26 两帧分数为 [0.8,0.2] 与 [0.5]，门槛为 0.5 且包含相等值。',
      reasoning: ['frame0 中 0.8 通过、0.2 不通过，保留数 1。', 'frame1 的 0.5 等于门槛，保留数 1。', '逐帧表为 [1,1]，观察次数总和为 2。'],
      answer: '预期表 frame0→1、frame1→1，框观察次数合计 2。这是人工按规则推演；跨帧是否同一苹果未知，也没有真实运行指标。',
      prompt: '审阅者看到笔记只写“total=2，算法完成”。要求补哪些记录才能复核且避免错误计数含义？',
      response: '补两帧原分数、门槛及 >= 规则、每帧 True/False 和 [1,1] 表，再写 total=2 是框观察次数及代码未运行。',
      explanation: '可审阅的入门笔记要让接手者从输入追到每步预期。写清未执行状态，避免把教学推演误读成软件测试报告。',
      artifact: 'W02 D岗 Python 手推笔记 v0.2',
      practice: ['建 input、snippets、trace、limits 四分区。', '按帧列分数与保留判断并累计。', '附变量类型、列表索引和未执行说明。'],
      accept: ['逐帧 [1,1] 与合计 2 可复核', '合计被称为观察次数且标明未运行']
    },
    {
      title: '读懂 OpenCV 图像形状与通道', aim: '区分高度、宽度和颜色通道', check: '按 BGR 顺序解释像素三元组',
      rule: '典型 OpenCV 彩色数组 shape 为 (height,width,channels)，常见读取顺序是 BGR；灰度二维数组 shape 只有 (height,width)。',
      caution: '图像卡模拟数组结构，不能据此宣称 cv2.imread 已成功。若真实读取失败返回空值，必须先检测再访问 shape。',
      scene: 'FruitTrack 模拟 IMG-D31 数组形状 (480,640,3)，某像素教学值为 (20,80,210)，需解释位置与通道。',
      material: 'IMG-D31 模拟彩色数组 shape=(480,640,3)，像素 image[10,20]=(20,80,210)，卡中声明采用 OpenCV BGR 顺序。另有灰度卡 GRAY-D31 shape=(480,640)。下标 image[y,x]；这些是给定数组描述，并非真实图片读取。',
      given: '彩色模拟数组 shape=(480,640,3)，image[10,20]=(20,80,210)，按 BGR。',
      reasoning: ['shape 第一维 480 是高度，第二维 640 是宽度。', '第三维 3 表示三个颜色通道。', '像素下标 [10,20] 是 y=10、x=20，值 B=20、G=80、R=210。'],
      answer: 'IMG-D31 高480、宽640、3通道；image[10,20] 的 B/G/R 分别为 20/80/210。灰度卡是二维 shape=(480,640)，没有第三维。',
      prompt: '同伴把 shape=(480,640,3) 读成宽480高640，又把 (20,80,210) 按 RGB 解读。请逐项更正。',
      response: '按 OpenCV 教学卡应为高480宽640；通道顺序 BGR，即蓝20、绿80、红210。下标 [y,x] 不应与宽高顺序混淆。',
      explanation: '数组轴顺序与平面坐标写法相反：shape 先高后宽，框坐标通常先 x 后 y。明确这两个约定能减少缩放换算错误。',
      artifact: 'IMG-D31 形状、下标和 BGR 解读卡',
      practice: ['写彩色和灰度两种 shape 的维度含义。', '解释 image[10,20] 的位置和三个通道值。', '列出真实读取时检查空值的前置条件。'],
      accept: ['宽640高480、BGR 值 20/80/210 正确', '没有声称真实 OpenCV 读取']
    },
    {
      title: '手算纯缩放的正反坐标', aim: '用 sx 与 sy 变换矩形四边', check: '从缩小图反算到原图',
      rule: '纯 resize 且无补边/裁剪时，sx=newWidth/oldWidth、sy=newHeight/oldHeight；x 边乘 sx，y 边乘 sy。',
      caution: '本课用连续边界坐标，不讨论插值导致的像素内容变化。若比例不同，必须分别用 sx、sy，不能只用一个数。',
      scene: 'FruitTrack 模拟 IMG-D32 从 1200×800 直接缩到 600×400，苹果框在原图为 (200,100,500,300)。',
      material: 'IMG-D32：原图宽1200、高800；目标宽600、高400；不补边、不裁剪。原图 apple 框 xyxy=(200,100,500,300)。练习框 B=(600,200,1000,600)。采用连续边界，坐标与尺寸均为教学给定。',
      given: '原图 1200×800 直接缩为 600×400，A 框 (200,100,500,300)。',
      reasoning: ['sx=600/1200=0.5，sy=400/800=0.5。', '四边分别乘对应比例，得到 (100,50,250,150)。', '逆向除以 0.5，还原 (200,100,500,300)。'],
      answer: 'A 在新图的框为 (100,50,250,150)，宽150、高100；除以对应比例可精确还原原图。此处没有偏移项。',
      prompt: '同一缩放下，模拟框 B=(600,200,1000,600) 应变成什么？列出反算，并解释为何不能把 y 除以原图宽。',
      response: 'B 变为 (300,100,500,300)，逆向各轴除 0.5 还原 (600,200,1000,600)。y 坐标与图像高度对应，不能用宽度作比例分母。',
      explanation: '缩放是坐标系变化，不只是图片看起来更小。保存原尺寸与目标尺寸，才有依据把模型小图框送回原图复核。',
      artifact: 'IMG-D32 A/B 纯缩放坐标双向表',
      practice: ['计算 IMG-D32 的 sx 和 sy。', '把 A 与 B 的四边变换到新图。', '逐框逆向还原并标注无补边假设。'],
      accept: ['A=(100,50,250,150)、B=(300,100,500,300)', '正反坐标与轴向分母一致']
    },
    {
      title: '拆开 letterbox 的比例与补边', aim: '计算等比例缩放后的 padding', check: '先减补边再逆变换检测框',
      rule: 'letterbox 先用同一比例 r=min(targetW/sourceW,targetH/sourceH) 缩放，再在剩余方向补边；逆向须先减 padding 再除 r。',
      caution: '真实实现可能有取整、自动步长对齐和不同补边位置。本课尺寸恰好整数、上下对称，不能把教学参数当作任意实现的默认值。',
      scene: 'FruitTrack 模拟 IMG-D33 原图 800×400 放进 640×640 画布；苹果原框 (100,50,300,250)。',
      material: 'IMG-D33：source 800×400、target canvas 640×640。教学规则 r=min(640/800,640/400)=0.8，缩放图640×320；上下各补160，左右补0，不取整误差。原框 A=(100,50,300,250)；练习框 B=(400,100,600,300)。',
      given: '800×400 图等比放入 640×640，r=0.8，上下各补160；A 原框 (100,50,300,250)。',
      reasoning: ['A 缩放后四边为 (80,40,240,200)。', '补边使 y1=40+160=200、y2=200+160=360，x 不变。', '逆向先减 y padding，再四边除 0.8，还原原框。'],
      answer: 'A 在 640×640 画布的框为 (80,200,240,360)。逆向 y 减160，再除0.8，得到 (100,50,300,250)。不能把画布坐标直接除0.8。',
      prompt: '同一 letterbox 规则下，B 原框 (400,100,600,300) 在画布上的框是什么？若直接除 0.8 会错在哪里？',
      response: 'B 缩放为 (320,80,480,240)，补上下160后为 (320,240,480,400)。直接除0.8会把补边也放大，y 边错误；应先减160。',
      explanation: 'letterbox 保留图像长宽比，但改变目标在画布里的位置。每次还原都要带上本次 r 与实际 padding。',
      artifact: 'IMG-D33 letterbox 比例、padding 与 A/B 反算卡',
      practice: ['算 r、缩放后尺寸和上下 padding。', '把 A/B 两个原框映射到画布。', '按先减 padding 后除 r 的顺序反算。'],
      accept: ['A=(80,200,240,360)、B=(320,240,480,400)', '明确本课的对称补边与无取整假设']
    },
    {
      title: '比较拉伸与等比补边的形状影响', aim: '辨认非等比缩放的几何失真', check: '对同一框计算两条预处理路径',
      rule: '直接 resize 可使 sx 与 sy 不同，目标形状被拉伸；letterbox 用共同 r 保持几何比例但引入补边。',
      caution: '预处理选择可能影响模型表现，只有配套模型、数据和验证才能判断优劣；纸面几何不能证明检测准确率。',
      scene: 'FruitTrack 模拟 IMG-D34 原图 1000×500 转到 500×500：苹果框宽200、高100，两种路径结果不同。',
      material: 'IMG-D34：原图1000×500，A 原框=(100,100,300,200)。路径 S 直接 resize 到500×500，sx=0.5、sy=1；路径 L 等比 r=0.5 得500×250，上下各补125。连续边界、无舍入。比较变换后的框与宽高比。',
      given: 'A 原框 (100,100,300,200) 宽200高100；目标画布500×500，两种路径如材料。',
      reasoning: ['直接拉伸：x乘0.5、y乘1，框为 (50,100,150,200)，宽100高100。', 'letterbox：先得 (50,50,150,100)，再 y 加125，为 (50,175,150,225)。', '原框宽高比2，路径 S 变成1，路径 L 仍是2。'],
      answer: '直接 resize 得 (50,100,150,200)，宽高比1；letterbox 得 (50,175,150,225)，宽高比2。二者没有实验优劣结论，只展示几何差异。',
      prompt: '模拟同伴说“路径 S 框更方，所以苹果识别肯定更好”。依据两个变换结果说明这句话为何无证据。',
      response: '路径 S 把原来宽高比2的框拉成1，是几何变化；这不能证明模型更准确。需要固定模型与评价数据做实际测试，并正确逆变换框后比较。',
      explanation: '把目标画布大小写清楚仍不够，还要记具体变换方式。相同输入尺寸可能对应不同坐标和视觉形状。',
      artifact: 'IMG-D34 拉伸与 letterbox 几何对照页',
      practice: ['分别列出 S 的 sx/sy 与 L 的 r/padding。', '计算两个画布框和宽高比。', '写明需要实际验证的性能问题。'],
      accept: ['S=(50,100,150,200)、L=(50,175,150,225)', '不从纸面形状推断模型性能']
    },
    {
      title: '把模糊逆光当作待验证输入条件', aim: '按图像质量现象提出检查项', check: '区分观察描述与处理效果',
      rule: '质量卡可记录运动模糊、逆光、压缩块和遮挡等现象；处理方案应写前提、预期和验证方法。',
      caution: '锐化和亮度调整不能自动恢复丢失细节，还可能放大噪声。不能在未看真实图或未评估时宣称“修好了”。',
      scene: 'FruitTrack 模拟 IMG-D35 的苹果边缘有运动拖影，IMG-D36 逆光导致果实与背景对比低，需设计审查记录。',
      material: '质量卡：IMG-D35 文字描述“苹果水平拖影约8像素，边界不清”；IMG-D36 文字描述“强背光，果实区域低对比”；IMG-D37 清晰对照卡。教学方案 A 为保留原图并标问题；方案 B 为生成处理副本，记录参数、原图 ID 与后续人工/指标比较。没有真实像素和处理输出。',
      given: 'D35 拖影约8像素、D36 逆光低对比；D37 是清晰对照；没有实际图像像素。',
      reasoning: ['给 D35 记 motion-blur、D36 记 backlit-low-contrast。', '原图保持不变，若试处理应另存副本与参数。', '制定可验证条件：人工可辨认边界及同一评价集指标；现在状态为未执行。'],
      answer: 'D35/D36 分别列为模糊与逆光困难样本，D37 是对照。处理实验仅作计划，结果栏填未运行；不能说 8 像素拖影已被还原。',
      prompt: '模拟同伴看到 D35 拖影，写“调用锐化后 100% 恢复真实边界”。如何改成可检验的方案句？',
      response: '应写“保留 D35 原图，另存带参数的锐化副本，后续人工核查可辨认边界并在固定样本上比较误检漏检”；当前结果未运行，无法保证恢复。',
      explanation: '质量现象是输入条件，处理效果是待测结果。把二者分列，能避免在实验前就替算法宣布成功。',
      artifact: 'IMG-D35/D36/D37 质量现象与处理计划卡',
      practice: ['给三个图卡填写现象和对照角色。', '为可选处理写原图保护、参数与副本命名。', '列人工和指标验证方法，结果置未运行。'],
      accept: ['D35 模糊、D36 逆光、D37 对照分类清楚', '没有虚构质量恢复或真实处理输出']
    },
    {
      title: '封存图像变换手算与未决假设', aim: '整合 shape、resize、letterbox 和质量计划', check: '让审阅者反算每个画布框',
      rule: '阶段笔记要列原尺寸、目标尺寸、通道顺序、缩放参数、补边、正反坐标和未验证的图像质量影响。',
      caution: '不要把不同预处理路径的坐标混用。每个框应绑定自己的变换版本，否则即使数值看似在范围内也可能落错位置。',
      scene: 'FruitTrack 模拟审阅者拿到 IMG-D33 的画布框 (80,200,240,360)，需要从笔记还原源框并查明是否处理了图像质量。',
      material: 'W03 汇总卡：IMG-D31 shape=(480,640,3),BGR；IMG-D32 1200×800→600×400 纯缩放，A=(200,100,500,300)→(100,50,250,150)；IMG-D33 800×400→640×640，r=.8、上下各160，A→(80,200,240,360)；IMG-D35/D36 仅质量现象卡，处理未运行。',
      given: 'IMG-D33 画布框 (80,200,240,360)，r=.8，上下各160；另需列 W03 其他材料状态。',
      reasoning: ['从画布 y 两边先减160，得到 (80,40,240,200)。', '四边除 .8，得到源框 (100,50,300,250)。', '将 D31 的 BGR、D32 的纯缩放与 D35/D36 未处理状态分列。'],
      answer: 'IMG-D33 源框还原为 (100,50,300,250)。笔记分别标记 D31 为形状教学卡、D32 为纯缩放、D33 为 letterbox、D35/D36 为待验证质量条件，均未运行 OpenCV。',
      prompt: '模拟笔记把 D33 画布框直接除以 .8，声称得到 (100,250,300,450)。找出错误步骤和正确源框。',
      response: '漏掉先减上下 padding=160。先把 y 变回 40 和 200，再除 .8；正确源框为 (100,50,300,250)。',
      explanation: '可复核的变换笔记让别人把框从一个坐标系带回另一个坐标系。记录限制同样重要，尤其是质量处理尚未验证。',
      artifact: 'W03 D岗图像坐标与质量实验笔记',
      practice: ['建 shape、transform、inverse、quality 四分区。', '逐项登记 D31/D32/D33 的参数和手算框。', '把 D35/D36 的质量实验结果列标未运行。'],
      accept: ['D33 正确还原 (100,50,300,250)', '各变换路径与质量未运行状态分明']
    },
    {
      title: '读视频元数据但保留核验状态', aim: '区分 FPS、帧数和实际解码', check: '解释元数据报告可能不等于内容事实',
      rule: 'OpenCV 视频属性如 FPS、frameCount、当前位置和 seek 反馈是报告值；须与实际解码帧、索引和源时间戳核对。',
      caution: '若源是可变帧率，用 index/FPS 只能得到恒定帧率假设下的名义时间，不能保证真实显示时刻。',
      scene: 'FruitTrack 模拟 VIDEO-D41 卡报告 25fps、100 帧，设计者先写读取计划，不宣称文件实际存在或能解码。',
      material: 'VIDEO-D41 文字元数据卡：report_fps=25，report_frameCount=100，计划读 index 0、25、50、75。没有真实文件、PTS 或解码日志。模拟状态表包含 reported、decoded、verified 三列，后两列均为 pending。',
      given: 'VIDEO-D41 报告 FPS 25、帧数 100，计划索引 0、25、50、75，没有实际 PTS。',
      reasoning: ['只把 25 与 100 记为 reported 属性。', '在恒定 25fps 假设下计算名义时间 0、1、2、3 秒。', '把 decoded 和 PTS 验证列保持 pending。'],
      answer: '元数据卡可计划索引 0/25/50/75，名义时间 0/1/2/3 秒；帧数100和时间都待源视频解码及 PTS 验证，不能写成已提取四帧。',
      prompt: '同伴看到 OpenCV 报告 frameCount=100，就写“已解码100帧，最后帧必为 index99”。请更正证据状态。',
      response: '只能记“报告帧数100”；实际解码数、连续性和最后可读索引需按源文件检查。没有解码日志时，不能说已读100帧或保证 index99 可用。',
      explanation: '视频属性是规划读取的线索，不等于逐帧成功证明。把 reported 与 observed 分开，后续才能发现容器报告和实际帧不一致。',
      artifact: 'VIDEO-D41 元数据报告与待核索引表',
      practice: ['建立报告 FPS、报告帧数与实际解码列。', '列四个计划索引及名义秒数。', '把实际 PTS 和可解码性标 pending。'],
      accept: ['名义时间 0/1/2/3 秒正确且带假设', '不把报告帧数写成实际解码结果']
    },
    {
      title: '检查顺序帧的缺口与重复', aim: '用索引序列识别异常', check: '区分缺帧、重复和确认空画面',
      rule: '读帧清单要记录目标索引、返回状态、实际索引/时间戳和帧文件；缺帧不等于画面内无苹果。',
      caution: 'seek 到某位置后的报告可能与实际解码帧不同。出现跳号或重复时需要核对源时间戳与内容指纹，不能只凭名称认定。',
      scene: 'FruitTrack 模拟 VIDEO-D42 计划读取索引 0—4，返回卡只有 0、1、3、3、4，需要列出缺口和重复。',
      material: 'VIDEO-D42 教学返回卡按读取顺序为：记录1 index0/fingerprint A；记录2 index1/B；记录3 index3/C；记录4 index3/C；记录5 index4/D。目标序列为0、1、2、3、4。所有指纹与索引均为文字给定，未实际运行 OpenCV。',
      given: '计划索引 0、1、2、3、4；返回为 0、1、3、3、4，其中两个 3 的指纹同为 C。',
      reasoning: ['目标集合减去返回唯一集合，缺索引 2。', '返回 index3 两次且模拟指纹均 C，记录重复。', '唯一覆盖是 {0,1,3,4}，即 4/5 个目标索引。'],
      answer: '缺 index2，index3 重复一份；唯一索引覆盖 4/5。index2 状态是缺失/读取异常，不是确认无苹果，也不能编造该帧检测数0。',
      prompt: '模拟同伴按五条返回记录数文件，报告“5/5 完整”，并给 index2 填 count=0。指出两个错误。',
      response: '唯一覆盖只有4/5，index3重复不能补 index2 缺口。index2 未读到，苹果数未知，不能填确认空帧的 count=0。',
      explanation: '完整性按目标索引而不是返回记录数量计算。异常保留在表中，才不会污染后续逐帧计数或时间分析。',
      artifact: 'VIDEO-D42 缺口、重复与未知计数表',
      practice: ['列目标索引与返回卡对照。', '算唯一索引覆盖并标缺口与重复。', '为 index2 写 unknown 而非 0。'],
      accept: ['覆盖 4/5、缺2、重复3 结论正确', '缺帧计数保持未知']
    },
    {
      title: '分清帧索引和播放时间戳', aim: '认识恒定与可变帧率条件', check: '避免用 FPS 报告替代 PTS',
      rule: 'frameIndex 标明解码序列位置；PTS/显示时间来自视频时间信息。只有在明确恒定帧率条件下，i/fps 才是可靠的规则换算。',
      caution: 'OpenCV 的 POS_MSEC、POS_FRAMES 等定位或 seek 属性也需要与解码所得源时间核对，尤其在 VFR 或关键帧定位情况下。',
      scene: 'FruitTrack 模拟 VIDEO-D43 的索引 0、1、2 具有给定显示时刻 0、0.04、0.12 秒，报告 FPS 却是 25。',
      material: 'VIDEO-D43 教学 PTS 卡：index0→0.00s、index1→0.04s、index2→0.12s；容器报告 FPS=25。若盲用 index/25，会算 0.00、0.04、0.08s。卡片特意表示非均匀间隔，无真实源文件或 OpenCV 读取。',
      given: 'index 0、1、2 的给定 PTS 是 0、0.04、0.12 秒，报告 FPS=25。',
      reasoning: ['按报告 FPS 的名义公式算 index2/25=0.08 秒。', '读给定 PTS，index2 实际卡值为 0.12 秒。', '差为 0.04 秒，故此卡不能按恒定间隔解释 index2 时间。'],
      answer: 'index2 的名义时间 0.08 秒，给定 PTS 0.12 秒，二者相差 0.04 秒。记录应保留两列，展示 VFR 式非均匀间隔，不能把 0.08 称为真实时间。',
      prompt: '同伴只看 VIDEO-D43 的 25fps 报告，把 index2 的时间覆盖为 0.08 秒。用教学 PTS 纠正并解释风险。',
      response: '保留给定 PTS 0.12 秒，0.08 秒仅是恒定25fps的名义值。覆盖 PTS 会把帧定位提前 0.04 秒，后续标签对时可能错位。',
      explanation: '索引与时间是两个相关但不同的坐标。视频节奏不均匀时，前两帧看似符合公式，也不能保证后续每帧都符合。',
      artifact: 'VIDEO-D43 索引、名义秒数和 PTS 差异卡',
      practice: ['列三个索引及报告 FPS。', '计算各自名义时间并抄给定 PTS。', '标出 index2 的 0.04 秒差异和待源验证状态。'],
      accept: ['index2 名义0.08、给定PTS0.12、差0.04', '时间列注明模拟和恒定帧率假设']
    },
    {
      title: '用关联表解释轨迹片段', aim: '按教学匹配规则延续局部 tracklet', check: '识别断裂、误关联与 ID 切换风险',
      rule: '跟踪把相邻帧检测关联成 tracklet；ID 只在某片段某次运行里命名该轨迹片段，不是苹果的永久身份。',
      caution: '遮挡、漏检或相似目标交错可能造成轨迹断裂与 ID 切换。简单中心距离只是教学规则，并非 ByteTrack 完整算法。',
      scene: 'FruitTrack 模拟 clip-D44/run-R1 中 T1 上帧中心 (10,10)，当前高分 A 在 (12,10)，低分 B 在 (50,10)。',
      material: '教学关联卡：clip=clip-D44、run=R1；前帧 T1中心(10,10)。当前 A中心(12,10),score0.9；B中心(50,10),score0.3。简化规则：先处理高分≥0.6；仅距离≤5延续；低分0.1—0.6只尝试剩余轨迹，不以低分新建轨迹。',
      given: 'T1=(10,10)，A=(12,10)/0.9，B=(50,10)/0.3；简化距离门槛5。',
      reasoning: ['A 为高分，距 T1 为2，满足门槛。', '先配 T1→A；T1 不再参与低分阶段。', 'B 距原 T1 为40，且本规则不为低分新建轨迹。'],
      answer: '教学关联为 T1→A；B 未关联。T1 只表示 clip-D44/run-R1 的轨迹片段，不是跨视频或跨运行的永久苹果编号。',
      prompt: '下一次模拟运行 R2 恰好也生成 T1。能否断言它与 R1 的 T1 是同一只苹果？为什么？',
      response: '不能。轨迹 ID 的命名范围受片段和运行限定，R1/T1 与 R2/T1 可指不同 tracklet；即使同片段也可能断裂或换 ID，需要另证身份。',
      explanation: '关联有助于分析相邻帧的连续性，但每个 ID 是算法给的局部标签。用它做长期唯一计数前必须验证身份错误。',
      artifact: 'clip-D44/run-R1 局部关联与 ID 范围表',
      practice: ['写 clipId、runId、trackletId 三字段。', '按距离门槛计算 T1 到 A/B。', '把 B 的未关联与 ID 有效范围写入限制栏。'],
      accept: ['T1→A，B 未关联的手算正确', '明确 ID 限于片段/运行且可断裂换号']
    },
    {
      title: '比较逐帧数与轨迹数的局限', aim: '计算两种明确口径的数量', check: '避免将轨迹数宣称为真实唯一果实数',
      rule: '逐帧检测数是该帧框数；tracklet 集合大小是本片段本次运行出现的轨迹编号数。两者都不自动等于真实唯一苹果数。',
      caution: '同一苹果在遮挡后可能得到新 ID，两个苹果交错也可能 ID 交换；ByteTrack 关联并不能独自证明无重复或无漏计。',
      scene: 'FruitTrack 模拟 clip-D45/run-R1 的三帧检测数为 2、2、1，轨迹名出现 T1、T2、T3，其中 T3 可能是 T1 断裂重建。',
      material: '教学序列：frame0 有 T1、T2；frame1 有 T1、T2；frame2 只有 T3。给定事件卡写“frame1→frame2 发生遮挡，T3 可能是 T1 重现，也可能是另一苹果，无法据此确定”。所有框与关联均为纸面模拟。',
      given: '三帧轨迹分别 {T1,T2}、{T1,T2}、{T3}；T3 真实身份未知。',
      reasoning: ['逐帧检测数为 2、2、1，框观察次数合计5。', '轨迹编号并集 {T1,T2,T3}，大小3。', 'T3 可能是断裂后的 T1，故不能把 3 称作真实唯一苹果数。'],
      answer: '纸面逐帧数为 2/2/1、框观察次数5、run-R1 轨迹片段编号数3。真实不同苹果数未知，需要人工真值和关联审查；这不是 ByteTrack 实测结果。',
      prompt: '同伴把 T1/T2/T3 三个 ID 直接写成“此视频准确数到3只不同苹果”。请给出可支持的说法和一个反例。',
      response: '只能说 clip-D45/run-R1 出现三个 tracklet ID。反例：T1 遮挡后被重建为 T3，则轨迹数高于真实不同苹果数；身份还需验证。',
      explanation: '清楚命名口径比给出一个漂亮数字更重要。逐帧与轨迹统计都能用，但必须说明所数对象及不确定性。',
      artifact: 'clip-D45 双口径模拟统计与身份疑点表',
      practice: ['逐帧列轨迹集合与框数。', '计算观察次数和 ID 并集。', '列 T3 身份未决及所需人工核查证据。'],
      accept: ['观察次数5、轨迹片段数3 正确', '真实唯一苹果数保持未知']
    },
    {
      title: '交付未运行的视频跟踪实验设计册', aim: '整合元数据、时序、关联和计数限制', check: '给后续验证留下可执行清单',
      rule: '设计册列输入片段、读取/PTS 核验、关联配置、真值需求、输出字段和失败处理；结果栏先标未运行。',
      caution: 'ByteTrack ID 只表示片段和运行内的 tracklet，可断裂或切换；模型和跟踪器未运行时不得报告准确唯一苹果数。',
      scene: 'FruitTrack 模拟审阅者需要看到 VIDEO-D43 的时间差、VIDEO-D42 的缺帧和 clip-D45 的身份不确定性是否影响后续实验。',
      material: 'W04 汇总卡：VIDEO-D42 目标0—4、返回0/1/3/3/4，唯一覆盖4/5；VIDEO-D43 index2 名义0.08s、给定PTS0.12s；clip-D45/run-R1 逐帧2/2/1，轨迹{T1,T2,T3}，T3身份未决。所有卡仅为教学模拟，无视频文件、模型输出或人工真值。',
      given: 'D42 缺 index2、重复3；D43 index2 名义0.08与PTS0.12；D45 有三个局部 ID 但 T3 身份未决。',
      reasoning: ['把 D42 读取异常列为先决阻塞，不给缺帧填计数0。', '把 D43 的时间差列为 PTS 核对项，不用 FPS 覆盖源时间。', '把 D45 ID 数3列为 tracklet 数，真实唯一苹果数留待真值审查。'],
      answer: '实验设计册可以审阅，但真实结果均未运行。需先验证解码、时间戳与来源，再评估关联错误和逐帧检测；目前不能宣称准确率或唯一苹果总数。',
      prompt: '模拟结论写“已用 ByteTrack 稳定跟踪3只苹果，视频无缺帧，时间戳准确”。依据三张汇总卡逐项改写。',
      response: '应写“未运行 ByteTrack；D45 仅有三个模拟 tracklet ID，身份未决；D42 缺 index2 且重复3；D43 名义时间与给定PTS相差0.04秒”。',
      explanation: '最后一日的成果是可交给后续实现者的计划和检查门槛。把异常与未知写在结论旁，能防止模拟材料被误读成真实验证。',
      artifact: 'W04 D岗未运行视频与跟踪设计册 v0.4',
      practice: ['建 sources、frame-check、time-check、association、metrics、open-issues 六分区。', '把 D42/D43/D45 三卡的已知纸面值与未知项填入。', '列真实运行前需补的许可、解码、PTS、真值与身份复核。'],
      accept: ['D42/D43/D45 数值与状态准确可追溯', 'ByteTrack 未运行且真实唯一计数未被虚构']
    }
  ];

  const lessons = rows.map((d, index) => {
    const week = 2 + Math.floor(index / 6);
    const day = index % 6 + 1;
    const taskId = 'FTM-D-W0' + week + '-D0' + day;
    const prior = index === 0 ? 'FTM-D-W01-D06' : 'FTM-D-W0' + (2 + Math.floor((index - 1) / 6)) + '-D0' + ((index - 1) % 6 + 1);
    const prerequisiteTaskIds = [prior];
    const task = {
      taskId, roleId: 'D', week, day, title: d.title,
      learningObjectives: [d.aim, d.check],
      prerequisites: ['已学过 ' + prior + ' 的入门内容；可只用纸笔或本机文本编辑器继续'],
      prerequisiteTaskIds,
      steps: ['阅读“' + d.title + '”教学材料与规则。', ...d.practice],
      estimatedMinutes: day === 6 ? 55 : 35,
      deliverable: d.artifact,
      acceptanceCriteria: d.accept,
      courseId: taskId + '-course', exerciseId: taskId + '-exercise', practiceId: taskId + '-practice'
    };
    return {
      task,
      course: {
        id: task.courseId, roleId: 'D', title: d.title, prerequisiteTaskIds,
        knowledgeStructure: [
          {title: '基本概念', points: [d.rule, d.aim]},
          {title: '风险与核对', points: [d.caution, d.check]}
        ],
        explanation: [d.rule + ' ' + d.caution, d.explanation + ' ' + d.scene],
        projectExample: d.scene + ' 本例仅是 FruitTrack 教学模拟，供手推和设计复核，不是实际项目运行记录。',
        materials: [{title: d.title + '：教学模拟卡', text: '教学模拟，以下记录和代码均未实际运行。' + d.material}],
        workedExample: {title: d.title + '手推示例', given: d.given, steps: d.reasoning, answer: d.answer},
        simulationNotice
      },
      exercise: {
        id: task.exerciseId, roleId: 'D', title: d.title + '辨析',
        prompt: d.prompt, answer: d.response, explanation: d.explanation + ' ' + d.caution,
        gradingCriteria: [d.accept[0], d.accept[1], '注明模拟范围与尚未执行的验证']
      },
      practice: {
        id: task.practiceId, roleId: 'D', title: d.title + '练习',
        steps: d.practice, deliverable: d.artifact, acceptanceCriteria: d.accept
      }
    };
  });
  return {roleId: 'D', lessons};
});

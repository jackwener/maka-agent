# QoderWork 前端布局逆向（2026-06-19）

WAWQAQ msg `109c3be3`：「逆向 QoderWork 前端布局，我要跟他的一样。我们现在这种双卡片式的不好看，
它那种单卡片式的很好看，并且它的那个卡片和边缘的距离很窄。然后它的那个左边的任务栏是可以点击一个
按钮收缩的。」

本文是对 jakevindeMac-mini 上跑的 QoderWork 0.6.2 (Electron 33.4.5) 的截屏 + 直接观察。截屏存放在
`/tmp/qoder-home-detail.png`（主页）和 `/tmp/qoder-A.png`（定时任务页）。

> ⚠️ 边界（WAWQAQ msg `246a09a9`）：只抄布局结构、信息层级、控件组合、动线、状态表达。
> 不抄吉祥物、插画角色、品牌资产、logo、任何可识别形象。

---

## 1. 窗口总体结构

QoderWork 的窗口分三个纵向区域，**没有 macOS 原生标题栏** —— traffic lights 直接嵌在内容顶部
（自绘 chrome）。

```
┌─────────────────────────────────────────────────────────────────┐
│ [● ● ●]  「内容区第一行作为 drag region」  …  [设置图标]          │ ← 32px 高，无独立背景
├─────┬───────────────────────────────────────────────────────────┤
│     │  TAB STRIP（细的导航 tab，与 sidebar 错开）                │
│  S  ├───────────────────────────────────────────────────────────┤
│  I  │                                                           │
│  D  │                                                           │
│  E  │           ← 主内容区（这里就是「单卡片」）→                │
│  B  │                                                           │
│  A  │                                                           │
│  R  │                                                           │
│     │                                                           │
└─────┴───────────────────────────────────────────────────────────┘
```

---

## 2. 左侧 sidebar（折叠态 = 默认态）

**宽度**：约 **56–60px**（icon-only，无 label）

**布局**：
- 顶部：紧贴 traffic lights，留 ~12px gap 然后第一个 icon
- 主导航项之间：**~4–6px gap**（远比 Maka 现在的 sidebar 项间距紧）
- 每个 nav item：~32×32px 触控区，里面一个 16–18px 的 icon
- 选中态：accent 蓝（`#3B82F6` 系）的圆角 pill 背景包住 icon，文字白
- 默认态：icon 是中灰
- hover：极浅灰背景方块

**已观测到的 nav 项（按顺序）**：
1. 首页（Home，chat 主页面）
2. 扩展（Extensions / plugins）
3. 专家模式（Expert mode）
4. 模型选择（Model picker）
5. 通知 / 通讯（Notifications）
6. 历史（History）
7. 定时任务（Scheduled tasks）
8. AI 资讯（AI news）

**底部**：
- 一个用户头像（jakevin 字样紧贴下方）
- 没有显式的「折叠 / 展开」按钮 —— sidebar 默认就是这个宽度
- WAWQAQ 提到的「可以点击一个按钮收缩」指的是 **展开后再收缩** 的 toggle；
  我尚未观察到展开态。**待 WAWQAQ 演示或我后续点击 hamburger** 后补充。
  假设：toggle 在 sidebar 顶部 / 或是窗口左上的一个 caret/hamburger 图标。
  展开态预期是 **216–240px**（覆盖 nav label + 同一 icon），收缩按钮在 sidebar 顶端右上角。

---

## 3. Tab strip（sidebar 右侧、内容上方）

主页面顶部有一行 tab：「全部 / Sub …」
- 高度约 36–40px
- 字号 14px
- 当前 tab：下划线 2px + 黑色字
- 其他 tab：中灰，无下划线

这条 strip 是 **位于 sidebar 右边、贴左对齐**，不是横贯整个窗口。也就是说 sidebar 与
tab strip 是并排的两列，每列各自独立。

---

## 4. 主内容区 = 单卡片 hero（这就是 WAWQAQ 要的「单卡片式」）

**结构（从上到下）**：

1. **品牌色块**：一个 ~64×64 的圆角方块，居中。我们 **不抄它的内容**（吉祥物 + 字母组合），
   只抄它的「圆角 + 软色 + 放在中心 16–24px 上方」这个空间占位。
   —— Maka 应该用 **纯文字 eyebrow** 或者一个 **抽象几何/小图标** 替代，绝不复制它的形象。
2. **大标题** h1：「不止聊天，搞定一切」
   - 字号 32–36px，font-weight 600，黑色
3. **副标题** p：「连接好工具，让你看到更多，专业代理 AI 工作流程？」
   - 字号 14–15px，中灰，单行，可换行 balance
4. **空 16–24px**
5. **单卡片 composer**（核心，必须照搬结构）：
   - 一张圆角矩形 card，宽度 **~640px**，**居中**
   - 圆角 12–14px，浅灰描边 (1px 细线)，无 shadow 或极弱 shadow
   - 卡片内 padding ~16–20px
   - 自上而下：
     - **textarea** 输入框，placeholder「您需要... ；... 我能为您做什么...」
     - **底栏 toolbar**：
       - 左侧：`[模型 chip]` `[+]` 两个内联控件
       - 右侧：mic icon、附件 icon、send button（蓝色圆形）
   - textarea 和 toolbar 之间一条极细分隔线（也可以不要分隔线，靠 spacing 区分）
6. **空 12px**
7. **「选择工具角色」**（小文本 + 下拉箭头），居中，font-size 12–13px，灰色 —— 这是一个
   可点击的下拉，弹一个 menu 选 tool/role。**这不是必须，可以延后做。**

**关键边距**：
- 卡片到 sidebar **左缘**：~100–140px（视窗宽度自适应居中，但与 sidebar 之间至少留 ~80px）
- 卡片到窗口 **右缘**：与左侧对称
- 卡片顶部到 traffic lights：~80–100px（中等留白，不是大空白）

---

## 5. 定时任务页（`/tmp/qoder-A.png`）

仅作参考，不是首页布局。但是几条规则可以复用：

1. **页眉**：左上 h1 「定时任务」+ 副标题；右上 CTA `[+ 新建定时任务]`，蓝色 fill button
2. **信息 banner**：淡蓝底，单行 prose + 右侧 link button。**这就是 COSS Alert variant=info
   的用法**（我们已经迁移了 fake-backend banner / Daily Review failure 等到 Alert，可复用）
3. **Tab + 排序**：tab strip 左对齐，排序 select 右对齐，同一条横线
4. **卡片网格**：这里确实是 2 列卡片（不是 1 列）—— 所以 **「单卡片」专指首页/聊天页，
   不是所有页面**。列表 / 配置类页面仍是网格，与我们现在结构一致。

---

## 6. 与当前 Maka 的差距清单

按「需要改 / 不需要改」分两栏：

### ✅ 需要改（按 WAWQAQ msg `109c3be3` 的要求）

| 项 | QoderWork | Maka 当前 | 改动方向 |
|---|---|---|---|
| 首页主体 | **单卡片 hero**：标题 + 副标题 + 一张 composer card | 标题 + 副标题 + **2×2 feature 卡片网格** | 删掉 4 张 feature 卡，留居中 composer 一张 |
| 左 sidebar | 56–60px icon-only（默认折叠态）| ~200px 带 label | 默认折叠 icon-only，配 toggle 按钮 |
| sidebar toggle | 有（点击展开/收缩） | 没有 | 加 toggle 按钮 |
| 边距 | 紧（cards-to-edge ~80px）| 宽 | 收紧到 ~64–80px |
| 卡片描边 | 1px 极细灰描边，无 shadow | 阴影 / 边框较重 | 改为 1px hairline + 极弱 shadow |

### ⛔ 不抄（per WAWQAQ msg `246a09a9`）

- QoderWork 那个 64×64 的吉祥物色块（绿色青蛙状）—— 我们 Maka 用纯文字 eyebrow 或抽象几何
- QoderWork logo / 品牌色
- QoderWork 任务/频道分页（之前已说过 Maka 保持混合）
- 任何识别度高的视觉元素

---

## 7. 实现切片建议（多 agent 不冲突的 lane）

| Lane | 文件 | 难度 |
|---|---|---|
| **L1: OnboardingHero 改单卡片** | `apps/desktop/src/renderer/OnboardingHero.tsx` + `styles.css` | 中 |
| L2: Composer 卡片化（包括非 onboarding 路径）| `chat-composer.tsx` 等 | 中 |
| L3: Sidebar 折叠态 + toggle button | sidebar 相关组件 + `styles.css` | 中-高 |
| L4: 全局边距收紧 token | `maka-tokens.css` + 各处 padding 调整 | 低（一次性 token 调） |
| L5: 卡片样式统一 token（border + shadow）| `maka-tokens.css` + `.maka-card*` | 低 |

建议 L1 / L3 由 yuejing 先做（已经熟悉 OnboardingHero 和 layout），L2 / L4 / L5 给
@xuan @kenji 接。

---

## 8. 仍待确认的（这次截屏没看清）

1. **Sidebar 展开态** 完整截屏 —— 当前 QoderWork 已经是 collapsed，没法直接观察展开
   状态。需要 WAWQAQ 演示一次，或我下轮点击 hamburger 试试。
2. **Sidebar collapse toggle 按钮位置** —— 上面还是下面？
3. **首页那个 64px 占位块** 在 Maka 用什么替代 —— 纯空白？还是 abstract glyph？需要 WAWQAQ 拍板。
4. **窗口 chrome**：QoderWork 是 frameless，traffic lights 嵌在自绘 toolbar。Maka 用的
   是 Electron 默认带 macOS 标题栏 —— 改这个是较大改动，先不动。

---

## 9. 截屏存档

- `/tmp/qoder-home-detail.png`（主页 `首页` 标签，单卡片 composer 清晰可见）
- `/tmp/qoder-A.png`（`定时任务` 页 = 卡片网格 + Alert info banner + tab 排序）
- `/tmp/maka-running.png`（Maka 当前状态对比图）

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

## 2. 左侧 sidebar（已观测到两态）

QoderWork 的 sidebar 有 **expanded** 和 **collapsed** 两种状态，通过 sidebar
顶部右上角的 toggle 按钮切换。

### 2.1 Expanded sidebar（从干净窗口截图确认）

**宽度**：约 **210px**

**结构（从上到下）**：
- 顶部 sidebar bar：
  - 左：搜索 icon（约 16px）
  - 右：sidebar toggle icon（看起来像「面板里有 caret」的形状） ← **就是 WAWQAQ 提到的折叠按钮**
- 主 nav 项（每项一行）：
  - `+ 新任务`（蓝字，右侧灰字快捷键 `⌘+N`）
  - `扩展`（带向下三角，展开后有缩进子项）
    - `专家套件` / `技能` / `连接器`（浅灰字，缩进 ~28px）
  - `定时任务`
  - `IM 频道`
- nav 项中间有一条「`任务` / `频道`」tab pills（任务激活，白底圆角；频道灰底）—— **我们不抄**（per WAWQAQ msg `dbd...`，Maka 保持混合）
- 草稿区：
  - "草稿" 标题
  - `@[skill:plugin-creator]`（最近一次的草稿）
- 底部：
  - 用户头像 + "jakevin / Community Plan" + 右侧齿轮设置 icon

**视觉规格**：
- sidebar 整体背景：**比主内容区稍微深一点的 off-white**（看起来像 `oklch(0.985 0 0)` 这种感觉）
- 项间距：**~4–6px**（远比 Maka 现在紧）
- 项 padding：左右 ~12px，上下 ~6px
- 字体：14px，nav item 用中等 weight；子项 13px 浅灰
- 选中态：白色背景 + 浅阴影（这个细节在 nav `任务` tab pill 上很明显）

### 2.2 Collapsed sidebar（之前 collapsed 截屏 `/tmp/qoder-A.png` 观察到）

**宽度**：约 **56–60px**（只剩 icon）

**结构**：
- 同样有顶部 toggle 按钮（点击展开）
- 主 nav 仅显示 icon（无文字 label）
- 选中态：蓝色 pill 背景包住 icon
- hover：浅灰方块

### 2.3 Toggle 按钮

- 位置：**sidebar 顶部右上角**
- 图标：看起来像「侧边栏/面板」icon，可能是 lucide-react `PanelLeft` 或 `PanelLeftClose` / `PanelLeftOpen` 的样子
- 点击切换 expanded ↔ collapsed
- 状态应该 persist（用户偏好持久化）

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

## 3.5 「双卡片」的真实含义（WAWQAQ msg `c2eaf5fd` 澄清）

> 「我并不希望用现在的这种双卡片式了，现在你能看到我们有左边的目录栏和右边的
> 聊天栏这种双卡片式，我不喜欢这种，我希望细节上都要高度学习 qoderwork 的」

「双卡片」**指的是 Maka 当前左 sidebar + 右聊天区两个面板各自独立、有明显
边界/卡片感**，不是指我们之前以为的 prompt-suggestions 6 个 chip。

QoderWork 的处理是：sidebar 和主内容区共用同一个 window background，仅靠
**浅色背景差** + **极细的隐形分隔线** 区分。整个窗口看起来像一张大画布，
sidebar 是它左侧的一块次要区域，**不是独立的卡片**。

### 改造方向（task #67 由 kenji 主刀）

- 砍掉 sidebar 自带的边框 / 阴影 / 圆角，让它直接嵌进 window background
- 砍掉主内容区的边框 / 阴影 / 圆角，同样直接嵌进 window background
- sidebar 和主内容区之间用 **1px hairline 分隔线** 即可
- sidebar 的「卡片感」改成「区域背景微调」：`background: oklch(from var(--background) calc(l - 0.015) c h)` 这种
- 不要在 sidebar 整体或主内容整体外面再套 `<Card>` / `.maka-panel` / `box-shadow` 等

> ⚠️ 仅 hero 内部那张 composer 还是要保留卡片样式 —— 那才是真正的「单卡片」

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

- `/tmp/qoder-only.png`（**首选参考**：QoderWork 主页 expanded sidebar 干净窗口截图）
- `/tmp/maka-clean.png`（**首选参考**：Maka 当前状态对比，纯窗口）
- `/tmp/qoder-home-detail.png`（主页 collapsed sidebar，老截图）
- `/tmp/qoder-A.png`（`定时任务` 页 = 卡片网格 + Alert info banner + tab 排序）

> ⚠️ 跨 agent 协作提示：上面的 `/tmp/*.png` 只存在于 jakevindeMac-mini 的本地
> 临时目录，重启后会丢。如果其他 agent 需要查看，请用 Slock attachment IDs：
> - QoderWork 主页清晰：`192efd08-6ce8-42e3-ae71-b8dd9727a8c9`
> - Maka 干净对比：`b847bc0a-bb5a-4c5d-8b24-3ba582905ac9`
> - QoderWork 定时任务页：`ac6f59b2-29ef-4b4e-be9c-c6081fcc73d6`

---

## 10. WAWQAQ 后续 ack（2026-06-19）

- msg `c2eaf5fd`：澄清「双卡片」= sidebar + 主区两个面板分卡，不是 prompt chips
- msg `a9404a67`：「不用纠结向前兼容，大砍特砍大改特改都行」 → 这是 task `#67`，
  由 **@kenji 主刀**（msg `94fe5fdd`），yuejing 让 lane 退到 token/视觉支援，
  xuan 之前在 PlanReminderPanel + token 调整
- msg `30cf5a69`：「不用纠结向前兼容」补充确认

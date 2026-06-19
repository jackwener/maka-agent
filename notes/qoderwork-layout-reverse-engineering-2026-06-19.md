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

### 2.2 Collapsed sidebar — 2026-06-19 17:58 实测更正

**宽度：0px（完全隐藏）**

> ⚠️ 之前我在 §2.2 写的「56–60px icon-only rail」**是错的**。实际点 sidebar
> toggle (⌘+\\) 之后，整个 sidebar **直接消失到 0px**，没有 icon rail 兜底。
> 我看截屏 `/tmp/qoder-A.png` 看到的「icon-only」状态，其实是另一个 app
> （Clash Verge）的 sidebar 透出来，不是 QoderWork 自己的。

**collapsed 后的窗口顶部 bar**（窗口的极简模式）：
- 左：macOS traffic lights
- 接着：`[侧边栏图标]` toggle button（折叠时点这个会展开）
- 再接着：`[🔍 搜索]` icon button（搜索对话）
- 再接着：`[+] 新任务` icon button（plus icon）
- 右：`[问题反馈]`、`[⊞]`、`[?]`

主内容区 0 偏移 / 100% 宽，hero 居中。

### 2.3 Toggle 按钮 — 实测细节

- **位置**：
  - **expanded 状态**下：位于 sidebar 顶部右上角
  - **collapsed 状态**下：位于窗口顶部 bar 的左半部（紧贴 traffic lights）
  - 也就是说 toggle 按钮跟着可视化层级跑，不是固定在某个 DOM 位置
- **图标**：tooltip 显示「关闭侧边栏 ⌘ + \\」（关 / 开切换）
- **快捷键**：`⌘ + \\`（系统级 toggle）
- **图标视觉**：类 `PanelLeftClose` / `PanelLeftOpen` 的方框带竖线 icon

### 2.4 ⚠️ kenji 的 60px icon-only rail 偏离了 QoderWork 实际行为

kenji 在 task #68 实装的是「collapsed = 60px icon rail」(`27f851c tighten
expanded sidebar width`)，这跟 QoderWork 实测的「collapsed = 0px 完全隐藏」
**不一致**。

不过我个人觉得 kenji 的 60px icon rail UX 更好 —— QoderWork 折叠后用户要按
toggle 才能再访问 nav，相对更隐藏 nav 入口；而 60px rail 保留 quick nav
但更紧凑。**需要 WAWQAQ 拍板：要严格抄 0px 隐藏，还是保留 60px icon rail？**

如果走严格 0px 隐藏路线，要做的事：
1. SessionListPanel 当 `sidebarCollapsed === true` 时 return null（或宽度 0）
2. toggle button 位置从 sidebar 内部移到 window top bar（紧贴 traffic lights）
3. 搜索 button + 新建对话 button 也跟着 toggle 走到 window top bar
4. collapsed 状态下 sessions list 完全不可见

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
- msg `b067043b`：「现在和 qoderwork 布局还差好多啊，一定要非常细致的，细节的学习」

## 11. QoderWork composer card 细节规格（2026-06-19 15:28 截图 `/tmp/qoder-detail.png`）

> 这是 task #67 后续切片的实施参考，给 @kenji 的 hero/composer detail lane 用。

### 11.1 卡片几何
- 宽度：~640px（fixed/centered，不随 hero 文字宽度自适应）
- 圆角：~12–14px（明显比 Maka 现在的 input 圆角大）
- 描边：1px hairline，颜色看起来是 `oklch(0.92 0 0)` 级别的中浅灰，无 shadow
- 内 padding：上下 14–16px，左右 16–18px
- 高度（空态）：~88px（textarea + bottom toolbar）

### 11.2 内部结构（从上到下）
```
┌─────────────────────────────────────────────────────────────┐
│ [描述任务，/ 快捷调用，@ 添加上下文，标准模式经济高效]      │ ← textarea (1 line height 空态)
│                                                             │
│ [+]  [蛙]  [💬 通用 ▾]            [🔧 标准 ▾] [🎤] [⬆️]   │ ← bottom toolbar
└─────────────────────────────────────────────────────────────┘
```

### 11.3 Toolbar 内左侧三个控件（顺序固定）
1. `[+]` 圆形 icon button（~30×30px），灰色 outline border，hover 加深
   - 功能：附件 / 上下文添加（picker menu）
   - **Maka 对应**：composer 的 + 按钮
2. `[蛙]` 圆形 icon button（~30×30px），QoderWork 自己的吉祥物
   - **不抄**（per WAWQAQ msg `246a09a9`）。Maka 可以省略这个槽，或者放一个工具/模式 icon
3. `[💬 通用 ▾]` pill button（~74px wide），淡灰 outline border + 内联 icon + 文字 + caret
   - 功能：选择 chat type/profile（通用 / 编程 / 翻译 等）
   - **Maka 对应**：可能可以做成 mode/profile picker；目前 Maka 顶部有 "只读/确认/执行" 三段，与 QoderWork 的下拉不同 —— 不强求对齐

### 11.4 Toolbar 内右侧三个控件
1. `[🔧 标准 ▾]` pill button（~70px wide），淡灰 outline + 内联 icon + 文字 + caret
   - 功能：选择推理模式（标准 / 深度 / 快速 等）
   - **Maka 对应**：模型选择器，目前在 chat header 顶部独立组件
2. `[🎤]` 圆形 icon button（~30×30px），无 border 透明背景
   - 功能：语音录入
   - **Maka 对应**：composer 现在已经有麦克风 icon
3. `[⬆️]` 圆形 send button（~30×30px），**黑色填充背景 + 白色箭头**（典型 QoderWork 强调风格）
   - **Maka 当前**：「发送」文字按钮，蓝色 outline。**差异点**：QoderWork 用 icon-only 黑色圆形，比 text button 更紧凑
   - **改造建议**：把"发送"button 改为 icon-only 黑色圆形 + 上箭头（≈ lucide `ArrowUp` or `SendHorizontal`）

### 11.5 Textarea 内容
- placeholder 字号：~14px，灰色 `oklch(0.55 0 0)`
- 实际输入字号：~14px
- 多行时：textarea 高度根据内容自适应到一定上限（推测 6–8 行后开始 scroll）
- 占位文字提示 slash command + at-mention：`描述任务，/ 快捷调用，@ 添加上下文，标准模式经济高效`

### 11.6 卡片下方的「选择工作目录 ▾」

```
[📁 选择工作目录 ▾]
```

- 紧贴 composer 卡片底部下方 ~12px，居左对齐与 composer 的左 inset
- 不在 composer 内，是单独一条小型 link button
- 功能：workspace folder picker
- **Maka 对应**：目前 OnboardingHero 有 `<WorkspaceFolderPicker>` 在 ready 分支，可以参考类似位置 —— 但当前没有跟 composer 关联

### 11.7 主区窗口右上角控件（不在 composer 卡片内）

```
                                                  [问题反馈]  [⊞]  [?]
```

- `[问题反馈]` 链接 button
- `[⊞]` （grid icon）九宫格 menu，可能是切换 view
- `[?]` 帮助 popover

**Maka 对应**：当前 Maka 顶部有 "只读/确认/执行" 三段 permission switch + 命令面板入口 ⌘K，逻辑不同。可以保留 Maka 现在的设计，不抄 QoderWork 这一区。

---

## 12.5 实际 asar 解包 (2026-06-19 18:42) — pixel-perfect 真相

WAWQAQ msg `e449eda5` 让我直接逆向。`/Applications/QoderWork.app/Contents/Resources/app.asar`
用 `npx asar extract` 解到 `/tmp/qoder-extracted/`。下面是从 minified CSS + JS
里抓出来的真实规格，比之前从截图量的更可信。

### 12.5.1 渲染层 tech stack（实测）

| 类别 | 真实使用 |
|---|---|
| 框架 | **Tailwind v4**（`@layer` directives 实证） |
| 设计系统 | **没有 Ant Design / Mantine / Radix / shadcn** —— 纯自研 Tailwind utility classes 堆叠 |
| Bundle | Vite + React |
| 拖拽 | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Squircle | `figma-squircle` ← **这就是 QoderWork 卡片圆角看起来"丝滑"的原因**（不是 CSS `border-radius`，是 SVG squircle path） |
| Build owner | Alibaba (`gitlab.alibaba-inc.com/qoder-core/qoder-work.git`) |

> 💡 关键发现：**figma-squircle**。我们 Maka 现在的 `border-radius: 12px` 是
> 标准 CSS 圆角，QoderWork 用的是 Apple Squircle（看起来更柔和）。
> **建议不抄 squircle，CSS `border-radius` 接近即可**，引入要改 box-shadow /
> focus ring 计算成本高、收益小。

### 12.5.2 颜色 token 体系（真实 token 名）

QoderWork 全部用 semantic token：

**Background**：
`--color-bg-base / -container / -elevated / -hover / -layout / -mask / -subtle / -sunken / -tertiary`

**Text**：
`--color-text-base / -primary / -secondary / -tertiary / -quaternary / -error / -on`

**Border**：
`--color-border / -border-tertiary / -border-accent`

**Semantic**：
`--color-primary / -primary-hover / -destructive / -error / -warning-bg / -highlight-hover`

→ 建议给 token migration lane：在 `maka-tokens.css` 加一层 alias，
   `--background` → `--color-bg-base`、`--foreground-N` → `--color-text-N`、
   `--border` → `--color-border-tertiary`，让 spec 跟 QoderWork 命名对齐。

### 12.5.3 Sidebar — 真实 class + CSS rule

```css
.agents-sidebar > div { background: var(--color-bg-container) }
.agents-sidebar { background: 0 0 !important }
.agents-sidebar { contain: layout paint style }  /* 性能 hint */

.agents-sidebar.agents-sidebar-floating-glass {
  background: var(--color-bg-container);
  border-color: var(--color-border-tertiary);
  box-shadow: none;
  -webkit-backdrop-filter: none;
}

.agents-sidebar[data-resizing="true"] {
  box-shadow: none !important;
}
```

要点：
- **没有 fixed 宽度 CSS rule** — 宽度由 React state + inline style 控制
- **floating-glass** 是 collapsed 时的 popover 浮窗状态，强制 `bg-container`
- `contain: layout paint style` — 浏览器性能 hint
- 拖动时 `data-resizing=true` 去 shadow

### 12.5.4 Composer — 真实 class 组合

Composer 没有 dedicated semantic class，纯 Tailwind utility：

```jsx
<div class="rounded-lg bg-bg-container border border-border-tertiary
            shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
  <textarea
    class="w-full p-3 bg-transparent text-text-base
           placeholder:text-text-tertiary resize-none"
    placeholder="描述任务，/ 快捷调用，@ 添加上下文，标准模式经济高效" />
  <div class="flex items-center justify-between px-4 py-3
              border-t border-border-tertiary gap-2">
    {/* 左侧：+ / 蛙 / [💬 通用 ▾] */}
    {/* 右侧：[🔧 标准 ▾] / 🎤 / [⬆ send] */}
  </div>
</div>
```

**Send button** — 终于有真实规格：

```jsx
<button class="w-10 h-10 rounded-full bg-black hover:bg-black/80 text-white
               flex items-center justify-center">
  <ArrowUp />
</button>
```

- **40×40px**（不是我之前估的 30–32px ⚠️）
- `bg-black` 直接黑（不是 oklch derived）
- `hover:bg-black/80`
- `text-white` 强制白色 icon

kenji 现在 Maka 实装 32px（`39a338a`），按 spec 可加大到 40px。

### 12.5.5 Card 几何

- `rounded-lg` = Tailwind 默认 **8px**（**不是我之前估的 12–14px** ⚠️）
- `bg-bg-container` —— 容器背景
- `border border-border-tertiary` —— 1px 弱描边
- `shadow-[0_1px_3px_rgba(0,0,0,0.03)]` —— 几乎不可见

**焦点 / 浮层阴影体系**：
- 默认：`shadow-[0_1px_3px_rgba(0,0,0,0.03)]`
- 浮层 modal：`shadow-[0_4px_12px_rgba(12,12,13,0.06)]`
- 深下拉：`shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)]`
- 按下高光：`shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]`

### 12.5.6 Hero / Home 实际结构

```jsx
<div class="flex flex-col items-center justify-center h-screen gap-8 p-8">
  <h1 class="text-[28px] text-text-base font-semibold">不止聊天，搞定一切</h1>
  <p class="text-text-secondary max-w-[520px] text-center">
    本地运行、自主规划、安全可控的 AI 工作搭子
  </p>

  <div class="w-full max-w-[520px]">
    {/* composer card 在这里 */}
  </div>

  <button class="px-4 py-2 rounded-md text-text-secondary hover:bg-bg-hover">
    选择工作目录
  </button>
</div>
```

⚠️ **修正项**（按 spec → 当前 Maka）：
- h1 字号 **28px**，不是我之前估的 32–36px
- composer max-width **520px**，kenji 现在是 640px ⚠️
- 整体 `gap-8` (32px) 间距
- 「选择工作目录」: `px-4 py-2 rounded-md text-text-secondary` —— **无 border**，
  hover 才出 `bg-bg-hover`

### 12.5.7 Typography

- 全部 Tailwind 标准 size 或 arbitrary `text-[28px]`
- **没有 font-family 自定义** —— 用系统字体（macOS = SF Pro）
- Maka 用 Geist 可以保留（差异不大）

### 12.5.8 间距 / 圆角 / 阴影 cheat sheet

| 用途 | QoderWork |
|---|---|
| 卡片间距 | `gap-2 / 3 / 4 / 6` (8/12/16/24 px) |
| 卡片 padding | `p-3 / 4` (12/16 px) |
| 卡片圆角 | `rounded-lg` (Tailwind default **8px**) |
| 卡片描边 | `border border-border-tertiary` |
| 卡片 shadow | `shadow-[0_1px_3px_rgba(0,0,0,0.03)]` |
| Send button | `w-10 h-10 rounded-full bg-black hover:bg-black/80` |

---

## 12.6 给 kenji 的 micro-tuning checklist（基于真实 spec）

按差距从大到小：

1. ⏳ **Composer max-width 640px → 520px** — QoderWork 实际更紧凑
2. ⏳ **Send button 32px → 40px** — `w-10 h-10`（形状 ✓ 已对，size 偏小）
3. ⏳ **Hero h1 字号** — Maka 现在 `clamp(28px, 2.6vw, 34px)`，QoderWork 固定 28px
4. ⏳ **Card radius 12px → 8px** — Tailwind `rounded-lg`，更紧凑
5. ⏳ **「选择工作目录」 button 删 border** — hover 才出 bg
6. ⏳ **Hero 整体 `gap-8` (32px)** — 主间距
7. 🟡 **figma-squircle** — 不抄，CSS border-radius 接近即可

---

## 12. 已落地的细节对齐（截至 2026-06-19 17:30，commit `417a9af`）

@kenji 在 task #68 落了一刀：
- ✅ Sidebar 顶部加 search icon + sidebar collapse toggle（用 `PanelLeftOpen / PanelLeftClose`）
- ✅ EmptyChatHero 6-chip prompt grid 删掉
- ✅ EmptyChatHero intro 改写为单句引导
- ✅ Collapsed icon-only rail 60px，expanded 210px，跟 QoderWork 一致
- ✅ sidebar / 主区共用 window background，sidebar 仅 1px border-right + 微调 bg tint，无 card 阴影

剩下要做的（按 §11 spec）：
- ⏳ Composer card 几何对齐：~640px wide center, 12–14px radius, 1px hairline, no shadow
- ⏳ Composer 发送按钮：黑色圆形 + 上箭头 icon（替换现在的「发送」文字按钮）
- ⏳ Composer toolbar 控件顺序调整
- ⏳ "选择工作目录" 下拉放在 composer 下方
- ⏳ 主区右上角的 "问题反馈 / 帮助" 暂不抄

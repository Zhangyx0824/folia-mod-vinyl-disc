# folium-compound 模组提交 · 粘贴用文案

表单地址：https://github.com/chthollyphile/folium-compound/issues/new?template=mod-submission.yml
标题：`[模组提交] 黑胶唱片 vinyl-disc`

---

## 模组 id / Mod id

```
vinyl-disc
```

## 源码仓库 / Source repository

```
https://github.com/Zhangyx0824/folia-mod-vinyl-disc
```

## 版本 / Version (tag or commit)

```
v1.7.7
```

## 模组目录 / Mod directory

```
vinyl-disc
```

## 发布渠道 / Channel

选「正式发布 / Release」

## 模组说明 / Description

```
一个歌词动画模式「黑胶唱片」：在播放界面的动画模式选择器里选中它时，播放页出现一张黑胶唱片——当前歌曲封面作碟心（占直径 72%），压纹沟槽、固定高光、转轴孔；播放时唱片匀速旋转、唱臂落下，暂停时唱臂抬起、唱片停转；歌词（曲名 / 歌手、当前句、翻译、下一句）排在唱片一侧，颜色与字体跟随当前主题与用户的歌词字号设置。切歌时宿主自动重挂载，封面随之更换；无封面时碟心回退显示歌名 / 歌手。

效果参考 QQ 音乐 / 网易云音乐的黑胶播放页。不选中该模式时完全不渲染，与内置及其他模组的歌词样式互不影响（1.1.0 修正过：早期版本用 stageLayers 常驻图层，会叠在所有模式之上）。

可调项：唱片位置（左 / 右）、大小（30%–100% 播放区高度）、旋转周期（6–60 秒）、封面占比（50%–85%）、弥散投影（关闭 / 跟随封面主色 / 主题色）、唱臂与高光开关、歌词字号、是否显示下一句。

实现：通过公开注册表 folium.registries.visualizers 注册一个动画模式（hostLayers: { background: true, subtitles: false }，歌词文本由模组自绘以避免与宿主字幕重复），全部数据来自 FoliumStageContext（lines / onLyricTime / getLineIndex / getCoverUrl / isPaused / getTheme / getDisplay / onResize / onChange）。旋转为 CSS 动画，唱臂为内联 SVG。弥散投影的主色在本地对封面做 24×24 降采样提取，不联网。
```

## 权限说明 / Permissions

```
无。mod.json 的 permissions 为空数组 []，未声明 embedOrigins，也未使用任何 experimental 接口。模组只使用动画模式注册表（visualizers）与宿主提供的上下文读取，不需要 stageLayers、playback.*、net.fetch、filesystem.data 或 platform.*；不联网、不上传用户数据、不碰宿主 DOM、不注入全局样式。唯一写入的是宿主代为保存的模式设置。
```

## 许可证 / License

```
MIT
```

## 运行截图 / Screenshot

必须**把图片直接拖进这个输入框上传**（外部链接不算，CI 只认 github.com/user-attachments 的地址）。
截图要求：Folia 播放页选中「黑胶唱片」模式、正常显示唱片与歌词；最好能带上 Folia 版本号（0.7.21）。

## 确认 / Confirmations

三项全部勾选。

---

## 提交后的流程

1. CI 自动检查并回复「格式检查通过，请等待维护者审查」，并附将要签名的文件清单。
2. 维护者审查代码与权限声明。
3. 维护者评论 `/sign <commit>` → CI 签名、复制进 folium-compound、发布到模组市场，issue 自动关闭。

## 本次提交包含的修复与新增（1.7.7）

- 翻译跟随每句歌词：多行歌词视图里每一句下方显示各自的翻译，不再只显示当前句的翻译。
- 修复唱针周围出现矩形瑕疵的问题（CSS drop-shadow 滤镜在元素框边界裁剪，改用 SVG 内部滤镜并放宽作用域）。
- 逐字歌词平滑化：已唱颜色随演唱进度在每个字内部从左到右渐变擦入（Apple Music 式扫色），不再一个字一个字硬切变色；正在演唱的字轻微放大弹跳，颜色仍取当前封面主色。
- 歌词 / 唱片距屏幕左右两侧的内边距加大到播放区宽度的 15%。

- 设置项注册到模组面板（settingsSections），自绘面板带「保存 / 恢复默认」按钮，保存后才应用，避免实时重排闪屏。
- 修复空歌词行显示「♪」占位符的问题。
- 新增「碟心圆（模拟光盘）」开关。
- 歌词间隙（含宿主报 -1 的空档）始终保留上一句歌词，直到下一句出现，不再露出空白只剩歌名 / 歌手（与常见播放器一致）。
- 「中心孔」开关控制盖在封面上的黑色转轴孔圆点。
- 歌词改为 QQ 音乐式多行视图（当前句加粗、前后多行随距离淡出），过滤歌名 / 歌手元数据行。
- 新增歌词对齐（居左 / 居中，仅歌词区内部）与频谱开关（宿主音频分析器驱动）。
- 逐字歌词：有逐字时间轴的行逐词点亮，已唱颜色取当前封面主色（本机提取，回退主题强调色）。
- 修复切歌时歌词「先小后大」的跳变；歌词字号默认缩小到约 60% 再 70%，行距加大。
- 唱臂：落针改到黑胶沟槽（参考网易云移动版），经典浅白色，玻璃质感用纯透明 + 高光 + 阴影模拟。
- 修复：歌名 / 歌手作为歌词行被误隐藏（元数据过滤只拦「歌名 - 歌手」组合行）；打开播放页设置时舞台被折叠到极小尺寸导致歌词与唱片消失（极小尺寸不重排）。
- 歌词 / 唱片距屏幕两侧边距加大到播放区宽度的 15%（含 1.7.4 的 1.5 倍调整）。
- 移除频谱功能。
- 设置面板为黑白墨色样式（浅色 / 深色主题都清晰），且不在主题变化时重建，避免模组面板闪屏。

## 本地预检结果（2026-10-21）

- `validateManifest(mod.json)` → `{ ok: true }`（用 folium-compound 的 `tools/vendor/folia-manifest.cjs`）
- 模组目录：`vinyl-disc/`，4 个文件（mod.json / client.mjs / preview.jpg / LICENSE），约 164 KB
- 提交：`f1223d0`，tag `v1.7.4`；无 `folium.sig.json`、无符号链接
- 预览图：1280×720 JPEG，126 KB（市场要求 ≤1 MB，推荐 16:9）
- `permissions: []`、`folia: >=0.7.21 <0.8.0`（本机 Folia 0.7.21 在范围内）

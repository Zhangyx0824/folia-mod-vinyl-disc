# 黑胶唱片 / vinyl-disc

一个 [Folia](https://github.com/chthollyphile/folia-major)（Folium 1 模组系统）模组：在播放界面加一张黑胶唱片——当前歌曲的封面作为碟心，播放时唱片旋转、唱臂落下，暂停时唱臂抬起、唱片停转。效果参考 QQ 音乐 / 网易云音乐的黑胶播放页。

![preview](vinyl-disc/preview.jpg)

## 功能

- **黑胶唱片**：碟面有压纹沟槽与固定高光，封面居中作碟心，中心有转轴孔。
- **播放状态联动**：播放时唱片匀速旋转、唱臂落在碟面上；暂停时唱臂抬起、唱片冻结（CSS 合成器动画，暂停零开销）。
- **切歌自动换封面**：封面由宿主提供，切歌时图层自动重挂载；无封面时碟心回退为「歌名 / 歌手」标签。
- **主题色光晕（可选）**：用当前主题色给唱片加一圈柔和辉光。
- **完整设置**：在 设置 → 模组 → 黑胶唱片 里调整——
  显示开关、位置（左 / 中 / 右）、大小、垂直偏移、封面占比、旋转周期（6–60 秒）、唱臂、高光、光晕、不透明度。

## 安装

把 `vinyl-disc/` 文件夹放进 Folia 的模组目录后重启：

```
~/Library/Application Support/Folia/mods/vinyl-disc
```

首次启用时 Folia 会弹出确认窗口（列出权限与内容指纹），确认后即可使用。唱片默认出现在播放区右侧、歌词之下。

## 实现说明

- 播放页图层来自公开注册表 `folium.registries.stageLayers`（`stageLayers` 权限），挂载点为 `player.stage.back`（背景之上、歌词之下），整层点击穿透，不挡播放器任何操作。
- 封面、暂停状态、主题色、容器尺寸都从 `FoliumStageContext` 读取（`getCoverUrl()` / `isPaused()` / `getTheme()` / `onResize()` / `onChange()`）；切歌由宿主重挂载，无需自己监听。
- 设置走 `folium.registries.settingsSections`，表单由宿主渲染、值由宿主持久化，并参与可视化配置导入导出。
- 旋转用 CSS 动画（合成器层），唱臂是一段内联 SVG 绕支点旋转；不碰宿主 DOM、不注入全局样式、不联网。

## 权限

| 权限 | 用途 |
| --- | --- |
| `stageLayers` | 把黑胶唱片图层挂到播放页 |

## 隐私

不联网、不上传任何数据，设置由宿主保存在本机。

## 更新日志

- **1.0.0**：首个版本。

## 许可证

[MIT](vinyl-disc/LICENSE)

# folium-compound 模组提交 issue 内容（复制到表单对应字段）

- **模组 id**: `vinyl-disc`
- **源码仓库**: https://github.com/Zhangyx0824/folia-mod-vinyl-disc
- **版本**: `v1.3.2`（tag，对应 commit 4b2c291）
- **模组目录**: `vinyl-disc`（仓库子目录）
- **模组说明**: 一个歌词动画模式「黑胶唱片」：选中后播放界面出现黑胶唱片——当前歌曲封面作碟心，播放时唱片旋转、唱臂落下，暂停时唱臂抬起、唱片停转，歌词在唱片一侧排布（曲名/歌手、当前句、翻译、下一句）。通过 `folium.registries.visualizers` 注册，仅选中该模式时渲染，不影响其他歌词模式。不联网、不上传数据。
- **权限说明**: 无任何权限（`permissions: []`）。未使用 `net.fetch`、`stageLayers`、`playback.*`、`platform.*`、`embedOrigins` 或任何实验接口；封面 URL、歌词、主题等均来自宿主提供的 `FoliumStageContext`。
- **许可证**: MIT（模组目录内含 LICENSE）
- **预览图**: `vinyl-disc/preview.jpg`（1280×720，126 KB）

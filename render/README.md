# markdown到知乎html渲染库

这里分为了full和lite模式。lite模式下不会依赖Obsidian、cookie、typst命令行、mermaid等，只有纯粹markdown转换。所以使用lite模式时需要先将图片转换为知乎图床URL，再进行转换。

使用`npm run build:render:lite`对lite模式进行构建。构建完毕后会在`render/dist`文件夹下生成`lite.mjs`，然后可以使用quickjs运行：`qjs -m render/lite.test.mjs`

full模式和Obsidian紧密耦合，不好拆分。

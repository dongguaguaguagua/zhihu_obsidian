---
sidebar_position: 8
slug: /syntax/mermaid
---

插件允许您上传 Obsidian 内的 mermaid 流程图，仅需在添加一个 mermaid 语法的代码块。

例如：

````markdown
```mermaid
flowchart TD

A[Christmas] -->|Get money| B(Go shopping)

B --> C{Let me think}

C -->|One| D[Laptops]

C -->|Two| E[iPhone]

C -->|Three| F[fa:fa-car Car]
```
````

上传到知乎就是

![mermaid](./imgs/mermaid.jpg)

您可以在设置中选择 mermaid 图表到图片的清晰度，有超清、高清、低清之分。

:::caution 由于代码块语法的原因，插件暂不支持 mermaid 图表的自定义备注。
:::

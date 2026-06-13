import { remarkMdToHTML } from "./dist/lite.mjs";
import * as std from "std";

const md = `
# 标题1
## 标题2

这是一行
这也是一行

| A | B |
| - | - |
| 1 | 2 |

行内公式 $a^2+b^2=c^2$

![alt](https://pic1.zhimg.com/v2-f83253fd38b3233a7e44a3c49d3eb8fb_1440w.jpg)
`;

const html = await remarkMdToHTML(md, { useZhihuHeadings: true });
std.out.puts(html + "\n");

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { u } from "unist-builder";
import type { Element } from "hast";
import type { Link } from "mdast";

const markdownContent = `
# 一级标题
## 二级标题
### 更多标题
`;
const zhihuHandlers = {
    link(state: any, node: Link): Element {
        const properties: { [key: string]: string } = {};
        if (node.title === "card") {
            // EXAMPLE:
            // [Github](https://github.com/ "card")
            // <a data-draft-node="block" data-draft-type="link-card" href="https://github.com/">Github</a>
            properties["data-draft-node"] = "block";
            properties["data-draft-type"] = "link-card";
            properties.href = node.url;
        } else if (node.title && node.title.includes("member_mention")) {
            // EXAMPLE:
            // [@Dong](https://www.zhihu.com/people/dong-jun-kai "member_mention_ed006411b00ce202f72d45c413246050")
            // <a class="member_mention" href="/people/dong-jun-kai" data-hash="ed006411b00ce202f72d45c413246050">@Dong</a>
            const hash = node.title.replace("member_mention_", "");
            const peopleId = node.url.replace(
                "https://www.zhihu.com/people/",
                "",
            );
            properties.class = "member_mention";
            properties.href = `/people/${peopleId}`;
            properties["data-hash"] = hash;
        } else {
            // EXAMPLE:
            // [Github](https://github.com/)
            // <a href="https://github.com/">Github</a>
            properties.href = node.url;
        }

        return {
            type: "element",
            tagName: "a",
            properties,
            children: state.all(node),
        };
    },
    inlineMath(state: any, node: any): Element {
        const alt = node.value;
        const encoded = encodeURI(alt);
        return {
            type: "element",
            tagName: "img",
            properties: {
                eeimg: "1",
                src: `//www.zhihu.com/equation?tex=${encoded}`,
                alt: alt,
            },
            children: [],
        };
    },
    math(state: any, node: any): Element {
        const alt = node.value + "\\\\";
        const encoded = encodeURI(alt);
        return {
            type: "element",
            tagName: "img",
            properties: {
                eeimg: "1",
                src: `//www.zhihu.com/equation?tex=${encoded}`,
                alt: alt,
            },
            children: [],
        };
    },
    // EXAMPLE:
    // ```python
    // print("hello")
    // ```
    // <pre lang="python">
    // print("hello")
    // </pre>
    code(state: any, node: any): Element {
        const lang = node.lang || "";
        const code = node.value ? node.value.trim() : "";
        return {
            type: "element",
            tagName: "pre",
            properties: { lang: lang },
            children: [u("text", code)],
        };
    },
    table(state: any, node: any): Element {
        // EXAMPLE:
        // <table data-draft-node="block" data-draft-type="table" data-size="normal"><tbody>
        // <tr><th>水果</th><th>英文</th></tr>
        // <tr><td>苹果</td><td>apple</td></tr>
        // </tbody></table>
        const rows = state.all(node) as Element[];
        const tbody: Element = u(
            "element",
            { tagName: "tbody", properties: {} },
            rows,
        );

        return {
            type: "element",
            tagName: "table",
            properties: {
                "data-draft-node": "block",
                "data-draft-type": "table",
                "data-size": "normal",
            },
            children: [tbody],
        };
    },
    // EXAMPLE:
    // <sup data-text="注释文本" data-url="https://www.github.com"
    // data-draft-node="inline" data-draft-type="reference"
    // data-numero="1">[1]</sup>
    footnoteReference(state: any, node: any): Element {
        const id = String(node.identifier).toUpperCase(); // 标准化 id（内部存的是大写）

        // 从 state.footnoteById 拿到 FootnoteDefinition 节点
        const def = state.footnoteById.get(id);
        if (!def) {
            // 没找到定义就直接渲染一个普通的 [1]
            return {
                type: "element",
                tagName: "sup",
                properties: {},
                children: [{ type: "text", value: `[${id}]` }],
            };
        }

        // 解析 def.children[0]（第一个段落）里的文本和链接
        const para = def.children[0];
        let text = "";
        let url = "";
        for (const child of para.children as any[]) {
            if (child.type === "text") text += child.value.trim();
            if (child.type === "link") url = child.url;
        }

        return {
            type: "element",
            tagName: "sup",
            properties: {
                "data-text": text,
                "data-url": url,
                "data-draft-node": "inline",
                "data-draft-type": "reference",
                "data-numero": id,
            },
            children: [u("text", `[${id}]`)],
        };
    },

    footnoteDefinition(): undefined {
        return;
    },
    // 如果是一个#，则是二级标题<h2>
    // 如果是两个#，则是三级标题<h3>
    // 如果是三个及以上的#，则是加粗处理
    heading(state: any, node: any): Element {
        const children = state.all(node) as Element[];
        let tagName;
        switch (node.depth) {
            case 1:
                tagName = "h2";
                break;
            case 2:
                tagName = "h3";
                break;
            default:
                tagName = "strong";
                break;
        }
        return {
            type: "element",
            tagName: tagName,
            properties: {},
            children,
        };
    },
};

async function runTest() {
    const file = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkRehype, {
            allowDangerousHtml: true,
            handlers: zhihuHandlers,
        })
        .use(rehypeStringify)
        .process(markdownContent);

    const htmlOutput = String(file);

    console.log("\n--- Markdown Input ---\n");
    console.log(markdownContent);
    console.log("\n---HTML Output (Zhihu Flavor) ---\n");
    console.log(htmlOutput);
}

runTest();

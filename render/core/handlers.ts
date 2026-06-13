import { u } from "unist-builder";
import type { Element } from "hast";
import type { Link, Text } from "mdast";
import type { WikiLinkNode } from "./plugins/wikilink";

export type WikiLinkHandler = (state: any, node: WikiLinkNode) => Element;

export type CreateZhihuHandlersOptions = {
    useZhihuHeadings: boolean;
    idMap: Map<string, number>;
    wikiLinkHandler?: WikiLinkHandler;
};

export function createZhihuHandlers(opts: CreateZhihuHandlersOptions) {
    const { idMap, useZhihuHeadings } = opts;

    return {
        link(state: any, node: Link): Element {
            const properties: { [key: string]: string } = {};
            if (node.title === "card") {
                // EXAMPLE:
                // [Github](https://github.com/ "card")
                // <a data-draft-node="block" data-draft-type="link-card" href="https://github.com/">Github</a>
                properties.href = node.url;
                properties["data-draft-node"] = "block";
                properties["data-draft-type"] = "link-card";
                properties["data-draft-title"] = getLinkText(node);
                properties["data-draft-cover"] = "";
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
            const eq = node.value;
            const alt = eq.replace(/[\n\r]/g, " ");
            const encoded = encodeURI(eq);
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
            const eq = node.value;
            const alt = eq.replace(/[\n\r]/g, " ");
            const encoded = encodeURI(eq);
            return {
                type: "element",
                tagName: "p",
                properties: {},
                children: [
                    {
                        type: "element",
                        tagName: "img",
                        properties: {
                            eeimg: "2",
                            src: `//www.zhihu.com/equation?tex=${encoded}`,
                            alt: alt,
                        },
                        children: [],
                    },
                ],
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
            const rawId = String(node.identifier).toUpperCase(); // 标准化 id（内部存的是大写）
            // 分配新编号
            let numero = idMap.get(rawId);
            if (!numero) {
                numero = idMap.size + 1;
                idMap.set(rawId, numero);
            }
            // 从 state.footnoteById 拿到 FootnoteDefinition 节点
            const def = state.footnoteById.get(rawId);
            if (!def) {
                // 没找到定义就直接渲染一个普通的 [1]
                return {
                    type: "element",
                    tagName: "sup",
                    properties: {},
                    children: [{ type: "text", value: `[${numero}]` }],
                };
            }

            // 解析 def.children[0]（第一个段落）里的文本和链接
            const para = def.children[0];
            let text = "";
            let url = "";
            for (const child of para.children) {
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
                    "data-numero": String(numero),
                },
                children: [u("text", `[${numero}]`)],
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
            // 如果不使用知乎特色的标题，那么直接几级就转换成几级的HTML
            if (!useZhihuHeadings) {
                return {
                    type: "element",
                    tagName: "h" + node.depth,
                    properties: {},
                    children,
                };
            }
            switch (node.depth) {
                case 1:
                    return {
                        type: "element",
                        tagName: "h2",
                        properties: {},
                        children,
                    };
                case 2:
                    return {
                        type: "element",
                        tagName: "h3",
                        properties: {},
                        children,
                    };
                default:
                    return {
                        type: "element",
                        tagName: "p",
                        properties: {},
                        children: [
                            {
                                type: "element",
                                tagName: "strong",
                                properties: {},
                                children,
                            },
                        ],
                    };
            }
        },
        // Obsidian callout语法支持
        blockquote(state: any, node: any): Element {
            // 如果不存在callout，说明是普通引用块，则返回原本结果
            if (node?.data?.hProperties?.dataCallout === undefined) {
                return {
                    type: "element",
                    tagName: "blockquote",
                    properties: {},
                    children: state.all(node),
                };
            }
            const props = node.data?.hProperties || {};
            // ignore类型直接返回空 p
            // EXAMPLE:
            // > [!ignore] Title
            // > some text
            const ignoreType = ["ignore", "忽略", "注释"];
            if (ignoreType.includes(props.dataCalloutType)) {
                return {
                    type: "element",
                    tagName: "p",
                    properties: {},
                    children: [],
                };
            }

            // 找到标题段落（带有 dataCalloutTitle）
            const titleParagraph = node.children.find(
                (child: any) => child.data?.hProperties?.dataCalloutTitle,
            );

            // 提取标题文本
            const titleText = titleParagraph?.children?.[0]?.value ?? "";

            // 提取正文（去掉 title 节点和嵌套 blockquote）
            const contentNodes = node.children
                .filter((child: any) => {
                    const hName = child.data?.hName;
                    return (
                        hName !== "div" ||
                        !child.data?.hProperties?.dataCalloutTitle
                    );
                })
                .flatMap((child: any) => {
                    // 若是嵌套 blockquote 包含 dataCalloutBody，取其子项
                    if (
                        child.type === "blockquote" &&
                        child.data?.hProperties?.dataCalloutBody
                    ) {
                        return child.children ?? [];
                    }
                    return [child];
                });

            return {
                type: "element",
                tagName: "p",
                properties: {},
                children: [
                    {
                        type: "element",
                        tagName: "strong",
                        properties: {},
                        children: [u("text", titleText)],
                    },
                    ...state.all({ children: contentNodes }),
                ],
            };
        },
        // 处理 obsidian 内链，如果内链是一篇知乎文章，则会提取链接和文件名作为知乎链接
        // 否则就是普通的下划线文字
        wikiLink(state: any, node: WikiLinkNode): Element {
            if (opts.wikiLinkHandler) return opts.wikiLinkHandler(state, node);
            const name = node.value;
            return {
                type: "element",
                tagName: "u",
                properties: {},
                children: [u("text", name)],
            };
        },
        // 如果是卡片链接，那么不需要被p标签包裹，否则在知乎卡片视图下会变成普通链接。
        paragraph(state: any, node: any): Element | any[] {
            if (
                node.children?.length === 1 &&
                node.children[0]?.type === "link" &&
                node.children[0]?.title === "card"
            ) {
                return state.all(node)[0];
            }

            return {
                type: "element",
                tagName: "p",
                properties: {},
                children: state.all(node),
            };
        },
    };
}

// 检测node是否单独一行
export function isNodeAloneInLine(node: any, source: string): boolean {
    const pos = node.position;
    if (!pos?.start || !pos?.end) return false;
    const { start, end } = pos;
    if (start.line !== end.line) return false;

    const line = source.split(/\r?\n/)[start.line - 1] ?? "";
    const before = line.slice(0, start.column - 1).trim();
    const after = line.slice(end.column - 1).trim();
    return before === "" && after === "";
}

// 提取[link_text](link_url)中的`link_text`
function getLinkText(node: Link): string {
    return node.children
        .filter((child): child is Text => child.type === "text")
        .map((child) => child.value)
        .join("");
}

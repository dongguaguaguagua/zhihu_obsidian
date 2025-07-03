import { unified, Plugin, Transformer } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { syntax } from "micromark-extension-wiki-link";
import { fromMarkdown, toMarkdown } from "mdast-util-wiki-link";
import { visit } from "unist-util-visit";
import { u } from "unist-builder";
import type { Element } from "hast";
import type { Link, Image } from "mdast";
import { Vault } from "obsidian";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import type { Parent, Node } from "unist";
import { loadSettings } from "./settings";
import { getOnlineImg, getZhihuImgLink } from "./image_service";
import * as file from "./files";
import * as fs from "fs";
import * as path from "path";

function wikiLinkPlugin(this: any, opts = {}) {
    const data = this.data();

    function add(field: any, value: any) {
        if (data[field]) data[field].push(value);
        else data[field] = [value];
    }

    add("micromarkExtensions", syntax(opts));
    add("fromMarkdownExtensions", fromMarkdown(opts));
    add("toMarkdownExtensions", toMarkdown(opts));
}

// 获取![alt](link)格式的图片，先下载到本地，
// 再上传到知乎，获得链接URL，最后转换为知乎HTML
export const remarkZhihuImgsOnline: Plugin<[Vault], Parent, Parent> = (
    vault,
) => {
    const transformer: Transformer<Parent, Parent> = async (tree) => {
        const settings = await loadSettings(vault);
        const tasks: Promise<void>[] = [];
        visit(tree, "image", (node: Image) => {
            const task = (async () => {
                let alt = node.alt;
                const url = node.url || "";
                const imgBuffer = await getOnlineImg(vault, url);
                const imgLink = await getZhihuImgLink(vault, imgBuffer);
                if (!alt) {
                    // 如果alt为空，则通过设置判断是否加alt
                    alt = settings.useImgNameDefault ? imgLink : "";
                }
                node.url = imgLink;
                node.data = {
                    ...node.data,
                    hName: "img",
                    hProperties: {
                        src: imgLink,
                        "data-caption": alt,
                        "data-size": "normal",
                        "data-watermark": "watermark",
                        "data-original-src": imgLink,
                        "data-watermark-src": "",
                        "data-private-watermark-src": "",
                    },
                    hChildren: [],
                };
            })();
            tasks.push(task);
        });
        await Promise.all(tasks);
    };
    return transformer;
};

// edit from `https://github.com/landakram/mdast-util-wiki-link/blob/master/src/from-markdown.ts`
// line 20-28
interface WikiLinkNode extends Node {
    type: "wikiLink";
    value: string;
    data: {
        alias: string;
        permalink: string;
        exists: boolean;
        hName?: string;
        hProperties?: {
            src: string;
            "data-caption": string;
            "data-size": string;
            "data-watermark": string;
            "data-original-src": string;
            "data-watermark-src": string;
            "data-private-watermark-src": string;
        };
        hChildren: [];
    };
}

// 获取本地图片：![[link|alt]] 格式。
export const remarkZhihuImgsLocal: Plugin<[Vault], Parent, Parent> = (
    vault,
) => {
    const transformer: Transformer<Parent, Parent> = async (tree) => {
        const settings = await loadSettings(vault);
        const tasks: Promise<void>[] = [];
        visit(tree as any, "wikiLink", (node: WikiLinkNode) => {
            const task = (async () => {
                let alt = node.data.alias;
                const imgName = node.value;
                const imgPathOnDisk = await file.getFilePathFromName(
                    vault,
                    imgName,
                );
                const imgBuffer = fs.readFileSync(imgPathOnDisk);
                const imgLink = await getZhihuImgLink(vault, imgBuffer);
                if (alt === imgName) {
                    // 图片名称和alt相同，说明没加alt，则通过设置判断是否加alt
                    alt = settings.useImgNameDefault
                        ? path.basename(imgName)
                        : "";
                }
                (node as any).type = "image";
                (node as any).url = imgLink;
                (node as any).alt = alt;
                node.data = {
                    ...node.data,
                    hName: "img",
                    hProperties: {
                        src: imgLink,
                        "data-caption": alt,
                        "data-size": "normal",
                        "data-watermark": "watermark",
                        "data-original-src": imgLink,
                        "data-watermark-src": "",
                        "data-private-watermark-src": "",
                    },
                    hChildren: [],
                };
            })();
            tasks.push(task);
        });
        await Promise.all(tasks);
    };
    return transformer;
};

export async function remarkMdToHTML(vault: Vault, md: string) {
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
    };
    const rehypeOpts: RemarkRehypeOptions = {
        allowDangerousHtml: true,
        handlers: zhihuHandlers,
    };
    const output = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(wikiLinkPlugin)
        .use(remarkZhihuImgsOnline, vault)
        .use(remarkZhihuImgsLocal, vault)
        .use(remarkRehype, undefined, rehypeOpts)
        .use(rehypeStringify)
        .process(md);

    const htmlOutput = String(output);
    return htmlOutput;
}

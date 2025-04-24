import TurndownService from "turndown";

export function htmlToMd(html: string): string {
	try {
		const turndownService = new TurndownService({
			headingStyle: "atx",
			codeBlockStyle: "fenced",
			bulletListMarker: "-",
			emDelimiter: "*",
			strongDelimiter: "**",
			linkStyle: "inlined",
		});

		// 规则 1：数学公式图片转为 $公式$ 或 $$公式$$
		turndownService.addRule("mathImgToLatex", {
			filter: function (node) {
				return (
					node.nodeName === "IMG" &&
					(node as HTMLElement).getAttribute("eeimg") === "1"
				);
			},
			replacement: function (content, node) {
				const alt = (node as HTMLElement).getAttribute("alt") || "";
				const trimmedAlt = alt.trim();
				// 检测是否以 \\ 结尾，如果是代表了行间公式，用$$包裹
				if (trimmedAlt.endsWith("\\\\")) {
					const cleanAlt = trimmedAlt.slice(0, -2);
					return `$$${cleanAlt}$$`;
				}
				return `$${trimmedAlt}$`;
			},
		});

		// 规则 2：带 lang 的 <pre> 转为 ```语言代码块
		turndownService.addRule("preWithLang", {
			filter: function (node) {
				return (
					node.nodeName === "PRE" &&
					(node as HTMLElement).getAttribute("lang") !== null
				);
			},
			replacement: function (content, node) {
				const lang = (node as HTMLElement).getAttribute("lang") || "";
				const code = node.textContent || "";
				return `\`\`\`${lang}\n${code.trim()}\n\`\`\``;
			},
		});

		const markdown = turndownService.turndown(html);
		return markdown;
	} catch (error) {
		console.error("HTML to Markdown conversion failed:", error);
		return "";
	}
}

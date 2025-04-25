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

		// 规则 3：将 HTML 表格转换为 Markdown 表格
		turndownService.addRule("tableToMarkdown", {
			filter: ["table"],
			replacement: function (content, node) {
				const rows = Array.from(node.querySelectorAll("tr"));
				if (rows.length === 0) return "";

				let markdown = "";
				const headers = Array.from(rows[0].querySelectorAll("th, td"));
				const headerTexts = headers.map(
					(cell) => cell.textContent?.trim() || "",
				);
				markdown += `| ${headerTexts.join(" | ")} |\n`;
				markdown += `| ${headerTexts.map(() => "-----").join(" | ")} |\n`;
				rows.slice(1).forEach((row) => {
					const cells = Array.from(row.querySelectorAll("td, th"));
					const cellTexts = cells.map(
						(cell) => cell.textContent?.trim() || "",
					);
					markdown += `| ${cellTexts.join(" | ")} |\n`;
				});

				return markdown;
			},
		});

		// 规则 4：将 <figure> 包含的 <img> 和 <figcaption> 转为 Markdown 图片
		turndownService.addRule("figureToImage", {
			filter: ["figure"],
			replacement: function (content, node) {
				const img = node.querySelector("img");
				const figcaption = node.querySelector("figcaption");
				if (!img) return "";
				console.log("img:", img);
				console.log("figcaption:", figcaption);
				const src = img.getAttribute("src") || "";
				console.log("src:", src);
				const alt = figcaption?.textContent?.trim() || "";
				console.log("alt:", alt);
				return `![${alt}](${src})`;
			},
		});

		const markdown = turndownService.turndown(html);
		return markdown;
	} catch (error) {
		console.error("HTML to Markdown conversion failed:", error);
		return "";
	}
}

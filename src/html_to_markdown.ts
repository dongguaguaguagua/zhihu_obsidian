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
				const escapedAlt = alt.replace(/\$/g, "\\$");
				const trimmedAlt = escapedAlt.trim();
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
				const src = img.getAttribute("src") || "";
				const alt = figcaption?.textContent?.trim() || "";
				return `![${alt}](${src})`;
			},
		});

		// 规则 5：忽略 <h*> 标签中的 <br> 标签
		turndownService.addRule("ignoreBrInHeading", {
			filter: function (node, options) {
				return (
					node.nodeName === "BR" &&
					node.parentElement?.nodeName.match(/^H[1-6]$/) !== null
				);
			},
			replacement: function () {
				return "";
			},
		});

		// 规则 6：将脚注转换为指定 HTML 格式
		turndownService.addRule("footnoteToHtml", {
			filter: function (node, options) {
				// 匹配脚注引用（形如 <sup>1</sup>）
				return (
					node.nodeName === "SUP" &&
					node.textContent?.match(/^\d+$/) !== null
				);
			},
			replacement: function (content, node, options) {
				const footnoteNumber = node.textContent || "";
				// 查找对应的脚注定义（假设脚注定义在 HTML 中为 <p>[^1]: ... </p>）
				const footnoteDefinition = Array.from(
					document.querySelectorAll("p, div"),
				).find((el) =>
					el.textContent?.match(
						new RegExp(`\\[^${footnoteNumber}\\]:`),
					),
				);

				let footnoteText = "";
				let footnoteUrl = "";

				if (footnoteDefinition) {
					const textContent = footnoteDefinition.textContent || "";
					// 提取脚注内容和 URL
					const match = textContent.match(
						/\[\^(\d+)\]:\s*(.*?)(https?:\/\/[^\s]*)/,
					);
					if (match) {
						footnoteText = match[2].trim();
						footnoteUrl = match[3]
							.trim()
							.replace(/^https?:\/\/(www\.)?/, "");
					} else {
						// 如果没有 URL，仅提取文本
						const textMatch =
							textContent.match(/\[\^(\d+)\]:\s*(.*)/);
						if (textMatch) {
							footnoteText = textMatch[2].trim();
						}
					}
				}

				// 生成目标 HTML
				return `<sup data-text="${footnoteText}" data-url="${footnoteUrl}" data-draft-node="inline" data-draft-type="reference" data-numero="${footnoteNumber}">[${footnoteNumber}]</sup>`;
			},
		});

		// 规则 7：移除脚注定义
		turndownService.addRule("removeFootnoteDefinition", {
			filter: function (node, options) {
				// 匹配脚注定义（形如 <p>[^1]: ... </p>）
				return (
					(node.nodeName === "P" || node.nodeName === "DIV") &&
					node.textContent?.match(/^\[\^\d+\]:/) !== null
				);
			},
			replacement: function () {
				return "";
			},
		});

		const markdown = turndownService.turndown(html);
		return markdown;
	} catch (error) {
		console.error("HTML to Markdown conversion failed:", error);
		return "";
	}
}

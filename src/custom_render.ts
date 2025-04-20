import { marked, Renderer, Tokens } from "marked";

marked.setOptions({
	breaks: true,
});

export async function mdToZhihuHTML(md: string): Promise<string> {
	// 处理行间公式 $$...$$
	md = md.replace(/\$\$([^$]+)\$\$/g, (_match, eq) => {
		eq = eq.replace(/[\n\r]/g, "");
		const encoded = encodeURI(eq);
		return `<img eeimg="1" src="//www.zhihu.com/equation?tex=${encoded}" alt="${eq}"/>`;
	});

	// 处理行内公式 $...$
	md = md.replace(/([^\\])\$([^$\n]+?)\$/g, (_match, prefix, eq) => {
		eq = eq.replace(/[\n\r]/g, "");
		const encoded = encodeURI(eq);
		return `${prefix}<img eeimg="1" src="//www.zhihu.com/equation?tex=${encoded}" alt="${eq}"/>`;
	});

	const renderer: Partial<Renderer> = {
		code({ text, lang }: { text: string; lang?: string }) {
			const language = lang || "";
			return `<pre lang="${language}">${text.trim()}</pre>`;
		},
		table(token: Tokens.Table) {
			const thead = `<tr>${token.header.map((cell: Tokens.TableCell) => this.tablecell(cell)).join("")}</tr>`;
			const tbody = token.rows
				.map((row: Tokens.TableCell[]) => {
					const rowToken = {
						text: row,
					} as unknown as Tokens.TableRow;
					return this.tablerow(rowToken);
				})
				.join("\n");
			return `<table data-draft-node="block" data-draft-type="table" data-size="normal">\n<tbody>${thead}\n${tbody}\n</tbody>\n</table>`;
		},
		tablerow(token: Tokens.TableRow) {
			const cells = (token.text as unknown as Tokens.TableCell[]).map(
				(cell: Tokens.TableCell) => this.tablecell(cell),
			);
			return `<tr>${cells.join("")}</tr>`;
		},
		tablecell(token: Tokens.TableCell) {
			return token.header
				? `<th>${token.text}</th>`
				: `<td>${token.text}</td>`;
		},
		link(token: Tokens.Link) {
			const { href, title, text } = token;
			// 链接卡片语法：`[GitHub](https://www.github.com "card")` 可识别为卡片
			if (title === "card") {
				return `<a href="${href}" data-draft-node="block" data-draft-type="link-card">${text}</a>`;
			} else if (title && title.includes("member_mention")) {
				const hash = title.replace("member_mention_", "");
				const peopleId = href.replace(
					"https://www.zhihu.com/people/",
					"",
				);
				return `<a class="member_mention" href="/people/${peopleId}" data-hash="${hash}">${text}</a>`;
			}
			return `<a href="${href}">${text}</a>`;
		},
	};
	marked.use({ renderer });
	return await marked(md);
}

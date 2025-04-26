export function addPopularizeStr(content: string) {
	return (
		content +
		'\n<blockquote>\n\
<p>本文由 <a href=\"https://github.com/dongguaguaguagua/zhihu_obsidian\">\
Zhihu on Obsidian\
</a> 创作并发布</p>\
\n</blockquote>\n'
	);
}

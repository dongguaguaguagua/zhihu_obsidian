export function addFrontmatter(content: string, key: string, value: string) {
	const fmRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(fmRegex);

	if (match) {
		let fm = match[1];
		const keyRegex = new RegExp(`^${key}:.*$`, "m");

		if (!keyRegex.test(fm)) {
			fm += `\n${key}: ${value}`;
			content = content.replace(fmRegex, `---\n${fm}\n---`);
			return content;
		} else {
			return content;
		}
	} else {
		content = `---\n${key}: ${value}\n---\n\n${content}`;
		return content;
	}
}

export function updateFrontmatter(content: string, key: string, value: string) {
	const fmRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(fmRegex);

	if (match) {
		let fm = match[1];
		const keyRegex = new RegExp(`^${key}:.*$`, "m");

		if (keyRegex.test(fm)) {
			fm = fm.replace(keyRegex, `${key}: ${value}`);
		} else {
			fm += `\n${key}: ${value}`;
		}

		content = content.replace(fmRegex, `---\n${fm}\n---`);
		return content;
	} else {
		console.warn("Frontmatter not found.");
		return content;
	}
}

export function removeFrontmatter(content: string) {
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

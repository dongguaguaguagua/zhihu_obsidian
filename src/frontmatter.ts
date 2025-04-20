export function addFrontmatter(content: string, key: string, value: string) {
	const fmRegex = /^---\n([\s\S]*?)\n---/;
	const match = content.match(fmRegex);

	if (match) {
		let fm = match[1];
		const keyRegex = new RegExp(`^${key}:.*$`, "m");

		if (!keyRegex.test(fm)) {
			fm += `\n${key}: ${value}`;
			content = content.replace(fmRegex, `---\n${fm}\n---`);
			console.log(`Added frontmatter: ${key}: ${value}`);
			return content;
		} else {
			console.log(
				`Frontmatter key "${key}" already exists. Skipping add.`,
			);
			return content;
		}
	} else {
		content = `---\n${key}: ${value}\n---\n\n${content}`;
		console.log(`Created and added frontmatter: ${key}: ${value}`);
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
		console.log(`Updated frontmatter: ${key}: ${value}`);
		return content;
	} else {
		console.warn("Frontmatter not found.");
		return content;
	}
}

export function removeFrontmatter(content: string) {
	return content.replace(/^---\n[\s\S]*?\n---\n*/, "");
}

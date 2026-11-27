import browser from './browser-polyfill';

// DEVONthink URL commands carry the document body in the URL itself. Chrome
// starts rejecting very long navigations well before the theoretical 2 MB
// limit, so keep a conservative ceiling and fail with a readable message.
const MAX_URL_LENGTH = 1_800_000;

function urlParam(name: string, value: string): string {
	return `${name}=${encodeURIComponent(value)}`;
}

// DEVONthink's destination parameter wants the bare UUID. Users naturally
// paste the whole item link from the context menu, so accept both forms.
function normalizeDestination(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	const match = trimmed.match(/^x-devonthink(?:-item)?:\/\/([^/?#]+)/i);
	return match ? match[1] : trimmed;
}

function openExternalUrl(url: string): void {
	// The background handler is scheme-agnostic: it just calls tabs.update().
	// Reusing it avoids duplicating the popup/iframe fallback logic.
	browser.runtime.sendMessage({
		action: 'openObsidianUrl',
		url: url
	}).catch((error) => {
		console.error('Error opening DEVONthink URL via background script:', error);
		window.open(url, '_blank');
	});
}

export type DevonThinkFormat = 'markdown' | 'html';

// DEVONthink renders HTML previews using its own appearance theme. When the
// app is in dark mode, a bare HTML fragment (with the source page's dark
// text colors) becomes unreadable black-on-black. Wrap the fragment in a
// light, full-width surface so it stays legible regardless of DT's theme.
// Kept as a fragment (no <!DOCTYPE>/<html>) because that is the form verified
// to work with createHTML + location in DT 4.4.2.
function wrapHtmlForDevonThink(html: string): string {
	return `<div style="background:#ffffff!important;color:#1a1a1a!important;padding:16px;` +
		`font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;` +
		`min-height:100%">${html}</div>`;
}

export async function saveToDevonThink(
	fileContent: string,
	noteName: string,
	location: string,
	destination: string,
	tags: string,
	format: DevonThinkFormat = 'markdown'
): Promise<void> {
	const title = noteName || 'Web clip';
	const isHtml = format === 'html';

	const parts: string[] = [urlParam('title', title)];
	if (isHtml) {
		// HTML mode: real .html document with our extracted HTML as `source`.
		// Verified on DT 4.4.2: createHTML needs `location` present to act at all
		// (without it the command is a silent no-op), but when both are given,
		// `source` content is preserved and `location` only supplies the URL
		// metadata — it does NOT re-download the page (unlike createMarkdown).
		parts.push(urlParam('source', wrapHtmlForDevonThink(fileContent)));
		if (location) parts.push(urlParam('location', location));
	} else {
		// Markdown mode: never pass `location` — createMarkdown treats it as a
		// URL to download, discarding `text`. Source URL lives in frontmatter.
		parts.push(urlParam('text', fileContent));
	}
	if (tags) {
		parts.push(urlParam('tags', tags));
	}
	const normalizedDestination = normalizeDestination(destination);
	if (normalizedDestination) {
		parts.push(urlParam('destination', normalizedDestination));
		parts.push(urlParam('noselector', '1'));
	}

	const command = isHtml ? 'createHTML' : 'createMarkdown';
	const url = `x-devonthink://${command}?${parts.join('&')}`;

	if (url.length > MAX_URL_LENGTH) {
		throw new Error('devonthinkTooLong');
	}

	console.log(`DEVONthink ${command} URL length:`, url.length);
	openExternalUrl(url);
}

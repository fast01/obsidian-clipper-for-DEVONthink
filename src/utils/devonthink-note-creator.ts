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

// Wrap the extracted HTML in a minimal document so DEVONthink renders it as a
// real page. The source URL goes into <base>/<meta> instead of the URL's
// `location` param, which would make DT re-download the page.
function buildHtmlDocument(html: string, title: string, sourceUrl: string): string {
	const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const baseTag = sourceUrl ? `<base href="${sourceUrl.replace(/"/g, '&quot;')}">` : '';
	const metaTag = sourceUrl ? `<meta name="source" content="${sourceUrl.replace(/"/g, '&quot;')}">` : '';
	return `<!DOCTYPE html><html><head><meta charset="utf-8">${baseTag}${metaTag}<title>${safeTitle}</title></head><body>${html}</body></html>`;
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
	const parts: string[] = [
		urlParam('title', title),
		urlParam(isHtml ? 'source' : 'text', isHtml ? buildHtmlDocument(fileContent, title, location) : fileContent)
	];

	// Do NOT pass `location` to createMarkdown/createHTML: DEVONthink treats it
	// as a URL to download and convert itself, discarding `text`/`source`.
	// For markdown the source URL lives in the frontmatter; for HTML it's in
	// the document's <base>/<meta> (see buildHtmlDocument).
	void location;
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

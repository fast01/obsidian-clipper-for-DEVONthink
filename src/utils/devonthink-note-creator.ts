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
	// Send the HTML body as-is. DEVONthink wraps it in a document itself;
	// embedding a full <!DOCTYPE>/<html> inside `source` has been observed to
	// silently create no document in DT 4.4.2.
	const parts: string[] = [
		urlParam('title', title),
		urlParam(isHtml ? 'source' : 'text', fileContent)
	];

	// Do NOT pass `location`: DEVONthink treats it as a URL to download and
	// convert itself, discarding `text`/`source`. For HTML, put the source URL
	// in `comment` (supported for all commands) so it survives as metadata.
	if (isHtml && location) {
		parts.push(urlParam('comment', location));
	}
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

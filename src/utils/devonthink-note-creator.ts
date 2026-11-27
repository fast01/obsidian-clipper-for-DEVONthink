import browser from './browser-polyfill';

// DEVONthink URL commands carry the document body in the URL itself. Chrome
// starts rejecting very long navigations well before the theoretical 2 MB
// limit, so keep a conservative ceiling and fail with a readable message.
const MAX_URL_LENGTH = 1_800_000;

function urlParam(name: string, value: string): string {
	return `${name}=${encodeURIComponent(value)}`;
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

export async function saveToDevonThink(
	fileContent: string,
	noteName: string,
	location: string,
	destination: string,
	tags: string
): Promise<void> {
	const parts: string[] = [
		urlParam('title', noteName || 'Web clip'),
		urlParam('text', fileContent)
	];

	if (location) {
		parts.push(urlParam('location', location));
	}
	if (tags) {
		parts.push(urlParam('tags', tags));
	}
	if (destination) {
		parts.push(urlParam('destination', destination));
		parts.push(urlParam('noselector', '1'));
	}

	const url = `x-devonthink://createMarkdown?${parts.join('&')}`;

	if (url.length > MAX_URL_LENGTH) {
		throw new Error('devonthinkTooLong');
	}

	console.log('DEVONthink URL length:', url.length);
	openExternalUrl(url);
}

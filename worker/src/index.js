const RATE_LIMIT = new Map();

function isRateLimited(ip) {
	const now = Date.now();
	const entry = RATE_LIMIT.get(ip) || { count: 0, time: now };

	if (now - entry.time > 60000) {
		RATE_LIMIT.set(ip, { count: 1, time: now });
		return false;
	}

	entry.count++;
	RATE_LIMIT.set(ip, entry);

	return entry.count > 10;
}

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};
}

function isBlockedUrl(url) {
	try {
		const u = new URL(url);
		const host = u.hostname;

		if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
			return true;
		}

		if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.')) {
			return true;
		}

		return false;
	} catch {
		return true;
	}
}

export default {
	async fetch(request) {
		const ip = request.headers.get('cf-connecting-ip') || 'local';

		if (isRateLimited(ip)) {
			return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: corsHeaders() });
		}

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: corsHeaders(),
			});
		}

		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', {
				status: 405,
				headers: corsHeaders(),
			});
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders() });
		}

		const { url } = body;

		if (!url || !url.startsWith('http')) {
			return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: corsHeaders() });
		}

		if (isBlockedUrl(url)) {
			return new Response(JSON.stringify({ error: 'Blocked URL' }), { status: 403, headers: corsHeaders() });
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);

		let response;
		try {
			response = await fetch(url, {
				redirect: 'follow',
				signal: controller.signal,
			});
		} catch {
			return new Response(JSON.stringify({ error: 'Failed to fetch website' }), { status: 500, headers: corsHeaders() });
		} finally {
			clearTimeout(timeout);
		}

		const html = await response.text();
		const headers = response.headers;

		const issues = [];
		let seoScore = 100;
		let securityScore = 100;

		if (!html.includes('<title>')) {
			seoScore -= 20;
			issues.push({ type: 'SEO', message: 'Missing <title> tag' });
		}

		if (!html.includes('meta name="description"')) {
			seoScore -= 20;
			issues.push({ type: 'SEO', message: 'Missing meta description' });
		}

		if (!headers.get('content-security-policy')) {
			securityScore -= 25;
			issues.push({ type: 'Security', message: 'Missing CSP header' });
		}

		if (!headers.get('x-frame-options')) {
			securityScore -= 25;
			issues.push({ type: 'Security', message: 'Missing X-Frame-Options header' });
		}

		return new Response(
			JSON.stringify({
				scores: {
					seo: Math.max(seoScore, 0),
					security: Math.max(securityScore, 0),
				},
				issues,
				meta: {
					status: response.status,
					htmlSizeKb: Math.round(html.length / 1024),
				},
			}),
			{
				headers: {
					...corsHeaders(),
					'Content-Type': 'application/json',
				},
			}
		);
	},
};

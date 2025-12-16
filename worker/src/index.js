function isAdmin(request, env) {
	const auth = request.headers.get('authorization');
	if (!auth) return false;

	const token = auth.replace('Bearer ', '');
	return token === env.ADMIN_TOKEN;
}

function cacheKey(url) {
	return `audit:${url}`;
}

function auditPerformance(html, responseTime, issues) {
	let score = 100;

	const scriptCount = (html.match(/<script/gi) || []).length;
	const cssCount = (html.match(/<link[^>]*rel=["']stylesheet["']/gi) || []).length;

	if (responseTime > 2000) {
		score -= 30;
		issues.push({
			type: 'Performance',
			message: 'Slow server response time (>2s)',
		});
	}

	if (scriptCount > 10) {
		score -= 20;
		issues.push({
			type: 'Performance',
			message: 'Too many JavaScript files',
		});
	}

	if (cssCount > 5) {
		score -= 15;
		issues.push({
			type: 'Performance',
			message: 'Too many CSS files',
		});
	}

	if (html.length > 500 * 1024) {
		score -= 20;
		issues.push({
			type: 'Performance',
			message: 'Large HTML size',
		});
	}

	return Math.max(score, 0);
}

function auditAccessibility(html, issues) {
	let score = 100;

	// Missing lang attribute
	if (!html.includes('<html') || !html.includes('lang=')) {
		score -= 20;
		issues.push({
			type: 'Accessibility',
			message: 'Missing lang attribute on <html>',
		});
	}

	// Images without alt
	const imagesWithoutAlt = (html.match(/<img(?![^>]*alt=)/gi) || []).length;

	if (imagesWithoutAlt > 0) {
		score -= 20;
		issues.push({
			type: 'Accessibility',
			message: 'Images missing alt attributes',
		});
	}

	// Inputs without labels / aria-label
	const inputsWithoutLabel = (html.match(/<input(?![^>]*(aria-label|aria-labelledby|id)=)/gi) || []).length;

	if (inputsWithoutLabel > 0) {
		score -= 20;
		issues.push({
			type: 'Accessibility',
			message: 'Inputs without accessible labels',
		});
	}

	return Math.max(score, 0);
}

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
	async fetch(request, env) {
		// 🔐 Admin endpoint: fetch audit history
		if (request.method === 'GET' && new URL(request.url).pathname === '/api/admin/audits') {
			if (!isAdmin(request, env)) {
				return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders() });
			}

			const { results } = await env.DB.prepare(
				`
    SELECT
      id,
      url,
      seo,
      security,
      performance,
      accessibility,
      cached,
      created_at
    FROM audits
    ORDER BY created_at DESC
    LIMIT 50
    `
			).all();

			return new Response(JSON.stringify({ audits: results }), {
				headers: {
					...corsHeaders(),
					'Content-Type': 'application/json',
				},
			});
		}

		const ip = request.headers.get('cf-connecting-ip') || 'local';

		if (isRateLimited(ip)) {
			return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: corsHeaders() });
		}

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders() });
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

		// 🔁 Check KV cache
		const key = cacheKey(url);
		const cached = await env.AUDIT_CACHE.get(key, 'json');

		if (cached) {
			return new Response(JSON.stringify({ ...cached, cached: true }), {
				headers: {
					...corsHeaders(),
					'Content-Type': 'application/json',
				},
			});
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);

		const startTime = Date.now();
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

		const responseTime = Date.now() - startTime;
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
			issues.push({
				type: 'Security',
				message: 'Missing X-Frame-Options header',
			});
		}

		const performanceScore = auditPerformance(html, responseTime, issues);
		const accessibilityScore = auditAccessibility(html, issues);

		const result = {
			scores: {
				seo: Math.max(seoScore, 0),
				security: Math.max(securityScore, 0),
				performance: performanceScore,
				accessibility: accessibilityScore,
			},
			issues,
			meta: {
				status: response.status,
				htmlSizeKb: Math.round(html.length / 1024),
				responseTimeMs: responseTime,
			},
		};

		// 💾 Save audit to D1 database
		await env.DB.prepare(
			`
			INSERT INTO audits (
				url,
				seo,
				security,
				performance,
				accessibility,
				issues,
				response_time,
				cached
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`
		)
			.bind(
				url,
				result.scores.seo,
				result.scores.security,
				result.scores.performance,
				result.scores.accessibility,
				JSON.stringify(result.issues),
				result.meta.responseTimeMs,
				(result.cached = 0)
			)
			.run();

		// 🧠 Store in KV for 10 minutes
		await env.AUDIT_CACHE.put(key, JSON.stringify(result), { expirationTtl: 600 });

		return new Response(JSON.stringify({ ...result, cached: false }), {
			headers: {
				...corsHeaders(),
				'Content-Type': 'application/json',
			},
		});
	},
};

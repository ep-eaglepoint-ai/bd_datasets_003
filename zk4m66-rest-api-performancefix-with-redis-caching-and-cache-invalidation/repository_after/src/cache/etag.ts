import { createHash } from 'crypto'

export function computeEtag(payload: unknown): string {
	const json = JSON.stringify(payload)
	const hash = createHash('sha256').update(json).digest('hex')
	return `"${hash}"`
}

export function isNotModified(
	reqEtag: string | undefined,
	currentEtag: string,
): boolean {
	if (!reqEtag) return false

	const normalized = reqEtag
		.split(',')
		.map((t) => t.trim())
		.map((t) => (t.startsWith('W/') ? t.slice(2) : t))

	return normalized.includes(currentEtag)
}

export function setEtagHeaders(res: any, etag: string, maxAgeSeconds: number) {
	res.setHeader('ETag', etag)
	res.setHeader(
		'Cache-Control',
		`private, max-age=${maxAgeSeconds}, must-revalidate`,
	)
}

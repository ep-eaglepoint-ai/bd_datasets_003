
function getRoutes(app) {
	const routes = []

	function extract(stack, prefix = '') {
		stack.forEach((layer) => {
			if (layer.route) {
				const path = prefix + layer.route.path

				Object.keys(layer.route.methods).forEach((method) => {
					routes.push({
						method: method.toUpperCase(),
						path,
					})
				})
			} else if (layer.name === 'router' && layer.handle.stack) {
				extract(layer.handle.stack, prefix)
			}
		})
	}

	if (!app || !app._router || !app._router.stack) {
		throw new Error('Invalid Express app: cannot introspect routes')
	}

	extract(app._router.stack)

	const unique = []
	const seen = new Set()

	routes.forEach((r) => {
		const key = `${r.method} ${r.path}`
		if (!seen.has(key)) {
			seen.add(key)
			unique.push(r)
		}
	})

	return unique
}

module.exports = {
	getRoutes,
}

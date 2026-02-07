const { getPaths } = require('@redwoodjs/project-config')
try {
    const paths = getPaths()
    console.log('Project Paths:', JSON.stringify(paths, null, 2))
} catch (e) {
    console.error('Error getting paths:', e)
}

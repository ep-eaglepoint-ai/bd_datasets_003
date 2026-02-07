const request = require('supertest')

const { app, resetData } = require('../../repository_after/src/app')

function reset() {
	resetData()
}

module.exports = {
	app,
	request: request(app),
	reset,
}

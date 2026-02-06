// import { defineConfig } from 'drizzle-kit';

// export default defineConfig({
// 	schema: './src/lib/server/db/schema.ts',
// 	out: './drizzle',
// 	dialect: 'sqlite',
// 	dbCredentials: { url: 'file:./sqlite.db' },
// 	verbose: true,
// 	strict: true
// });

import type { Config } from 'drizzle-kit';

export default {
	schema: './src/lib/server/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: {
		url: './sqlite.db'
	},
	out: './src/lib/server/db/migrations'
} satisfies Config;

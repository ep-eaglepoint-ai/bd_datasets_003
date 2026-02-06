import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull().unique(),
	password: text('password').notNull(),
	name: text('name').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const movies = sqliteTable('movies', {
	id: integer('id').primaryKey(), // TMDB movie ID
	title: text('title').notNull(),
	overview: text('overview'),
	posterPath: text('poster_path'),
	releaseDate: text('release_date'),
	voteAverage: integer('vote_average'), // Store as integer (multiply by 10)
	runtime: integer('runtime'),
	genres: text('genres'), // JSON string
	cast: text('cast') // JSON string
});

export const userMovies = sqliteTable('user_movies', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	movieId: integer('movie_id')
		.notNull()
		.references(() => movies.id, { onDelete: 'cascade' }),
	status: text('status').notNull(), // 'want_to_watch', 'watching', 'watched'
	rating: integer('rating'), // 1-5 stars
	review: text('review'),
	watchedAt: integer('watched_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const customLists = sqliteTable('custom_lists', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export const listMovies = sqliteTable('list_movies', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	listId: integer('list_id')
		.notNull()
		.references(() => customLists.id, { onDelete: 'cascade' }),
	movieId: integer('movie_id')
		.notNull()
		.references(() => movies.id, { onDelete: 'cascade' }),
	position: integer('position').notNull().default(0),
	addedAt: integer('added_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Movie = typeof movies.$inferSelect;
export type UserMovie = typeof userMovies.$inferSelect;
export type CustomList = typeof customLists.$inferSelect;
export type ListMovie = typeof listMovies.$inferSelect;

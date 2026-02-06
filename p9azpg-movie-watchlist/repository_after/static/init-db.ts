// import * as schema from '../src/lib/server/db/schema';
// import { drizzle } from 'drizzle-orm/better-sqlite3';
// import Database from 'better-sqlite3';


// const sqlite = new Database('sqlite.db');
// const db = drizzle(sqlite, { schema });

// // Create tables
// sqlite.exec(`
// CREATE TABLE IF NOT EXISTS users (
// 	id INTEGER PRIMARY KEY AUTOINCREMENT,
// 	email TEXT NOT NULL UNIQUE,
// 	password TEXT NOT NULL,
// 	name TEXT NOT NULL,
// 	created_at INTEGER NOT NULL DEFAULT (unixepoch())
// );

// CREATE TABLE IF NOT EXISTS sessions (
// 	id TEXT PRIMARY KEY,
// 	user_id INTEGER NOT NULL,
// 	expires_at INTEGER NOT NULL,
// 	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
// );

// CREATE TABLE IF NOT EXISTS movies (
// 	id INTEGER PRIMARY KEY,
// 	title TEXT NOT NULL,
// 	overview TEXT,
// 	poster_path TEXT,
// 	release_date TEXT,
// 	vote_average INTEGER,
// 	runtime INTEGER,
// 	genres TEXT,
// 	cast TEXT
// );

// CREATE TABLE IF NOT EXISTS user_movies (
// 	id INTEGER PRIMARY KEY AUTOINCREMENT,
// 	user_id INTEGER NOT NULL,
// 	movie_id INTEGER NOT NULL,
// 	status TEXT NOT NULL,
// 	rating INTEGER,
// 	review TEXT,
// 	watched_at INTEGER,
// 	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
// 	updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
// 	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
// 	FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
// 	UNIQUE(user_id, movie_id)
// );

// CREATE TABLE IF NOT EXISTS custom_lists (
// 	id INTEGER PRIMARY KEY AUTOINCREMENT,
// 	user_id INTEGER NOT NULL,
// 	name TEXT NOT NULL,
// 	description TEXT,
// 	created_at INTEGER NOT NULL DEFAULT (unixepoch()),
// 	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
// );

// CREATE TABLE IF NOT EXISTS list_movies (
// 	id INTEGER PRIMARY KEY AUTOINCREMENT,
// 	list_id INTEGER NOT NULL,
// 	movie_id INTEGER NOT NULL,
// 	position INTEGER NOT NULL DEFAULT 0,
// 	added_at INTEGER NOT NULL DEFAULT (unixepoch()),
// 	FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE,
// 	FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
// 	UNIQUE(list_id, movie_id)
// );

// CREATE INDEX IF NOT EXISTS idx_user_movies_user_id ON user_movies(user_id);
// CREATE INDEX IF NOT EXISTS idx_user_movies_status ON user_movies(status);
// CREATE INDEX IF NOT EXISTS idx_custom_lists_user_id ON custom_lists(user_id);
// CREATE INDEX IF NOT EXISTS idx_list_movies_list_id ON list_movies(list_id);
// `);

// console.log('Database initialized successfully!');
// sqlite.close();
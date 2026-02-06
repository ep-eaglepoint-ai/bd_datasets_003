import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './db_init.js';

const app = express();

app.use(cors({
    origin: 'http://localhost:5173', // Vite dev URL
    allowedHeaders: ['Content-Type', 'If-Unmodified-Since'],
    methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json());

app.post('/reports', async (req, res) => {
    const report = req.body;
    const clientIfUnmodifiedSince = req.headers['if-unmodified-since'];

    try {
        // 1. Conflict Detection Logic
        const existing = await pool.query('SELECT last_modified FROM reports WHERE id = $1', [report.id]);

        if (existing.rows.length > 0) {
            const serverLastModified = parseInt(existing.rows[0].last_modified);
            const clientLastModified = new Date(clientIfUnmodifiedSince).getTime();

            // If server version is newer than what the client thinks, block the update
            if (serverLastModified > clientLastModified) {
                return res.status(412).json({ error: 'Conflict: Server has a newer version.' });
            }
        }

        // 2. Upsert (Update or Insert) Logic
        const query = `
            INSERT INTO reports (id, technician, location, notes, status, details, last_modified)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
                technician = EXCLUDED.technician,
                location = EXCLUDED.location,
                notes = EXCLUDED.notes,
                status = EXCLUDED.status,
                details = EXCLUDED.details,
                last_modified = EXCLUDED.last_modified
            RETURNING *;
            `;

        const values = [
            report.id,
            report.technician,
            report.location,
            report.notes,
            report.details.equipmentStatus,
            report.details,
            report.last_modified
        ];

        const result = await pool.query(query, values);
        console.log(`Report ${report.id} synchronized.`);
        res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Remote API running on http://localhost:${port}`));
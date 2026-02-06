import { Client } from 'pg';

export function createConnection(): Promise<Client> {
    const client = new Client({
        host: process.env.PGHOST ?? 'localhost',
        port: parseInt(process.env.PGPORT ?? '5432', 10),
        database: process.env.PGDATABASE ?? 'app',
        user: process.env.PGUSER ?? 'app',
        password: process.env.PGPASSWORD ?? '',
    });
    return client.connect().then(() => client);
}

export function closeConnection(client: Client): Promise<void> {
    return client.end();
}

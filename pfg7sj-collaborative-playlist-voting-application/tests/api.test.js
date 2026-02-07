const request = require('supertest');
const app = require('../repository_after/backend/server');
const fs = require('fs');
const path = require('path');

// JSON file storage
const DATA_FILE = path.join(__dirname, '../repository_after/backend/data/playlists.json');

describe('Collaborative Playlist API - Full Requirement Validation', () => {
    let playlistId;
    let songAId;
    let songBId;
    let songCId;

    const user1 = 'USER1234';
    const user2 = 'USER5678';
    const user3 = 'USER9999';

    // known initial data
    beforeAll(() => {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ playlists: [] }, null, 2));
    });

    // create playlist with valid ID
    test('Create playlist and verify ID format', async () => {
        const res = await request(app)
            .post('/api/playlists')
            .send({ name: 'Requirement Test Playlist' });

        expect(res.status).toBe(201);
        expect(res.body.id).toMatch(/^[A-Za-z0-9]{8}$/);
        playlistId = res.body.id;
    });

    // invalid playlist ID
    test('Invalid playlist ID fails', async () => {
        const res = await request(app).get('/api/playlists/INVALID1');
        expect(res.status).toBe(404);
    });

    // add songs, validate duration & queue order
    test('Add songs, validate duration and queue placement', async () => {
        const badDuration = await request(app)
            .post(`/api/playlists/${playlistId}/songs`)
            .send({ title: 'Bad', artist: 'Bad', duration: -5 });

        expect(badDuration.status).toBe(400);

        const zeroDuration = await request(app)
            .post(`/api/playlists/${playlistId}/songs`)
            .send({ title: 'Zero', artist: 'Zero', duration: 0 });

        expect(zeroDuration.status).toBe(400);

        const resA = await request(app)
            .post(`/api/playlists/${playlistId}/songs`)
            .send({ title: 'Song A', artist: 'Artist A', duration: 180 });

        const resB = await request(app)
            .post(`/api/playlists/${playlistId}/songs`)
            .send({ title: 'Song B', artist: 'Artist B', duration: 200 });

        songAId = resA.body.id;
        songBId = resB.body.id;

        expect(songAId).toMatch(/^[A-Za-z0-9]{8}$/);
        expect(songBId).toMatch(/^[A-Za-z0-9]{8}$/);

        const queue = await request(app).get(`/api/playlists/${playlistId}/queue`);
        expect(queue.body[0].id).toBe(songAId);
        expect(queue.body[1].id).toBe(songBId);

        // new songs start with score 0
        expect(queue.body[0].score).toBe(0);
        expect(queue.body[1].score).toBe(0);
    });

    // vote replacement and validation
    test('Vote replacement and invalid user ID', async () => {
        const badUser = await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songAId}/vote`)
            .send({ userId: 'BAD', direction: 'up' });

        expect(badUser.status).toBe(400);

        await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songAId}/vote`)
            .send({ userId: user1, direction: 'up' });

        const replace = await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songAId}/vote`)
            .send({ userId: user1, direction: 'down' });

        expect(replace.body.score).toBe(-1);

        const q = await request(app).get(`/api/playlists/${playlistId}/queue`);
        expect(q.body.find(s => s.id === songAId).score).toBe(-1);
    });

    // same user cannot stack votes
    test('Same user voting twice does not stack', async () => {
        await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songAId}/vote`)
            .send({ userId: user1, direction: 'down' });

        const res = await request(app).get(`/api/playlists/${playlistId}/queue`);
        const song = res.body.find(s => s.id === songAId);

        expect(song.score).toBe(-1);
    });

    // multiple users voting
    test('Multiple users voting accumulate correctly', async () => {
        await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songBId}/vote`)
            .send({ userId: user1, direction: 'up' });

        await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songBId}/vote`)
            .send({ userId: user2, direction: 'up' });

        const res2 = await request(app).get(`/api/playlists/${playlistId}/queue`);
        expect(res2.body.find(s => s.id === songBId).score).toBe(2);
    });

    // reorder by score
    test('Queue reorders by highest score', async () => {
        const res3 = await request(app).get(`/api/playlists/${playlistId}/queue`);
        expect(res3.body[0].id).toBe(songBId);
    });

    // tie breaker by earliest added
    test('Tie breaker keeps earlier song first when scores are equal', async () => {
        await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songAId}/vote`)
            .send({ userId: 'USER8888', direction: 'up' }); // A: -1 → 0

        await new Promise(r => setTimeout(r, 5));

        const resC = await request(app)
            .post(`/api/playlists/${playlistId}/songs`)
            .send({ title: 'Song C', artist: 'Artist C', duration: 150 });

        songCId = resC.body.id;

        const res = await request(app).get(`/api/playlists/${playlistId}/queue`);

        const aIndex = res.body.findIndex(s => s.id === songAId);
        const cIndex = res.body.findIndex(s => s.id === songCId);

        expect(aIndex).toBeLessThan(cIndex);
    });



    // invalid vote direction
    test('Invalid vote direction fails without changing state', async () => {
        const before = await request(app).get(`/api/playlists/${playlistId}/queue`);

        const res = await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songAId}/vote`)
            .send({ userId: user3, direction: 'sideways' });

        expect(res.status).toBe(400);

        const after = await request(app).get(`/api/playlists/${playlistId}/queue`);
        expect(after.body).toEqual(before.body);
    });

    // remove song and delete votes
    test('Remove song deletes votes and updates queue', async () => {
        await request(app)
            .post(`/api/playlists/${playlistId}/songs/${songBId}/vote`)
            .send({ userId: user3, direction: 'up' });

        const res = await request(app)
            .delete(`/api/playlists/${playlistId}/songs/${songBId}`);

        expect(res.status).toBe(200);

        const check = await request(app).get(`/api/playlists/${playlistId}/queue`);
        expect(check.body.find(s => s.id === songBId)).toBeUndefined();
    });

    test('Stats update correctly after song removal', async () => {
        const stats = await request(app).get(`/api/playlists/${playlistId}/stats`);

        expect(stats.body.totalSongs).toBe(2);
        expect(stats.body.totalVotes).toBe(2);
        expect(stats.body.totalDuration).toBe(330);
    });


    // remove invalid song
    test('Remove invalid song fails', async () => {
        const res = await request(app)
            .delete(`/api/playlists/${playlistId}/songs/NOTFOUND1`);
        expect(res.status).toBe(404);
    });

    // stats API
    test('Retrieve playlist statistics with correct values', async () => {
        const res = await request(app).get(`/api/playlists/${playlistId}/stats`);

        expect(res.status).toBe(200);

        // song count
        expect(res.body.totalSongs).toBe(2);

        expect(res.body.upVotes).toBe(1);
        expect(res.body.downVotes).toBe(1);
        expect(res.body.totalVotes).toBe(2);

        expect(res.body.totalDuration).toBe(330);

        expect(res.body.averageDuration).toBe(Math.floor(330 / 2));
    });


    // empty playlist
    test('Empty playlist returns empty queue', async () => {
        const list = await request(app)
            .post('/api/playlists')
            .send({ name: 'Empty Playlist' });

        const resEmpty = await request(app).get(`/api/playlists/${list.body.id}/queue`);
        expect(resEmpty.body.length).toBe(0);
    });
});

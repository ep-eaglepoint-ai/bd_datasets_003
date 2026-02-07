const request = require('supertest');
const app = require('../repository_after/server/index');
const { polls } = require('../repository_after/server/utils/pollUtils');

describe('Poll API', () => {
  beforeEach(() => {
    Object.keys(polls).forEach(key => delete polls[key]);
  });

  describe('POST /api/polls', () => {
    it('should create a poll with valid data', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('pollId');
      expect(res.body.pollId).toHaveLength(6);
    });

    it('should reject poll with empty question', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({
          question: '',
          options: ['Pizza', 'Sushi']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Question is required');
    });

    it('should reject poll with only 1 option', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Poll must have at least 2 options');
    });

    it('should reject poll with 6 options', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['A', 'B', 'C', 'D', 'E', 'F']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Poll cannot have more than 5 options');
    });

    it('should reject poll with empty option string', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', '']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Empty option strings are not allowed');
    });

    it('should reject poll with whitespace-only option', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', '   ']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Empty option strings are not allowed');
    });

    it('should reject poll with empty option in middle', async () => {
      const res = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', '', 'Sushi']
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Empty option strings are not allowed');
    });
  });

  describe('GET /api/polls/:id', () => {
    it('should get poll with 0 votes showing 0% percentages', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app).get(`/api/polls/${pollId}`);

      expect(res.status).toBe(200);
      expect(res.body.percentages).toEqual([0, 0]);
    });

    it('should return 404 for non-existent poll', async () => {
      const res = await request(app).get('/api/polls/INVALID');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Poll not found');
    });
  });

  describe('POST /api/polls/:id/vote', () => {
    it('should accept valid vote and return results', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 0, voterId: 'voter1' });

      expect(res.status).toBe(200);
      expect(res.body.votes[0]).toBe(1);
      expect(res.body.percentages[0]).toBe(100);
    });

    it('should reject vote without voterId', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('voterId is required');
    });

    it('should reject invalid option index', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 99, voterId: 'voter1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid option');
    });

    it('should reject negative option index', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: -1, voterId: 'voter1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid option');
    });

    it('should reject float option index', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 1.5, voterId: 'voter1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid option');
    });

    it('should reject NaN option index', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: NaN, voterId: 'voter1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid option');
    });

    it('should reject null option index', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: null, voterId: 'voter1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid option');
    });
  });

  describe('Percentage calculations', () => {
    it('should calculate percentages that sum to 100%', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Test?',
          options: ['A', 'B', 'C']
        });

      const pollId = createRes.body.pollId;

      await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 0, voterId: 'voter1' });
      await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 1, voterId: 'voter2' });
      const res = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 2, voterId: 'voter3' });

      const sum = res.body.percentages.reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });
  });

  describe('GET /api/polls/:id/results', () => {
    it('should get poll results successfully', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi', 'Tacos']
        });

      const pollId = createRes.body.pollId;

      // Cast some votes
      await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 0, voterId: 'voter1' });
      await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 0, voterId: 'voter2' });
      await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 1, voterId: 'voter3' });

      const res = await request(app).get(`/api/polls/${pollId}/results`);

      expect(res.status).toBe(200);
      expect(res.body.question).toBe('Lunch?');
      expect(res.body.options).toEqual(['Pizza', 'Sushi', 'Tacos']);
      expect(res.body.votes).toEqual([2, 1, 0]);
      expect(res.body.percentages).toEqual([67, 33, 0]);
    });

    it('should return 404 for non-existent poll results', async () => {
      const res = await request(app).get('/api/polls/INVALID/results');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Poll not found');
    });

    it('should return results with 0% when no votes', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Test?',
          options: ['A', 'B']
        });

      const pollId = createRes.body.pollId;

      const res = await request(app).get(`/api/polls/${pollId}/results`);

      expect(res.status).toBe(200);
      expect(res.body.votes).toEqual([0, 0]);
      expect(res.body.percentages).toEqual([0, 0]);
    });
  });

  describe('Duplicate vote prevention', () => {
    it('should return 403 "Already voted" when voter tries to vote twice', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;
      const voterId = 'user123';

      // First vote should succeed
      const res1 = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 0, voterId });

      expect(res1.status).toBe(200);
      expect(res1.body.votes[0]).toBe(1);

      // Second vote with same voterId should fail with 403
      const res2 = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 1, voterId });

      expect(res2.status).toBe(403);
      expect(res2.body.error).toBe('Already voted');
    });

    it('should track different voters separately', async () => {
      const createRes = await request(app)
        .post('/api/polls')
        .send({
          question: 'Lunch?',
          options: ['Pizza', 'Sushi']
        });

      const pollId = createRes.body.pollId;

      // First voter
      const res1 = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 0, voterId: 'user1' });

      expect(res1.status).toBe(200);

      // Second voter (different ID)
      const res2 = await request(app)
        .post(`/api/polls/${pollId}/vote`)
        .send({ optionIndex: 1, voterId: 'user2' });

      expect(res2.status).toBe(200);
      expect(res2.body.votes).toEqual([1, 1]);
    });
  });
});

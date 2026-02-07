import request from 'supertest';
import app from '../../repository_after/backend/server';
import { resetBoard } from '../../repository_after/backend/boardStore';

describe('Backend Move Validation', () => {
    beforeEach(() => {
        resetBoard();
    });

    it('should successfully move a card', async () => {
        const response = await request(app)
            .post('/api/move')
            .set('Content-Type', 'application/json')
            .send({
                cardId: 'card-1',
                sourceColumnId: 'col-1',
                targetColumnId: 'col-2',
                targetIndex: 0
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.board.columns[0].cards).toHaveLength(1);
        expect(response.body.board.columns[1].cards).toHaveLength(2);
        expect(response.body.board.columns[1].cards[0].id).toBe('card-1');
    });

    it('should return 400 for invalid target column', async () => {
        const response = await request(app)
            .post('/api/move')
            .set('Content-Type', 'application/json')
            .send({
                cardId: 'card-1',
                sourceColumnId: 'col-1',
                targetColumnId: 'non-existent',
                targetIndex: 0
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Target column not found');
    });

    it('should return 400 for invalid target index (negative)', async () => {
        const response = await request(app)
            .post('/api/move')
            .set('Content-Type', 'application/json')
            .send({
                cardId: 'card-1',
                sourceColumnId: 'col-1',
                targetColumnId: 'col-2',
                targetIndex: -1
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid target index');
    });

    it('should return 400 for invalid target index (out of bounds)', async () => {
        const response = await request(app)
            .post('/api/move')
            .set('Content-Type', 'application/json')
            .send({
                cardId: 'card-1',
                sourceColumnId: 'col-1',
                targetColumnId: 'col-2',
                targetIndex: 10
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid target index');
    });
});

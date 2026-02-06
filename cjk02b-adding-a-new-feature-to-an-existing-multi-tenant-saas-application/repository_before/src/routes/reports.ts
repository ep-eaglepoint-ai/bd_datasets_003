import { Router, Request, Response } from 'express';
import { createConnection, closeConnection } from '../db/client';
import { getActiveUserIds, getUserById } from '../db/users';
import { getOrdersByUserId } from '../db/orders';

const router = Router();

router.get('/reports/active-users-orders', (_req: Request, res: Response): void => {
    createConnection()
        .then((client) => {
            return getActiveUserIds(client).then((rows) => {
                const userIds = rows.map((r) => r.id);
                const userPromises = userIds.map((id) => getUserById(client, id));
                return Promise.all(userPromises).then((users) => {
                    const ordersPromises = userIds.map((userId) => getOrdersByUserId(client, userId));
                    return Promise.all(ordersPromises).then((ordersPerUser) => {
                        closeConnection(client);
                        const body = userIds.map((userId, i) => {
                            const user = users[i];
                            const orders = ordersPerUser[i];
                            return {
                                id: user!.id,
                                name: user!.name,
                                email: user!.email,
                                created_at: user!.created_at,
                                orders,
                            };
                        });
                        res.status(200).json(body);
                    });
                });
            });
        })
        .catch((err) => {
            res.status(500).json({ error: 'Internal server error', message: err.message });
        });
});

export default router;

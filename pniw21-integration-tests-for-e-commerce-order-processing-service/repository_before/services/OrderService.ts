import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { InventoryService } from './InventoryService';
import { PaymentService } from './PaymentService';
import { ShippingService } from './ShippingService';

export interface OrderItem {
    productId: string;
    quantity: number;
    pricePerUnit: number;
}

export interface ShippingAddress {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
}

export interface CreateOrderRequest {
    userId: string;
    items: OrderItem[];
    shippingAddress: ShippingAddress;
    idempotencyKey: string;
}

export interface Order {
    id: string;
    userId: string;
    items: OrderItem[];
    subtotal: number;
    shippingCost: number;
    total: number;
    status: string;
    shippingAddress: ShippingAddress;
    createdAt: Date;
    updatedAt: Date;
}

export interface RefundItem {
    productId: string;
    quantity: number;
}

export class OrderService {
    private pool: Pool;
    private redis: Redis;
    private inventoryService: InventoryService;
    private paymentService: PaymentService;
    private shippingService: ShippingService;

    constructor(
        pool: Pool,
        redis: Redis,
        inventoryService: InventoryService,
        paymentService: PaymentService,
        shippingService: ShippingService
    ) {
        this.pool = pool;
        this.redis = redis;
        this.inventoryService = inventoryService;
        this.paymentService = paymentService;
        this.shippingService = shippingService;
    }

    async createOrder(request: CreateOrderRequest): Promise<Order> {
        const existingOrderId = await this.redis.get(`idempotency:${request.idempotencyKey}`);
        if (existingOrderId) {
            return this.getOrderById(existingOrderId);
        }

        for (const item of request.items) {
            const available = await this.inventoryService.getAvailableQuantity(item.productId);
            if (available < item.quantity) {
                throw new Error(`Insufficient inventory for product ${item.productId}`);
            }
        }

        for (const item of request.items) {
            const reserved = await this.inventoryService.reserve(item.productId, item.quantity);
            if (!reserved) {
                for (const prevItem of request.items) {
                    if (prevItem.productId === item.productId) break;
                    await this.inventoryService.release(prevItem.productId, prevItem.quantity);
                }
                throw new Error(`Insufficient inventory for product ${item.productId}`);
            }
        }

        const subtotal = request.items.reduce(
            (sum, item) => sum + item.quantity * item.pricePerUnit,
            0
        );
        const shippingCost = this.shippingService.calculateShippingCost(
            request.shippingAddress,
            request.items
        );
        const total = subtotal + shippingCost;

        const orderResult = await this.pool.query(
            `INSERT INTO orders (user_id, items, subtotal, shipping_cost, total, status, shipping_address)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6)
             RETURNING *`,
            [
                request.userId,
                JSON.stringify(request.items),
                subtotal,
                shippingCost,
                total,
                JSON.stringify(request.shippingAddress),
            ]
        );

        const order = this.mapRowToOrder(orderResult.rows[0]);

        try {
            await this.paymentService.charge({
                amount: Math.round(total * 100),
                currency: 'usd',
                metadata: {
                    orderId: order.id,
                    customerId: request.userId,
                },
                idempotencyKey: request.idempotencyKey,
            });

            for (const item of request.items) {
                await this.inventoryService.confirmReservation(item.productId, item.quantity);
            }

            await this.pool.query(
                `UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
                [order.id]
            );
            order.status = 'paid';

            await this.redis.setex(
                `idempotency:${request.idempotencyKey}`,
                86400,
                order.id
            );

            return order;
        } catch (error) {
            for (const item of request.items) {
                await this.inventoryService.release(item.productId, item.quantity);
            }

            await this.pool.query(
                `UPDATE orders SET status = 'payment_failed', updated_at = NOW() WHERE id = $1`,
                [order.id]
            );
            order.status = 'payment_failed';

            throw error;
        }
    }

    async getOrderById(orderId: string): Promise<Order> {
        const result = await this.pool.query(
            `SELECT * FROM orders WHERE id = $1`,
            [orderId]
        );

        if (result.rows.length === 0) {
            throw new Error('Order not found');
        }

        return this.mapRowToOrder(result.rows[0]);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const order = await this.getOrderById(orderId);

        if (!['pending', 'paid'].includes(order.status)) {
            throw new Error('Order cannot be cancelled');
        }

        if (order.status === 'paid') {
            const paymentIntent = await this.paymentService.findPaymentByOrderId(orderId);
            if (paymentIntent) {
                await this.paymentService.refund(paymentIntent.id, Math.round(order.total * 100));
            }
        }

        for (const item of order.items) {
            await this.inventoryService.release(item.productId, item.quantity);
        }

        await this.pool.query(
            `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
            [orderId]
        );

        order.status = 'cancelled';
        return order;
    }

    async processRefund(orderId: string, itemsToRefund: RefundItem[]): Promise<Order> {
        const order = await this.getOrderById(orderId);

        if (order.status !== 'paid') {
            throw new Error('Order cannot be refunded');
        }

        let refundAmount = 0;
        for (const refundItem of itemsToRefund) {
            const orderItem = order.items.find((i) => i.productId === refundItem.productId);
            if (!orderItem) {
                throw new Error(`Product ${refundItem.productId} not in order`);
            }
            if (refundItem.quantity > orderItem.quantity) {
                throw new Error('Cannot refund more than ordered quantity');
            }
            refundAmount += refundItem.quantity * orderItem.pricePerUnit;
        }

        const paymentIntent = await this.paymentService.findPaymentByOrderId(orderId);
        if (!paymentIntent) {
            throw new Error('Payment not found for order');
        }

        await this.paymentService.refund(paymentIntent.id, Math.round(refundAmount * 100));

        for (const refundItem of itemsToRefund) {
            await this.inventoryService.release(refundItem.productId, refundItem.quantity);
        }

        await this.pool.query(
            `INSERT INTO refunds (order_id, items, amount) VALUES ($1, $2, $3)`,
            [orderId, JSON.stringify(itemsToRefund), refundAmount]
        );

        const totalRefunded = itemsToRefund.reduce((sum, item) => {
            const orderItem = order.items.find((i) => i.productId === item.productId);
            return sum + item.quantity;
        }, 0);

        const totalOrdered = order.items.reduce((sum, item) => sum + item.quantity, 0);

        if (totalRefunded === totalOrdered) {
            await this.pool.query(
                `UPDATE orders SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
                [orderId]
            );
            order.status = 'refunded';
        }

        return order;
    }

    private mapRowToOrder(row: any): Order {
        return {
            id: row.id,
            userId: row.user_id,
            items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
            subtotal: parseFloat(row.subtotal),
            shippingCost: parseFloat(row.shipping_cost),
            total: parseFloat(row.total),
            status: row.status,
            shippingAddress:
                typeof row.shipping_address === 'string'
                    ? JSON.parse(row.shipping_address)
                    : row.shipping_address,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}

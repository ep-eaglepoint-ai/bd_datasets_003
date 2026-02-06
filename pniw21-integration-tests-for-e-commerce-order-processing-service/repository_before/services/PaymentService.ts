import Stripe from 'stripe';

export interface ChargeRequest {
    amount: number;
    currency: string;
    metadata: {
        orderId: string;
        customerId: string;
    };
    idempotencyKey: string;
}

export class PaymentService {
    private stripe: Stripe;

    constructor(secretKey: string) {
        this.stripe = new Stripe(secretKey, {
            apiVersion: '2023-10-16',
        });
    }

    async charge(request: ChargeRequest): Promise<Stripe.PaymentIntent> {
        const paymentIntent = await this.stripe.paymentIntents.create(
            {
                amount: request.amount,
                currency: request.currency,
                metadata: request.metadata,
                confirm: true,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: 'never',
                },
            },
            {
                idempotencyKey: request.idempotencyKey,
            }
        );

        if (paymentIntent.status !== 'succeeded') {
            throw new Error(`Payment failed with status: ${paymentIntent.status}`);
        }

        return paymentIntent;
    }

    async findPaymentByOrderId(orderId: string): Promise<Stripe.PaymentIntent | null> {
        const result = await this.stripe.paymentIntents.search({
            query: `metadata['orderId']:'${orderId}'`,
        });

        return result.data.length > 0 ? result.data[0] : null;
    }

    async refund(paymentIntentId: string, amount: number): Promise<Stripe.Refund> {
        return this.stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount,
        });
    }

    verifyWebhookSignature(
        payload: string | Buffer,
        signature: string,
        webhookSecret: string
    ): Stripe.Event {
        return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }
}

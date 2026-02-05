import { EventEmitter } from 'events'; 

/*
 * EventEmitter is used here to trigger side-effects like analytics and logging. 
 * It provides no transactional guarantees and operates asynchronously. 
 */

import { DatabaseClient } from '../infrastructure/db';

/* 
 * DatabaseClient provides standard CRUD operations. 
 * It supports atomic transactions through the .transaction() method which returns a session object.
 */

import { WebhookService } from '../infrastructure/webhooks';

/* 
 * WebhookService handles outgoing HTTP calls to partner APIs.
 * It is subject to timeouts and 5xx errors from external vendors.
 */

export interface TransactionRequest {
  idempotencyKey: string;
  senderId: string;
  receiverId: string;
  amount: number;
  currency: string;
}

export interface Account {
  id: string;
  balance: number;
  status: 'active' | 'frozen';
}

export class TransactionEngine {
  private events: EventEmitter;
  private db: DatabaseClient;
  private webhooks: WebhookService;

  constructor(db: DatabaseClient, webhooks: WebhookService) {
    this.db = db;
    this.webhooks = webhooks;
    this.events = new EventEmitter();
  }

  /**
   * Executes a transfer between two accounts.
   * Must ensure that the sender has sufficient funds and both accounts are active.
   */
  public async executeTransfer(request: TransactionRequest): Promise<{ success: boolean; txId?: string; error?: string }> {
    const session = await this.db.startSession();
    
    try {
      const result = await session.withTransaction(async () => {
        // Check for existing transaction to ensure idempotency
        const existing = await this.db.findTransactionByKey(request.idempotencyKey);
        if (existing) return { success: true, txId: existing.id };

        const sender = await this.db.getAccount(request.senderId);
        const receiver = await this.db.getAccount(request.receiverId);

        if (!sender || !receiver) throw new Error('ACCOUNT_NOT_FOUND');
        if (sender.balance < request.amount) throw new Error('INSUFFICIENT_FUNDS');
        if (sender.status !== 'active' || receiver.status !== 'active') throw new Error('ACCOUNT_INACTIVE');

        const txId = await this.db.createLedgerEntry({
          senderId: request.senderId,
          receiverId: request.receiverId,
          amount: request.amount,
          key: request.idempotencyKey
        });

        await this.db.updateBalance(request.senderId, -request.amount);
        await this.db.updateBalance(request.receiverId, request.amount);

        return { success: true, txId };
      });

      // Post-transaction side effects
      try {
        await this.webhooks.notify(request.receiverId, { type: 'CREDIT_RECEIVED', amount: request.amount });
      } catch (e) {
        this.events.emit('side_effect_failed', { type: 'WEBHOOK', txId: result.txId });
      }

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      await session.endSession();
    }
  }
}

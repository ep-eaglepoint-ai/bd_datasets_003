import { Transaction } from '../types';

const symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'WMT'];
const types: ('BUY' | 'SELL')[] = ['BUY', 'SELL'];
const statuses: ('PENDING' | 'COMPLETED' | 'CANCELLED')[] = ['PENDING', 'COMPLETED', 'CANCELLED'];
const accounts = ['IRA-001', 'IRA-002', 'BROK-001', 'BROK-002', 'ROTH-001'];
const brokers = ['Fidelity', 'Schwab', 'Vanguard', 'TD Ameritrade', 'E*TRADE'];

export const generateTransactions = (count: number): Transaction[] => {
  const transactions: Transaction[] = [];

  for (let i = 0; i < count; i++) {
    const quantity = Math.floor(Math.random() * 1000) + 1;
    const price = Math.random() * 500 + 10;

    transactions.push({
      id: `txn-${i}`,
      date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      type: types[Math.floor(Math.random() * types.length)],
      quantity,
      price: Math.round(price * 100) / 100,
      total: Math.round(quantity * price * 100) / 100,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      account: accounts[Math.floor(Math.random() * accounts.length)],
      broker: brokers[Math.floor(Math.random() * brokers.length)],
    });
  }

  return transactions;
};

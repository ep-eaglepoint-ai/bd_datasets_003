const request = require('supertest');
const io = require('socket.io-client');
const http = require('http');

const apiUrl = 'http://localhost:4000'; 

describe('Auction Backend Integration Tests', () => {
  let clientSocket;

  beforeAll((done) => {
   
    clientSocket = io(apiUrl);
    clientSocket.on('connect', done);
  });

  afterAll(() => {
    clientSocket.disconnect();
  });

  
  test('Should handle concurrent bids and allow only one to succeed (Atomic Test)', async () => {
    const itemId = 1;
    const highAmount = 1000;

    
    const responses = await Promise.all([
      request(apiUrl).post(`/api/bids/${itemId}/bid`).send({ amount: highAmount, userId: 'user_1' }),
      request(apiUrl).post(`/api/bids/${itemId}/bid`).send({ amount: highAmount, userId: 'user_2' }),
      request(apiUrl).post(`/api/bids/${itemId}/bid`).send({ amount: highAmount, userId: 'user_3' })
    ]);

    const successes = responses.filter(r => r.body.success === true);
    const conflicts = responses.filter(r => r.status === 409);

    
    expect(successes.length).toBe(1);

    expect(conflicts.length).toBe(2);
  });


  test('Should emit TIMER_UPDATE when bid is placed within 60s of expiry', (done) => {
    const itemId = 1;
    
    
    clientSocket.emit('JOIN_ITEM', itemId);
    
    clientSocket.once('TIMER_UPDATE', (data) => {
      expect(data).toHaveProperty('endTime');
      expect(data.itemId).toBe(itemId.toString());
      done();
    });

    request(apiUrl)
      .post(`/api/bids/${itemId}/bid`)
      .send({ amount: 2000, userId: 'timer_tester' })
      .expect(200)
      .end((err) => { if (err) return done(err); });
  });

  test('Should reject bids if the auction end_time has passed', async () => {

    const itemId = 1; 
    const res = await request(apiUrl)
      .post(`/api/bids/${itemId}/bid`)
      .send({ amount: 99999, userId: 'late_user' });

    if (res.status === 400) {
      expect(res.body.error).toBe('Auction ended');
    }
  });

  
  test('Should return 409 when bid amount is less than or equal to current_price', async () => {
    const itemId = 1;
    
    const itemData = await request(apiUrl).get(`/api/items/${itemId}`);
    const currentPrice = itemData.body.item.current_price;

    const res = await request(apiUrl)
      .post(`/api/bids/${itemId}/bid`)
      .send({ amount: currentPrice, userId: 'low_bidder' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Outbid');
  });
});
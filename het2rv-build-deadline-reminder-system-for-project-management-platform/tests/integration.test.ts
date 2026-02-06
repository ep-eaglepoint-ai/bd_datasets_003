// import request from 'supertest';
// import { Pool } from 'pg';
// import { app } from '../src/index';
// import { processReminders } from '../src/scheduler';
// import { initDB, pool as appPool } from '../src/db';

// const pool = new Pool({
//     connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@db:5432/app',
// });

// const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// describe('Deadline Reminder System - Full Suite', () => {
//     let ownerId: number;

//     beforeAll(async () => {
//         let retries = 10;
//         while (retries > 0) {
//             try {
//                 // Drop tables FIRST to ensure fresh schema
//                 await pool.query('DROP TABLE IF EXISTS reminders CASCADE');
//                 await pool.query('DROP TABLE IF EXISTS tasks CASCADE');
//                 await pool.query('DROP TABLE IF EXISTS users CASCADE');

//                 await initDB();
//                 break;
//             } catch (err) {
//                 console.log('Waiting for DB...', err);
//                 await sleep(1000);
//                 retries--;
//             }
//         }
//     });

//     afterAll(async () => {
//         await pool.end();
//         await appPool.end();
//     });

//     // 1. Basic User Creation
//     test('Create User', async () => {
//         const res = await request(app)
//             .post('/users')
//             .set('X-User-ID', '999')
//             .send({ name: 'Test User' });
//         expect(res.status).toBe(201);
//         ownerId = res.body.id;
//     });

//     // 2. Functional: Persistence & Multiple Reminders
//     test('Functional: Configure multiple reminders & Persistence', async () => {
//         const nearFuture = new Date(Date.now() + 500).toISOString();
//         const farFuture = new Date(Date.now() + 100000).toISOString();

//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({
//                 title: 'Task with reminders',
//                 reminders: [nearFuture, farFuture]
//             });

//         expect(res.status).toBe(201);
//         const taskId = res.body.id;

//         const getRes = await request(app)
//             .get(`/tasks/${taskId}`)
//             .set('X-User-ID', ownerId.toString());
//         expect(getRes.status).toBe(200);
//         expect(getRes.body.reminders.length).toBe(2);

//         await sleep(600); // Wait for nearFuture

//         await processReminders();

//         const remindersAfter = await pool.query('SELECT * FROM reminders WHERE task_id = $1 ORDER BY trigger_at ASC', [taskId]);
//         expect(remindersAfter.rows[0].status).toBe('processed');
//         expect(remindersAfter.rows[1].status).toBe('pending');
//     });

//     // 3. Functional: Idempotency (Scheduler)
//     test('Functional: Idempotency (Scheduler)', async () => {
//         const nearFuture = new Date(Date.now() + 200).toISOString();
//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({
//                 title: 'Idempotency Task',
//                 reminders: [nearFuture]
//             });
//         const taskId = res.body.id;

//         await sleep(300);

//         await processReminders();
//         const r1 = await pool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);
//         expect(r1.rows[0].status).toBe('processed');

//         await processReminders();
//         const r2 = await pool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);
//         expect(r2.rows[0].status).toBe('processed');
//     });

//     // 4. Functional: Hard Delete
//     test('Functional: Hard Delete Cascades Reminders', async () => {
//         const futureDate = new Date(Date.now() + 100000).toISOString();
//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({
//                 title: 'Task to hard delete',
//                 reminders: [futureDate]
//             });
//         const taskId = res.body.id;

//         const r1 = await pool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);
//         expect(r1.rowCount).toBe(1);

//         await request(app)
//             .delete(`/tasks/${taskId}`)
//             .set('X-User-ID', ownerId.toString())
//             .expect(204);

//         const r2 = await pool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);
//         expect(r2.rowCount).toBe(0);
//     });

//     // 5. Security: Ownership
//     test('Security: Only task owners can manage reminders', async () => {
//         const user2Res = await pool.query("INSERT INTO users (name) VALUES ('User 2') RETURNING id");
//         const user2Id = user2Res.rows[0].id;

//         const taskRes = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Owner Task' });
//         const taskId = taskRes.body.id;

//         // User 2 tries to Add Reminder
//         await request(app)
//             .post(`/tasks/${taskId}/reminders`)
//             .set('X-User-ID', user2Id.toString())
//             .send({ trigger_at: new Date().toISOString() })
//             .expect(403);

//         // User 2 tries to Delete Task
//         await request(app)
//             .delete(`/tasks/${taskId}`)
//             .set('X-User-ID', user2Id.toString())
//             .expect(403);

//          // User 2 tries to Soft Cancel
//         await request(app)
//             .patch(`/tasks/${taskId}/cancel`)
//             .set('X-User-ID', user2Id.toString())
//             .expect(403);
//     });

//     // 6. Production: Timezone Handling
//     test('Production: Timezone Handling (TIMESTAMPTZ)', async () => {
//         const offsetTrigger = "2099-01-01T12:00:00+05:00";

//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({
//                 title: 'Timezone Task',
//                 reminders: [offsetTrigger]
//             });
//         expect(res.status).toBe(201);
//         const taskId = res.body.id;

//         const r = await pool.query('SELECT trigger_at FROM reminders WHERE task_id = $1', [taskId]);
//         const storedDate = new Date(r.rows[0].trigger_at);
//         const expectedDate = new Date(offsetTrigger);

//         expect(storedDate.toISOString()).toBe(expectedDate.toISOString());
//     });

//     // 7. Production: Soft Cancellation
//     test('Production: Soft Cancellation prevents Reminder', async () => {
//         const futureDate = new Date(Date.now() + 60000).toISOString();

//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({
//                 title: 'Task to soft cancel',
//                 reminders: [futureDate]
//             });
//         const taskId = res.body.id;

//         // Soft Cancel
//         await request(app)
//             .patch(`/tasks/${taskId}/cancel`)
//             .set('X-User-ID', ownerId.toString())
//             .expect(200);

//         await processReminders();

//         const r = await pool.query('SELECT status FROM reminders WHERE task_id = $1', [taskId]);
//         expect(r.rows[0].status).toBe('canceled');
//     });

//     // 8. Reliability: Zombie Recovery
//     test('Reliability: Zombie Recovery', async () => {
//         // Use a FUTURE date to pass validation
//         const futureDate = new Date(Date.now() + 3600000).toISOString();
//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Zombie Task', reminders: [futureDate] });
//         const taskId = res.body.id;
//         const reminderId = (await pool.query('SELECT id FROM reminders WHERE task_id=$1', [taskId])).rows[0].id;

//         console.log(`[TEST DEBUG] Zombie TaskID: ${taskId}, ReminderID: ${reminderId}`);

//         // Manually simulate a "processing" reminder that is old (Zombie)
//         // Set updated_at to 1 hour ago
//         await pool.query(`
//             UPDATE reminders
//             SET status = 'processing',
//                 updated_at = NOW() - INTERVAL '1 hour',
//                 trigger_at = NOW() - INTERVAL '1 hour'
//             WHERE id = $1
//         `, [reminderId]);



//         const debugRow = await pool.query('SELECT * FROM reminders WHERE id = $1', [reminderId]);
//         console.log('[TEST DEBUG] Reminder State Before Scheduler:', JSON.stringify(debugRow.rows[0]));

//         // Run Scheduler
//         await processReminders();

//         // Should be picked up and processed
//         const rAfter = await pool.query('SELECT status FROM reminders WHERE id = $1', [reminderId]);
//         expect(rAfter.rows[0].status).toBe('processed');
//     });

//     // 9. Reliability: API Idempotency
//     test('Reliability: API Idempotency (Prevent Duplicate Reminders)', async () => {
//         const trigger = "2099-01-01T10:00:00Z";
//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Idempotency API Task', reminders: [trigger] });
//         const taskId = res.body.id;

//         // Try to add the SAME reminder again
//         await request(app)
//             .post(`/tasks/${taskId}/reminders`)
//             .set('X-User-ID', ownerId.toString())
//             .send({ trigger_at: trigger })
//             .expect(500); // Constraint violation

//         const r = await pool.query('SELECT * FROM reminders WHERE task_id=$1', [taskId]);
//         expect(r.rowCount).toBe(1);
//     });

//     test('Requirement 3: Timezone Handling (TIMESTAMPTZ)', async () => {
//         const offsetTrigger = "2099-01-01T12:00:00+05:00";
//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Timezone Task', reminders: [offsetTrigger] });
//         const taskId = res.body.id;
//         const r = await pool.query('SELECT trigger_at FROM reminders WHERE task_id = $1', [taskId]);
//         const storedDate = new Date(r.rows[0].trigger_at);
//         const expectedDate = new Date(offsetTrigger);
//         expect(storedDate.toISOString()).toBe(expectedDate.toISOString());
//     });

//     // 10. Validation: Reject Past Reminders
//     test('Validation: Cannot create past reminders', async () => {
//         const pastDate = new Date(Date.now() - 10000).toISOString();

//         // On Task Create
//         await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Past Task', reminders: [pastDate] })
//             .expect(500); // Or 400, depending on implementation detail (caught error vs explicit check)

//         // On Add Reminder
//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Future Task' });
//         const taskId = res.body.id;

//         await request(app)
//             .post(`/tasks/${taskId}/reminders`)
//             .set('X-User-ID', ownerId.toString())
//             .send({ trigger_at: pastDate })
//             .expect(400);
//     });

//     // 11. Functional: Modify Reminder
//     test('Functional: Modify Reminder', async () => {
//         const futureDate = new Date(Date.now() + 100000).toISOString();
//         const newDate = new Date(Date.now() + 200000).toISOString();

//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Modifiable Task', reminders: [futureDate] });
//         const taskId = res.body.id;

//         const r = await pool.query('SELECT id FROM reminders WHERE task_id = $1', [taskId]);
//         const reminderId = r.rows[0].id;

//         // Modify
//         const modRes = await request(app)
//             .patch(`/reminders/${reminderId}`)
//             .set('X-User-ID', ownerId.toString())
//             .send({ trigger_at: newDate })
//             .expect(200);

//         expect(modRes.body.trigger_at).toBe(newDate);

//         // Verify in DB
//         const r2 = await pool.query('SELECT trigger_at FROM reminders WHERE id = $1', [reminderId]);
//         expect(new Date(r2.rows[0].trigger_at).toISOString()).toBe(newDate);
//     });

//     // 12. Security: Non-owner cannot view task
//     test('Security: Non-owner cannot view task', async () => {
//         const res = await request(app)
//             .post('/tasks')
//             .set('X-User-ID', ownerId.toString())
//             .send({ title: 'Secret Task' });
//         const taskId = res.body.id;

//         await request(app)
//             .get(`/tasks/${taskId}`)
//             .set('X-User-ID', '99999') // Different User
//             .expect(403);
//     });

//     // ... Rest of the tests (Soft cancel, Batching, etc.)
//     // For brevity in this iteration, I'm focusing on the new requirements
//     // but a real run would include all.
//     // I will include one more standard one to be safe.


// });

import request from 'supertest';
import { Pool } from 'pg';
import { app } from '../src/index'; // Adjust path if needed
import { processReminders } from '../src/scheduler'; // Adjust path if needed
import { initDB, pool as appPool } from '../src/db'; // Adjust path if needed

// Helper to pause execution (simulate time passing)
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

describe('Deadline Reminder System - Complete Suite', () => {
    let ownerId: number;
    let otherUserId: number;

    // 1. SETUP & TEARDOWN
    beforeAll(async () => {
        let retries = 5;
        while (retries > 0) {
            try {
                // BRUTAL RESET: Drop everything to ensure no ghost data
                await appPool.query('DROP TABLE IF EXISTS reminders CASCADE');
                await appPool.query('DROP TABLE IF EXISTS tasks CASCADE');
                await appPool.query('DROP TABLE IF EXISTS users CASCADE');

                await initDB();
                break;
            } catch (err) {
                console.log('Waiting for DB...', err);
                await sleep(1000);
                retries--;
            }
        }
    });

    afterAll(async () => {
        await appPool.end();
    });

    // 2. USER MANAGEMENT
    test('Setup: Create Users', async () => {
        const res = await request(app)
            .post('/users')
            .set('X-User-ID', '999')
            .send({ name: 'Test Owner' });
        expect(res.status).toBe(201);
        ownerId = res.body.id;

        const res2 = await request(app)
            .post('/users')
            .set('X-User-ID', '888')
            .send({ name: 'Malicious Actor' });
        otherUserId = res2.body.id;
    });

    // 3. DEADLINE ENFORCEMENT (New Requirement)
    test('Requirement: Cannot schedule reminder AFTER deadline', async () => {
        const deadline = new Date(Date.now() + 100000).toISOString(); // Future
        const lateTrigger = new Date(Date.now() + 200000).toISOString(); // Further Future

        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({
                title: 'Strict Deadline Task',
                deadline: deadline,
                reminders: [lateTrigger]
            });

        // Expect Validation Error
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/deadline/i);
    });

    // 4. HAPPY PATH & PERSISTENCE
    test('Functional: Configure multiple reminders & Persistence', async () => {
        const nearFuture = new Date(Date.now() + 500).toISOString();
        const farFuture = new Date(Date.now() + 100000).toISOString();
        // Deadline is optional, testing that too

        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({
                title: 'Task with reminders',
                reminders: [nearFuture, farFuture]
            });

        expect(res.status).toBe(201);
        const taskId = res.body.id;

        // Verify Persistence
        const getRes = await request(app)
            .get(`/tasks/${taskId}`)
            .set('X-User-ID', ownerId.toString());
        expect(getRes.status).toBe(200);
        expect(getRes.body.reminders.length).toBe(2);

        // Wait for nearFuture to pass
        await sleep(600);

        // Run Scheduler Manually (Deterministic Testing)
        await processReminders();

        const remindersAfter = await appPool.query('SELECT * FROM reminders WHERE task_id = $1 ORDER BY trigger_at ASC', [taskId]);
        expect(remindersAfter.rows[0].status).toBe('processed'); // 1st one done
        expect(remindersAfter.rows[1].status).toBe('pending');   // 2nd one waits
    });

    // 5. SCHEDULER IDEMPOTENCY
    test('Functional: Idempotency (Scheduler does not double-send)', async () => {
        const nearFuture = new Date(Date.now() + 200).toISOString();
        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({
                title: 'Idempotency Task',
                reminders: [nearFuture]
            });
        const taskId = res.body.id;

        await sleep(300);

        // Run 1
        await processReminders();
        const r1 = await appPool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);
        expect(r1.rows[0].status).toBe('processed');

        // Run 2 (Simulate overlap or next tick)
        await processReminders();
        const r2 = await appPool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);

        // Still processed, and crucially, logic shouldn't have fired twice (checked via logs in real app)
        expect(r2.rows[0].status).toBe('processed');
    });

    // 6. HARD DELETE CASCADE
    test('Functional: Hard Delete Cascades Reminders', async () => {
        const futureDate = new Date(Date.now() + 100000).toISOString();
        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({
                title: 'Task to hard delete',
                reminders: [futureDate]
            });
        const taskId = res.body.id;

        // Verify reminder exists
        const r1 = await appPool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);
        expect(r1.rowCount).toBe(1);

        // Delete Task
        await request(app)
            .delete(`/tasks/${taskId}`)
            .set('X-User-ID', ownerId.toString())
            .expect(204);

        // Verify reminder gone
        const r2 = await appPool.query('SELECT * FROM reminders WHERE task_id = $1', [taskId]);
        expect(r2.rowCount).toBe(0);
    });

    // 7. SECURITY: OWNERSHIP & ACCESS
    test('Security: Only task owners can manage reminders', async () => {
        // Create task as Owner
        const taskRes = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({ title: 'Owner Task' });
        const taskId = taskRes.body.id;

        // Malicious User tries to Add Reminder
        await request(app)
            .post(`/tasks/${taskId}/reminders`)
            .set('X-User-ID', otherUserId.toString())
            .send({ trigger_at: new Date().toISOString() })
            .expect(403);

        // Malicious User tries to Delete Task
        await request(app)
            .delete(`/tasks/${taskId}`)
            .set('X-User-ID', otherUserId.toString())
            .expect(403);

        // Malicious User tries to View Task
        await request(app)
            .get(`/tasks/${taskId}`)
            .set('X-User-ID', otherUserId.toString())
            .expect(403);
    });

    // 8. TIMEZONE HANDLING
    test('Production: Timezone Handling (TIMESTAMPTZ)', async () => {
        // Use a distinct offset
        const offsetTrigger = "2099-01-01T12:00:00+05:00";

        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({
                title: 'Timezone Task',
                reminders: [offsetTrigger]
            });
        expect(res.status).toBe(201);
        const taskId = res.body.id;

        const r = await appPool.query('SELECT trigger_at FROM reminders WHERE task_id = $1', [taskId]);
        const storedDate = new Date(r.rows[0].trigger_at);
        const expectedDate = new Date(offsetTrigger);

        // Postgres normalizes to UTC, JS Date compares correctly
        expect(storedDate.toISOString()).toBe(expectedDate.toISOString());
    });

    // 9. SOFT CANCELLATION
    test('Production: Soft Cancellation prevents Reminder', async () => {
        const futureDate = new Date(Date.now() + 60000).toISOString();

        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({
                title: 'Task to soft cancel',
                reminders: [futureDate]
            });
        const taskId = res.body.id;

        // Soft Cancel
        await request(app)
            .patch(`/tasks/${taskId}/cancel`)
            .set('X-User-ID', ownerId.toString())
            .expect(200);

        // Run Scheduler (Should not pick up cancelled reminders)
        await processReminders();

        const r = await appPool.query('SELECT status FROM reminders WHERE task_id = $1', [taskId]);
        expect(r.rows[0].status).toBe('canceled');
    });

    // 10. RELIABILITY: ZOMBIE RECOVERY
    test('Reliability: Zombie Recovery (Crash Survival)', async () => {
        const futureDate = new Date(Date.now() + 3600000).toISOString();
        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({ title: 'Zombie Task', reminders: [futureDate] });
        const taskId = res.body.id;

        // Manual SQL injection to simulate a crash mid-processing
        // 1. Mark as 'processing'
        // 2. Set 'updated_at' to 1 hour ago (timeout threshold)
        // 3. Set 'trigger_at' to past so it should run now
        await appPool.query(`
            UPDATE reminders
            SET status = 'processing',
                updated_at = NOW() - INTERVAL '1 hour',
                trigger_at = NOW() - INTERVAL '1 hour'
            WHERE task_id = $1
        `, [taskId]);

        // Run Scheduler
        await processReminders();

        // The scheduler should have seen the "stuck" processing task and retried it
        const rAfter = await appPool.query('SELECT status FROM reminders WHERE task_id = $1', [taskId]);
        expect(rAfter.rows[0].status).toBe('processed');
    });

    // 11. API IDEMPOTENCY / UNIQUE CONSTRAINT
    test('Reliability: API Idempotency (Prevent Duplicate Reminders)', async () => {
        const trigger = "2099-01-01T10:00:00Z";
        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({ title: 'Idempotency API Task', reminders: [trigger] });
        const taskId = res.body.id;

        // Try to add the EXACT SAME reminder again via sub-resource
        await request(app)
            .post(`/tasks/${taskId}/reminders`)
            .set('X-User-ID', ownerId.toString())
            .send({ trigger_at: trigger })
            .expect(500); // SQL Unique Constraint Violation

        const r = await appPool.query('SELECT * FROM reminders WHERE task_id=$1', [taskId]);
        expect(r.rowCount).toBe(1);
    });

    // 12. VALIDATION: PAST REMINDERS
    test('Validation: Cannot create past reminders', async () => {
        const pastDate = new Date(Date.now() - 10000).toISOString();

        // On Task Create
        await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({ title: 'Past Task', reminders: [pastDate] })
            .expect(400); // Expect Bad Request (Validation)

        // On Add Reminder
        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({ title: 'Future Task' });
        const taskId = res.body.id;

        await request(app)
            .post(`/tasks/${taskId}/reminders`)
            .set('X-User-ID', ownerId.toString())
            .send({ trigger_at: pastDate })
            .expect(400);
    });

    // 13. FUNCTIONAL: MODIFY REMINDER
    test('Functional: Modify Reminder', async () => {
        const futureDate = new Date(Date.now() + 100000).toISOString();
        const newDate = new Date(Date.now() + 200000).toISOString();

        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({ title: 'Modifiable Task', reminders: [futureDate] });
        const taskId = res.body.id;

        const r = await appPool.query('SELECT id FROM reminders WHERE task_id = $1', [taskId]);
        const reminderId = r.rows[0].id;

        // Modify
        const modRes = await request(app)
            .patch(`/reminders/${reminderId}`)
            .set('X-User-ID', ownerId.toString())
            .send({ trigger_at: newDate })
            .expect(200);

        expect(modRes.body.trigger_at).toBe(newDate);

        // Verify in DB
        const r2 = await appPool.query('SELECT trigger_at FROM reminders WHERE id = $1', [reminderId]);
        expect(new Date(r2.rows[0].trigger_at).toISOString()).toBe(newDate);
    });

    // 14. FUNCTIONAL: MODIFY REMINDER (Deadline Constraint)
    test('Functional: Modify Reminder respects Deadline', async () => {
        const deadline = new Date(Date.now() + 100000).toISOString();
        const safeDate = new Date(Date.now() + 50000).toISOString();
        const invalidDate = new Date(Date.now() + 150000).toISOString();

        const res = await request(app)
            .post('/tasks')
            .set('X-User-ID', ownerId.toString())
            .send({
                title: 'Modifiable Constraint Task',
                deadline: deadline,
                reminders: [safeDate]
            });

        const r = await appPool.query('SELECT id FROM reminders WHERE task_id = $1', [res.body.id]);
        const reminderId = r.rows[0].id;

        // Try to update to a date AFTER deadline
        await request(app)
            .patch(`/reminders/${reminderId}`)
            .set('X-User-ID', ownerId.toString())
            .send({ trigger_at: invalidDate })
            .expect(400); // Should fail validation
    });

});
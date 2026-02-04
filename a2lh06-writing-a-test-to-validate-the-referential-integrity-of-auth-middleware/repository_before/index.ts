import { syncPermission } from './auth-utils';

async function runAudit() {
    const session = { id: 'user-789', username: 'dev_user' };

    console.log('--- Before Sync ---');
    console.log('Session Object:', JSON.stringify(session));

    // The logic "successfully" updates the internal registry
    await syncPermission(session, 'ADMIN');

    console.log('\n--- After Sync ---');
    console.log('Session Object:', JSON.stringify(session));

    // LOGIC CHECK: If 'perms' is missing here, the Gold Gap is confirmed.
    if (!(session as any).perms) {
        console.error('\nResult: FAILURE. The session object was not mutated.');
    } else {
        console.log('\nResult: SUCCESS. Permissions synchronized.');
    }
}

runAudit();
import { TypedEventEmitter } from '../repository_after/index';

interface TestEvents {
  'data': { value: string };
  'empty': void;
  'error': { message: string };
}

async function runTests() {
  const emitter = new TypedEventEmitter<TestEvents>();
  let passed = 0;
  let total = 0;

  const assert = (condition: boolean, message: string) => {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
    }
  };

  console.log('Starting TypedEventEmitter Tests \n');

  // Basic on/emit
  let basicValue = '';
  emitter.on('data', (payload) => { basicValue = payload.value; });
  emitter.emit('data', { value: 'hello' });
  assert(basicValue === 'hello', 'Basic on/emit works');

  // Once
  let onceCounter = 0;
  emitter.once('empty', () => { onceCounter++; });
  emitter.emit('empty', undefined as any);
  emitter.emit('empty', undefined as any);
  assert(onceCounter === 1, 'once() only fires once');

  // Error Isolation
  let followedThrough = false as any; 
  emitter.on('error', () => { throw new Error('Test Error'); });
  emitter.on('error', () => { followedThrough = true; });
  console.log('Note: The following error log is expected (Requirement 9):');
  emitter.emit('error', { message: 'test' });
  assert(followedThrough === true, 'Subsequent handlers run after an error');

  // Reentrancy
  let skipped = true as any;
  const handlerA = () => { emitter.off('data', handlerB); };
  const handlerB = () => { skipped = false; };
  emitter.removeAllListeners();
  emitter.on('data', handlerA);
  emitter.on('data', handlerB);
  emitter.emit('data', { value: 'test' });
  assert(skipped === false, 'Reentrancy: Copy of handlers used during emit');

  console.log(`\n Summary: ${passed}/${total} Tests Passed `);
}

runTests().catch(console.error);
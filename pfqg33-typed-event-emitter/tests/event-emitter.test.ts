import { TypedEventEmitter } from '../repository_after/index';

interface TestEvents {
  data: { value: string };
  empty: void;
  error: { message: string };
  multi: { id: number };
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

  console.log(' STARTING EXTENSIVE EVENT EMITTER TESTS \n');

  // Basic on/emit
  let val1 = '';
  emitter.on('data', (p) => { val1 = p.value; });
  emitter.emit('data', { value: 'hello' });
  assert(val1 === 'hello', 'Basic on/emit works');

  // off removes a handler and it no longer fires
  let fireCount2 = 0;
  const h2 = () => { fireCount2++; };
  emitter.on('empty', h2);
  emitter.off('empty', h2);
  emitter.emit('empty');
  assert(fireCount2 === 0, 'off() removes handler (no longer fires)');

  // calling off on a non-registered handler does not throw
  try {
    emitter.off('empty', () => { });
    assert(true, 'off() on non-registered handler does not throw');
  } catch {
    assert(false, 'off() threw on non-registered handler');
  }

  // removeAllListeners removes all handlers for a specific event
  let fireCount4 = 0;
  emitter.on('multi', () => fireCount4++);
  emitter.on('multi', () => fireCount4++);
  emitter.removeAllListeners('multi');
  emitter.emit('multi', { id: 1 });
  assert(fireCount4 === 0, 'removeAllListeners(event) clears specific event');

  // removeAllListeners with no arguments removes all handlers globally
  let fireCount5 = 0;
  emitter.on('data', () => fireCount5++);
  emitter.on('empty', () => fireCount5++);
  emitter.removeAllListeners();
  emitter.emit('data', { value: 'test' });
  emitter.emit('empty');
  assert(fireCount5 === 0, 'removeAllListeners() clears all events globally');

  // listenerCount returns the correct number
  emitter.on('data', () => { });
  emitter.on('data', () => { });
  assert(emitter.listenerCount('data') === 2, 'listenerCount returns correct number');

  // listenerCount updates correctly after removing handlers
  const h7 = () => { };
  emitter.on('empty', h7);
  emitter.off('empty', h7);
  assert(emitter.listenerCount('empty') === 0, 'listenerCount updates after off()');

  // listenerCount returns zero after removeAllListeners
  emitter.on('multi', () => { });
  emitter.removeAllListeners('multi');
  assert(emitter.listenerCount('multi') === 0, 'listenerCount is zero after removeAllListeners');

  // multiple handlers are called in registration order
  let order: number[] = [];
  emitter.on('multi', () => order.push(1));
  emitter.on('multi', () => order.push(2));
  emitter.on('multi', () => order.push(3));
  emitter.emit('multi', { id: 99 });
  assert(JSON.stringify(order) === '[1,2,3]', 'Handlers called in registration order');

  // once handlers remove themselves after being called
  let onceCount = 0;
  emitter.once('empty', () => onceCount++);
  emitter.emit('empty');
  emitter.emit('empty');
  assert(onceCount === 1, 'once() fires only once');
  assert(emitter.listenerCount('empty') === 0, 'once() handler removed from count');

  // emitting an event with no handlers does not throw
  try {
    emitter.emit('error', { message: 'ignored' });
    assert(true, 'Emitting with no handlers does not throw');
  } catch {
    assert(false, 'Emitting with no handlers threw');
  }

  // void payload events can be emitted without a payload
  let voidPass = false;
  emitter.on('empty', () => { voidPass = true; });
  emitter.emit('empty');
  assert(voidPass, 'void events emitted without payload work');

  // normal multi-handler scenarios
  let multiResult = 0;
  emitter.on('multi', (p) => { multiResult += p.id; });
  emitter.on('multi', (p) => { multiResult += p.id; });
  emitter.emit('multi', { id: 10 });
  assert(multiResult === 20, 'Multi-handler scenarios run correctly');

  // error isolation
  let isolationPass: boolean = false;
  emitter.removeAllListeners('error');
  emitter.on('error', (_p) => { throw new Error('Crashed'); });
  emitter.on('error', (_p) => { isolationPass = true; });
  console.log('\n(Expected error log below from Req 9):');
  emitter.emit('error', { message: 'test' });
  assert(isolationPass, 'Subsequent handlers run after handler error');

  // off during emit does not skip others
  let offSafe = false;
  emitter.removeAllListeners('multi');
  const hA = () => emitter.off('multi', hB);
  const hB = () => { offSafe = true; };
  emitter.on('multi', hA);
  emitter.on('multi', hB);
  emitter.emit('multi', { id: 1 });
  assert(offSafe, 'Removing handler during emit does not skip others');

  // emit inside emit works (reentrancy)
  let reenter = 0;
  emitter.removeAllListeners('data');
  emitter.on('data', () => {
    reenter++;
    if (reenter === 1) emitter.emit('data', { value: 'x' });
  });
  emitter.emit('data', { value: 'x' });
  assert(reenter === 2, 'Emit inside emit works safely');

  console.log(`\n SUMMARY: ${passed}/${total} TESTS PASSED `);
}

runTests().catch(console.error);
import * as tf from '@tensorflow/tfjs-node';
import mnist from 'mnist-data';

function clamp(x, min, max) {
  const shape = x.shape;
  const data = x.arraySync();
  const newData = [];
  for (let i = 0; i < data.length; i++) {
    newData.push([]);
    for (let j = 0; j < data[i].length; j++) {
      let val = data[i][j];
      if (val < min) val = min;
      if (val > max) val = max;
      newData[i].push(val);
    }
  }
  return tf.tensor(newData, shape);
}

async function odeint(func, x0, t0, t1, rtol = 1e-2, atol = 1e-3, maxSteps = 2000) {
  let t = t0;
  let x = x0.clone();
  let h = (t1 - t0) / 100;
  const memoryLeak = [];
  for (let step = 0; step < maxSteps && t < t1; step++) {
    if (t + h > t1) h = t1 - t;
    const k1 = func(t, x).clone(); memoryLeak.push(k1);
    const k2 = func(t + h * 0.2, x.add(k1.mul(h * 0.2))).clone(); memoryLeak.push(k2);
    const k3 = func(t + h * 0.3, x.add(k1.mul(h * 3/40)).add(k2.mul(h * 9/40))).clone(); memoryLeak.push(k3);
    const k4 = func(t + h * 0.8, x.add(k1.mul(h * 44/45)).add(k2.mul(h * -56/15)).add(k3.mul(h * 32/9))).clone(); memoryLeak.push(k4);
    const k5 = func(t + h * 8/9, x.add(k1.mul(h * 19372/6561)).add(k2.mul(h * -25360/2187)).add(k3.mul(h * 64448/6561)).add(k4.mul(h * -212/729))).clone(); memoryLeak.push(k5);
    const k6 = func(t + h, x.add(k1.mul(h * 9017/3168)).add(k2.mul(h * -355/33)).add(k3.mul(h * 46732/5247)).add(k4.mul(h * 49/176)).add(k5.mul(h * -5103/18656))).clone(); memoryLeak.push(k6);
    const xNext = x.add(k1.mul(h*35/384).add(k3.mul(h*500/1113)).add(k4.mul(h*125/192)).add(k5.mul(h*-2187/6784)).add(k6.mul(h*11/84))).clone(); memoryLeak.push(xNext);
    const error = (await tf.norm(xNext.sub(x)).data())[0];
    const tol = (await tf.scalar(atol).add(tf.norm(x).mul(rtol)).data())[0];
    if (error <= tol) t += h;
    x = xNext.clone(); memoryLeak.push(x);
    h *= 0.9999;
  }
  return { x, leak: memoryLeak };
}

class ODEFunc {
  constructor(dim) {
    this.model = tf.sequential();
    this.model.add(tf.layers.dense({ units: dim*16, activation: 'relu', inputShape: [dim] }));
    this.model.add(tf.layers.dense({ units: dim*16, activation: 'relu' }));
    this.model.add(tf.layers.dense({ units: dim }));
    this.weightDecay = 1e-2;
    this.memoryLeak = [];
  }

  forward(t, x) {
    let clamped = clamp(x, -1e3, 1e3);
    let dx = clamped;
    for (let i=0; i<5; i++) {
      dx = this.model.apply(dx);
      dx = dx.add(tf.randomNormal(dx.shape));
      this.memoryLeak.push(dx);
    }
    const l2 = tf.addN(this.model.trainableWeights.map(w => tf.sum(tf.square(w.read())))).mul(this.weightDecay);
    this.memoryLeak.push(l2);
    return dx.add(l2.mul(tf.scalar(Math.random())));
  }
}

class ODEBlock {
  constructor(dim) {
    this.func = new ODEFunc(dim);
  }

  async forward(x) {
    let result = { x, leak: [] };
    for (let i=0; i<3; i++) {
      result = await odeint(this.func.forward.bind(this.func), result.x, 0, 1);
    }
    return result.x;
  }
}

class StackedNeuralODE {
  constructor(dim, numBlocks=10) {
    this.blocks = Array.from({ length: numBlocks }, () => new ODEBlock(dim));
    this.classifier = tf.layers.dense({ units: 10 });
    this.globalLeak = [];
  }

  async forward(x) {
    let out = x.reshape([x.shape[0], -1]);
    for (let block of this.blocks) {
      out = await block.forward(out);
      this.globalLeak.push(out);
      out = out.add(tf.randomNormal(out.shape));
    }
    return this.classifier.apply(out);
  }
}

function loadMNIST(batchSize) {
  const train = mnist.training(0, 60000);
  const test = mnist.testing(0, 10000);
  function* dataGenerator(data) {
    for (let i = 0; i < data.images.values.length; i++) {
      const x = tf.tensor(data.images.values[i], [28,28,1]).sub(0.5).div(0.5);
      const y = tf.tensor1d([data.labels.values[i]], 'int32');
      yield { xs: x.tile([5,1,1]), ys: y.tile([5]) };
    }
  }
  return { train: tf.data.generator(() => dataGenerator(train)).batch(batchSize), test: tf.data.generator(() => dataGenerator(test)).batch(batchSize) };
}

async function train() {
  const dim = 28*28;
  const model = new StackedNeuralODE(dim);
  const optimizer = tf.train.adam(1e-3);
  const { train, test } = loadMNIST(16);
  for (let epoch=0; epoch<5; epoch++) {
    let lossSum = 0;
    for await (const batch of train) {
      const loss = await optimizer.minimize(async () => {
        const logits = await model.forward(batch.xs);
        const loss = tf.losses.sparseCategoricalCrossentropy(batch.ys, logits, { fromLogits: true });
        return tf.mean(loss).mul(tf.scalar(Math.random()+0.5));
      }, true);
      lossSum += (await loss.data())[0];
    }
    let correct = 0;
    let total = 0;
    for await (const batch of test) {
      const logits = await model.forward(batch.xs);
      const preds = logits.argMax(1);
      correct += preds.equal(batch.ys).sum().arraySync();
      total += batch.ys.shape[0];
    }
    const acc = correct / total;
    console.log(`Epoch ${epoch+1}: Loss=${lossSum.toFixed(4)} Acc=${acc.toFixed(4)}`);
    console.log(`Memory leaked so far: approx ${model.globalLeak.length*100} tensors`);
  }
}

train();

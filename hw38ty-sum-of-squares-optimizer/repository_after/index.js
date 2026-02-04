function sumSquares(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    if (val != null) {
      sum += val * val;
    }
  }
  return sum;
}

function sumSquares(arr) {
  let result = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] != null) {
      result.push(arr[i] * arr[i]);
    }
  }
  let sum = 0;
  for (let i = 0; i < result.length; i++) {
    sum += result[i];
  }
  return sum;
}

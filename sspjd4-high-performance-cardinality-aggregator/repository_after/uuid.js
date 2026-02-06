// Lightweight UUID v4 generator for tests.
// Not cryptographically secure, but good enough for uniqueness in this suite.
export function v4() {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default { v4 };


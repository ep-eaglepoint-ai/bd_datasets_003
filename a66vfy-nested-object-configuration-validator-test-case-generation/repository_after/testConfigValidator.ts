import { validateConfig } from "./configValidator";

describe("validateConfig", () => {
  // --- Valid Configurations ---

  test("should pass with a valid server and services", () => {
    const config = {
      server: { port: 8080 },
      services: [
        { name: "auth", replicas: 3 },
        { name: "api", replicas: 2 },
      ],
    };
    expect(validateConfig(config)).toBe(true);
  });

  test("should pass when services array is empty", () => {
    const config = {
      server: { port: 3000 },
      services: [],
    };
    expect(validateConfig(config)).toBe(true);
  });

  test("should pass when a service has no replicas field", () => {
    const config = {
      server: { port: 443 },
      services: [{ name: "web" }],
    };
    expect(validateConfig(config)).toBe(true);
  });

  test("should pass with multiple services having different replicas", () => {
    const config = {
      server: { port: 9090 },
      services: [
        { name: "svc-a", replicas: 1 },
        { name: "svc-b" },
        { name: "svc-c", replicas: 10 },
      ],
    };
    expect(validateConfig(config)).toBe(true);
  });

  test("should pass with replicas set to 0", () => {
    const config = {
      server: { port: 80 },
      services: [{ name: "dormant", replicas: 0 }],
    };
    expect(validateConfig(config)).toBe(true);
  });

  // --- Missing / Invalid Server ---

  test("should fail when server is missing entirely", () => {
    const config = {
      services: [{ name: "api" }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when server is null", () => {
    const config = {
      server: null,
      services: [{ name: "api" }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when server.port is not a number", () => {
    const config = {
      server: { port: "8080" },
      services: [{ name: "api" }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when server.port is missing", () => {
    const config = {
      server: {},
      services: [{ name: "api" }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  // --- Services Not an Array ---

  test("should fail when services is a string", () => {
    const config = {
      server: { port: 8080 },
      services: "not-an-array",
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when services is an object", () => {
    const config = {
      server: { port: 8080 },
      services: { name: "api" },
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when services is null", () => {
    const config = {
      server: { port: 8080 },
      services: null,
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when services is undefined", () => {
    const config = {
      server: { port: 8080 },
    };
    expect(validateConfig(config)).toBe(false);
  });

  // --- Missing / Invalid Service Name ---

  test("should fail when a service is missing the name field", () => {
    const config = {
      server: { port: 8080 },
      services: [{ replicas: 2 }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when service name is an empty string", () => {
    const config = {
      server: { port: 8080 },
      services: [{ name: "" }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when service name is a number", () => {
    const config = {
      server: { port: 8080 },
      services: [{ name: 123 }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when one service in many has no name", () => {
    const config = {
      server: { port: 8080 },
      services: [
        { name: "good-service", replicas: 1 },
        { replicas: 3 },
      ],
    };
    expect(validateConfig(config)).toBe(false);
  });

  // --- Non-Numeric Replicas ---

  test("should fail when replicas is a string", () => {
    const config = {
      server: { port: 8080 },
      services: [{ name: "api", replicas: "three" }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when replicas is a boolean", () => {
    const config = {
      server: { port: 8080 },
      services: [{ name: "api", replicas: true }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when replicas is an object", () => {
    const config = {
      server: { port: 8080 },
      services: [{ name: "api", replicas: { count: 3 } }],
    };
    expect(validateConfig(config)).toBe(false);
  });

  test("should fail when one of many services has non-numeric replicas", () => {
    const config = {
      server: { port: 8080 },
      services: [
        { name: "api", replicas: 2 },
        { name: "worker", replicas: "five" },
      ],
    };
    expect(validateConfig(config)).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { CosmioClient } from "../../src/client/cosmio-client.js";

// Dummy options — we never actually connect in these tests
const opts = {
  cosmos: { endpoint: "https://localhost:8081", key: "dummykey==" },
  database: "testdb",
};

describe("CosmioClient singleton", () => {
  afterEach(() => {
    CosmioClient.resetInstances();
  });

  it("returns the same instance for the same endpoint + database", () => {
    const a = new CosmioClient(opts);
    const b = new CosmioClient(opts);
    expect(a).toBe(b);
  });

  it("returns different instances for different databases", () => {
    const a = new CosmioClient(opts);
    const b = new CosmioClient({ ...opts, database: "other" });
    expect(a).not.toBe(b);
  });

  it("returns different instances for different endpoints", () => {
    const a = new CosmioClient(opts);
    const b = new CosmioClient({
      cosmos: { endpoint: "https://other:8081", key: "dummykey==" },
      database: "testdb",
    });
    expect(a).not.toBe(b);
  });

  it("singleton: false creates a new instance every time", () => {
    const a = new CosmioClient(opts, { singleton: false });
    const b = new CosmioClient(opts, { singleton: false });
    expect(a).not.toBe(b);
  });

  it("dispose removes the instance from cache", () => {
    const a = new CosmioClient(opts);
    a.dispose();
    const b = new CosmioClient(opts);
    expect(a).not.toBe(b);
  });

  it("connectionString is also used as singleton key", () => {
    const connOpts = {
      cosmos: { connectionString: "AccountEndpoint=https://localhost:8081;AccountKey=abc;" },
      database: "testdb",
    };
    const a = new CosmioClient(connOpts);
    const b = new CosmioClient(connOpts);
    expect(a).toBe(b);
  });
});

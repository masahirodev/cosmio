import { describe, expect, it } from "vitest";
import { defineConfig } from "../../src/config/define-config.js";

describe("defineConfig", () => {
  it("returns the config object as-is", () => {
    const config = {
      connection: { database: "mydb" },
    };
    const result = defineConfig(config);

    expect(result).toBe(config);
  });

  it("preserves all connection and pull properties", () => {
    const config = {
      connection: {
        endpoint: "https://example.documents.azure.com:443/",
        key: "secret-key",
        connectionString:
          "AccountEndpoint=https://example.documents.azure.com:443/;AccountKey=secret;",
        database: "mydb",
        disableTls: true,
      },
      pull: [
        {
          container: "users",
          name: "User",
          output: "src/models/user.model.ts",
          sampleSize: 200,
          where: "c.type = 'user'",
          enumThreshold: 15,
        },
      ],
    };
    const result = defineConfig(config);

    expect(result.connection.endpoint).toBe("https://example.documents.azure.com:443/");
    expect(result.connection.key).toBe("secret-key");
    expect(result.connection.connectionString).toContain("AccountEndpoint=");
    expect(result.connection.database).toBe("mydb");
    expect(result.connection.disableTls).toBe(true);
    expect(result.pull).toHaveLength(1);
    expect(result.pull![0]).toEqual({
      container: "users",
      name: "User",
      output: "src/models/user.model.ts",
      sampleSize: 200,
      where: "c.type = 'user'",
      enumThreshold: 15,
    });
  });
});

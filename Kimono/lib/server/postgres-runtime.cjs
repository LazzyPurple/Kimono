const postgres = require("postgres");

function normalizeSql(statement) {
  let parameterIndex = 0;

  return String(statement)
    .replace(/`(User|Session|Passkey)`/g, '"$1"')
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\bNOW\(3\)\b/g, "CURRENT_TIMESTAMP")
    .replace(/\bNOW\(\)\b/g, "CURRENT_TIMESTAMP")
    .replace(/\?/g, () => `$${++parameterIndex}`);
}

function wrapRowAccess(row) {
  return new Proxy(row, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver);
      }

      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      const lowered = property.toLowerCase();
      if (Reflect.has(target, lowered)) {
        return Reflect.get(target, lowered, receiver);
      }

      return undefined;
    },
  });
}

function wrapRows(rows) {
  return Array.isArray(rows) ? rows.map((row) => wrapRowAccess(row)) : [];
}

function createPostgresRuntimeClient(databaseUrl) {
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    transform: {
      undefined: null,
    },
  });

  return {
    async queryRows(statement, values = []) {
      const rows = await sql.unsafe(normalizeSql(statement), values);
      return wrapRows(rows);
    },
    async executeResult(statement, values = []) {
      const result = await sql.unsafe(normalizeSql(statement), values);
      return Number(result && typeof result.count === "number" ? result.count : 0);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

module.exports = {
  createPostgresRuntimeClient,
  normalizeSql,
};

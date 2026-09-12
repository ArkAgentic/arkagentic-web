import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

const TEST_USER_WHERE = `
  coalesce(role, 'user') <> 'admin'
  and (
    lower(email) ~ '^(e2e|probe|test|mock|demo)\\.'
    or lower(email) like '%@example.com'
    or lower(email) like 'e2e.%@arkagentic.com'
    or lower(email) like 'probe.%@arkagentic.com'
    or lower(email) like 'test.%@arkagentic.com'
    or lower(email) like 'mock.%@arkagentic.com'
    or lower(email) like 'demo.%@arkagentic.com'
  )
`;

async function getSnapshot(client) {
  const countsRes = await client.query(`
    select 'users' as table_name, count(*)::int as count from users
    union all select 'api_keys', count(*)::int from api_keys
    union all select 'api_logs', count(*)::int from api_logs
    union all select 'usage_logs', count(*)::int from usage_logs
    union all select 'transactions', count(*)::int from transactions
    union all select 'redeem_codes', count(*)::int from redeem_codes
  `);

  const sumRes = await client.query(`
    select
      coalesce(sum(balance_usd),0)::float8 as balance_sum,
      coalesce(sum(total_deposited_usd),0)::float8 as deposited_sum,
      count(*) filter (where coalesce(role,'user')='admin')::int as admin_users,
      count(*) filter (where coalesce(role,'user')<>'admin')::int as non_admin_users
    from users
  `);

  const usersRes = await client.query(`
    select id, email, coalesce(role,'user') as role,
           coalesce(balance_usd,0)::float8 as balance_usd,
           coalesce(total_deposited_usd,0)::float8 as total_deposited_usd
    from users
    where ${TEST_USER_WHERE}
    order by created_at desc
  `);

  return {
    counts: countsRes.rows,
    sums: sumRes.rows[0],
    testUsers: usersRes.rows,
  };
}

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    const before = await getSnapshot(client);

    const result = {
      ok: true,
      mode: APPLY ? "apply" : "dry-run",
      preserved: {
        adminUsers: "kept",
        upstreamChannels: "untouched",
        upstreamModelRoutes: "untouched",
      },
      before,
      deleted: {
        users: 0,
        apiKeys: 0,
        apiLogs: 0,
        usageLogs: 0,
        transactions: 0,
        redeemCodes: 0,
      },
      after: null,
    };

    if (!APPLY) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    await client.query("begin");

    const testUserIds = before.testUsers.map((u) => u.id);

    if (testUserIds.length > 0) {
      const delApiLogs = await client.query(
        `delete from api_logs where user_id = any($1::varchar[])`,
        [testUserIds],
      );
      const delUsageLogs = await client.query(
        `delete from usage_logs where user_id = any($1::varchar[])`,
        [testUserIds],
      );
      const delTransactions = await client.query(
        `delete from transactions where user_id = any($1::varchar[])`,
        [testUserIds],
      );
      const delApiKeys = await client.query(
        `delete from api_keys where user_id = any($1::varchar[])`,
        [testUserIds],
      );
      const delUsers = await client.query(
        `delete from users where id = any($1::varchar[])`,
        [testUserIds],
      );

      result.deleted.apiLogs = delApiLogs.rowCount;
      result.deleted.usageLogs = delUsageLogs.rowCount;
      result.deleted.transactions = delTransactions.rowCount;
      result.deleted.apiKeys = delApiKeys.rowCount;
      result.deleted.users = delUsers.rowCount;
    }

    const delRedeemCodes = await client.query(`delete from redeem_codes`);
    result.deleted.redeemCodes = delRedeemCodes.rowCount;

    await client.query("commit");

    result.after = await getSnapshot(client);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});

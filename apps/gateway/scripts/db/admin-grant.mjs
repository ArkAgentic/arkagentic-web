import { randomBytes, scryptSync } from "crypto";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

function parseArgs(argv) {
  const args = { email: "", password: "", generatePassword: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--email") {
      args.email = (argv[i + 1] || "").trim().toLowerCase();
      i += 1;
    } else if (token === "--password") {
      args.password = argv[i + 1] || "";
      i += 1;
    }
    else if (token === "--generate-password") args.generatePassword = true;
  }
  return args;
}

function makePasswordHash(raw) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(raw, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function randomStrongPassword(length = 20) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+-=";
  let out = "";
  while (out.length < length) {
    const idx = randomBytes(1)[0] % alphabet.length;
    out += alphabet[idx];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.email || !args.email.includes("@")) {
    throw new Error("Usage: node scripts/db/admin-grant.mjs --email user@company.com [--password '...'] [--generate-password]");
  }
  if (args.password && args.generatePassword) {
    throw new Error("Use either --password or --generate-password, not both");
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("begin");
    const userRes = await client.query("select id,email,role,status from users where lower(email)=lower($1) limit 1", [args.email]);
    const user = userRes.rows[0];
    if (!user) throw new Error(`User not found: ${args.email}. Ask them to sign up first.`);

    let assignedPassword = "";
    let passwordHash = null;

    if (args.password) {
      passwordHash = makePasswordHash(args.password);
      assignedPassword = args.password;
    } else if (args.generatePassword) {
      assignedPassword = randomStrongPassword(20);
      passwordHash = makePasswordHash(assignedPassword);
    }

    if (passwordHash) {
      await client.query("update users set role='admin', status='active', password_hash=$2 where id=$1", [user.id, passwordHash]);
    } else {
      await client.query("update users set role='admin', status='active' where id=$1", [user.id]);
    }

    const check = await client.query(
      "select id,email,role,status,(password_hash is not null and password_hash<>'') as has_password_hash from users where id=$1",
      [user.id],
    );

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          ok: true,
          user: check.rows[0],
          assignedPassword: assignedPassword || null,
          note: assignedPassword ? "Save password securely and ask user to change it after first login." : "Admin granted without password change.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

import pool from "../../db.js";
import { comparePassword } from "../utils/hash.js";
import { signAccessToken } from "../utils/jwt.js";

/**
 * POST /tenant/add
 * Validate user credentials & store tenant mapping
 */
export const addTenatUser = async (req, res) => {
  const { tenantId, email, password } = req.body;

  if (!tenantId || !email || !password) {
    return res
      .status(400)
      .json({ error: "tenantId, email, and password are required" });
  }

  try {
    // 1️⃣ Find user by email
    const userResult = await pool.query(
      "SELECT id, password_hash, role FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // 2️⃣ Validate password
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 3️⃣ Save tenant mapping if not exists
    await pool.query(
      `INSERT INTO tenant_table (tenant_id, user_id) 
       VALUES ($1, $2) 
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId, user.id]
    );

    // 4️⃣ Generate access token (role from DB, workspaceId can be null or fetched)
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      workspaceId: null, // or fetch actual workspaceId if you have it
    });

    res.json({ userId: user.id, accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * POST /tenant/validate
 * Validate tenant mapping & return token
 */
export const validateTenatUser = async (req, res) => {
  const { tenantId } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: "tenantId is required" });
  }

  try {
    // 1️⃣ Find mapping
    const tenantResult = await pool.query(
      `SELECT user_id, u.role 
       FROM tenant_table tb
       JOIN users u ON tb.user_id = u.id
       WHERE tenant_id = $1`,
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const { user_id, role } = tenantResult.rows[0];

    // 2️⃣ Generate token
    const accessToken = signAccessToken({
      sub: user_id,
      role,
      workspaceId: null,
    });

    res.json({ userId: user_id, accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

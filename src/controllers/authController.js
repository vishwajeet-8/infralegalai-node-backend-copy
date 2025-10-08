import pool from "../../db.js";
import { sendEmail } from "../utils/email.js";
import { comparePassword, hashPassword } from "../utils/hash.js";
import { signAccessToken } from "../utils/jwt.js";
import { v4 as uuidv4 } from "uuid";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// Create Admin ----------------------------------------------------------------------------------------------------

export const createAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email & password are required" });

  // 🔒 SERVER-SIDE POLICY CHECK: Enforce strong password pattern
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 8 characters long, including uppercase, lowercase, number, and symbol.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Check for duplicate user
    const { rowCount: exists } = await client.query(
      "SELECT 1 FROM users WHERE email = $1",
      [email]
    );
    if (exists) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "User already exists" });
    }

    // 2️⃣ Create user (Owner) with hashed password & seat limit
    const hashed = await hashPassword(password);
    const createUserQuery = `
      INSERT INTO users (email, password_hash, role, seat_limit, failed_login_attempts, lockout_until)
      VALUES ($1, $2, 'Owner', 19, 0, NULL) -- Ensure security fields are initialized
      RETURNING id
    `;
    const {
      rows: [{ id: userId }],
    } = await client.query(createUserQuery, [email, hashed]);

    // 3️⃣ Create default workspace
    const createWorkspaceQuery = `
      INSERT INTO workspaces (name, owner_id, is_default)
      VALUES ('Default Workspace', $1, TRUE)
      RETURNING id
    `;
    const {
      rows: [{ id: workspaceId }],
    } = await client.query(createWorkspaceQuery, [userId]);

    // 4️⃣ Link user to their default workspace
    await client.query(
      `INSERT INTO user_workspace (user_id, workspace_id) VALUES ($1, $2)`,
      [userId, workspaceId]
    );

    // extraction_credit upsert
    await client.query(
      `INSERT INTO extraction_credit (user_id, credit)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE
        SET credit = EXCLUDED.credit,
            updated_at = now();`,
      [userId, 100000]
    );

    // research_credit upsert
    await client.query(
      `INSERT INTO research_credit (user_id, credit, last_renewed_at)
      VALUES ($1, $2, now())
      ON CONFLICT (user_id) DO UPDATE
        SET credit = EXCLUDED.credit,
            last_renewed_at = EXCLUDED.last_renewed_at,
            updated_at = now();`,
      [userId, 100000]
    );

    await client.query("COMMIT");

    // 5️⃣ Return JWT
    const token = signAccessToken({
      sub: userId,
      email: email,
      role: "Owner",
      workspaceId,
    });

    res.status(201).json({
      message: "Admin & default workspace created successfully",
      token,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create Admin Error:", err);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
};

export async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const {
      rows: [user],
    } = await pool.query(
      // CRITICAL: Fetch the security columns for lockout check
      `SELECT id, email, password_hash, role, failed_login_attempts, lockout_until
       FROM users
       WHERE email = $1`,
      [email]
    );

    // 1. User not found (Return generic error)
    if (!user)
      return res.status(401).json({ message: "Invalid email or password" });

    const now = new Date();

    // 2. Check for account lockout BEFORE checking the password
    if (user.lockout_until && user.lockout_until > now) {
      // 🔒 SECURE: Return generic error to hide lockout status from attacker.
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const valid = await comparePassword(password, user.password_hash);

    // 3. Handle successful login
    if (valid) {
      // Reset failed attempts and lockout time on success
      if (user.failed_login_attempts > 0 || user.lockout_until) {
        await pool.query(
          "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1",
          [user.id]
        );
      }

      const {
        rows: [workspace],
      } = await pool.query(
        `SELECT workspace_id
        FROM user_workspace
        WHERE user_id = $1
        LIMIT 1`,
        [user.id]
      );

      const workspaceId = workspace?.workspace_id;

      const token = signAccessToken({
        sub: user.id,
        email: email,
        role: user.role,
        workspaceId,
      });

      return res.status(200).json({
        message: "Login successful",
        token,
      });
    }

    // 4. Handle failed password attempt (Brute-Force Logic)
    else {
      const newAttempts = user.failed_login_attempts + 1;
      let updateQuery =
        "UPDATE users SET failed_login_attempts = $1 WHERE id = $2";
      let updateValues = [newAttempts, user.id];

      // Check if the threshold is met
      if (newAttempts >= MAX_ATTEMPTS) {
        // Lockout for 30 minutes
        const lockoutUntil = new Date(
          now.getTime() + LOCKOUT_DURATION_MINUTES * 60000
        );

        updateQuery =
          "UPDATE users SET failed_login_attempts = $1, lockout_until = $3 WHERE id = $2";
        updateValues = [newAttempts, user.id, lockoutUntil];
      }

      await pool.query(updateQuery, updateValues);

      // 🔒 SECURE: Return generic error message
      return res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function requestPasswordReset(req, res) {
  const { email } = req.body;

  const userCheck = await pool.query(`SELECT id FROM users WHERE email = $1`, [
    email,
  ]);
  if (userCheck.rows.length === 0) {
    return res
      .status(200)
      .json({ message: "If user exists, a reset link has been sent." });
  }

  const token = uuidv4().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  await pool.query(
    `
    INSERT INTO password_resets (email, token, expires_at)
    VALUES ($1, $2, $3)
  `,
    [email, token, expiresAt]
  );

  const resetLink = `${process.env.BASE_URL}/reset-password?token=${token}`;
  const subject = "Reset Your Password";
  const htmlContent = `
    <p>You’ve requested to reset your password. Click the link below to set a new password:</p>
    <a href="${resetLink}">${resetLink}</a>
    <p>This link expires in 15 minutes.</p>
  `;
  await sendEmail(email, subject, htmlContent);

  return res.json({ message: "Reset link sent." });
}

// Reset Password -------------------------------------------------------------------------------------------
export async function resetPassword(req, res) {
  const { token, newPassword } = req.body;

  const resetRow = await pool.query(
    `
    SELECT * FROM password_resets
    WHERE token = $1 AND used = FALSE AND expires_at > NOW()
  `,
    [token]
  );

  if (resetRow.rows.length === 0) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  const { email } = resetRow.rows[0];

  const hashed = await hashPassword(newPassword);

  // Update user's password
  await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
    hashed,
    email,
  ]);

  // Mark token as used
  await pool.query(`UPDATE password_resets SET used = TRUE WHERE token = $1`, [
    token,
  ]);

  return res.json({ message: "Password reset successful" });
}

// Get All users --------------------------------------------------------------------------------------------------------
export async function getAllUsers(req, res) {
  // 🔒 SECURE FIX: The check is now done via requireRole(['Owner']) middleware in the router.
  // We can trust the request made it this far.
  const ownerId = req.user.sub;

  try {
    const result = await pool.query(
      `
      SELECT u.id, u.email, u.role, u.created_at
      FROM users u
      WHERE u.id = $1 -- Include the owner
      UNION
      SELECT u.id, u.email, u.role, u.created_at
      FROM users u
      JOIN invites i ON u.email = i.email
      WHERE i.sent_by = $1 AND i.used = TRUE -- Include members who accepted invites from this owner
      ORDER BY created_at DESC
      `,
      [ownerId]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getUserDetailByEmail(req, res) {
  const { email } = req.query;
  try {
    const result = await pool.query(
      `
      SELECT u.id, u.email, u.role, u.created_at
      FROM users u
      WHERE u.email = $1
      AND u.role = 'Owner'
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getUserDetails(req, res) {
  try {
    const userId = req.user.sub;

    const { rows } = await pool.query(
      `
  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'role', u.role,
    'name', u.name,
    'profile_picture', u.profile_picture,
    'created_at', u.created_at,

    'extraction_credit',
      CASE
        WHEN ec.id IS NULL THEN '{}'::jsonb
        ELSE to_jsonb(ec) - 'user_id' || jsonb_build_object(
          'total_usage', COALESCE((
            SELECT SUM(usage)
            FROM extraction_credit_history
            WHERE extraction_credit_id = ec.id
          ), 0),

          'history', (
            SELECT jsonb_agg(to_jsonb(history_user))
            FROM (
              -- Owner
              SELECT
                u.name,
                u.email,
                u.role,
                COALESCE((
                  SELECT SUM(usage)
                  FROM extraction_credit_history
                  WHERE user_id = u.id AND extraction_credit_id = ec.id
                ), 0) AS total_usage,
                COALESCE((
                  SELECT jsonb_agg(t)
                  FROM (
                    SELECT jsonb_build_object('type', ech2.type, 'total_usage', SUM(ech2.usage)) AS t
                    FROM extraction_credit_history ech2
                    WHERE ech2.user_id = u.id AND ech2.extraction_credit_id = ec.id
                    GROUP BY ech2.type
                  ) AS sub
                ), '[]'::jsonb) AS types
              UNION
              -- Invited Users
              SELECT
                invited.name,
                invited.email,
                invited.role,
                COALESCE((
                  SELECT SUM(usage)
                  FROM extraction_credit_history
                  WHERE user_id = invited.id AND extraction_credit_id = ec.id
                ), 0) AS total_usage,
                COALESCE((
                  SELECT jsonb_agg(t)
                  FROM (
                    SELECT jsonb_build_object('type', ech2.type, 'total_usage', SUM(ech2.usage)) AS t
                    FROM extraction_credit_history ech2
                    WHERE ech2.user_id = invited.id AND ech2.extraction_credit_id = ec.id
                    GROUP BY ech2.type
                  ) AS sub
                ), '[]'::jsonb) AS types
              FROM invites i
              JOIN users invited ON invited.email = i.email
              WHERE i.sent_by = u.id
            ) AS history_user
          )
        )
      END,

    'research_credit',
      CASE
        WHEN rc.id IS NULL THEN '{}'::jsonb
        ELSE to_jsonb(rc) - 'user_id' || jsonb_build_object(
          'total_usage', COALESCE((
            SELECT SUM(usage)
            FROM research_credit_history
            WHERE research_credit_id = rc.id
          ), 0),

          'history', (
            SELECT jsonb_agg(to_jsonb(history_user))
            FROM (
              -- Owner
              SELECT
                u.name,
                u.email,
                u.role,
                COALESCE((
                  SELECT SUM(usage)
                  FROM research_credit_history
                  WHERE user_id = u.id AND research_credit_id = rc.id
                ), 0) AS total_usage
              UNION
              -- Invited Users
              SELECT
                invited.name,
                invited.email,
                invited.role,
                COALESCE((
                  SELECT SUM(usage)
                  FROM research_credit_history
                  WHERE user_id = invited.id AND research_credit_id = rc.id
                ), 0) AS total_usage
              FROM invites i
              JOIN users invited ON invited.email = i.email
              WHERE i.sent_by = u.id
            ) AS history_user
          )
        )
      END

  ) AS user
  FROM users u
  LEFT JOIN extraction_credit ec ON ec.user_id = u.id
  LEFT JOIN research_credit rc ON rc.user_id = u.id
  WHERE u.id = $1;
    `,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0].user;

    const s3BaseUrl = "https://legal-ai-uploads.s3.amazonaws.com"; // replace with your actual bucket
    user.profile_picture_url = user.profile_picture
      ? `${s3BaseUrl}/${user.profile_picture}`
      : null;

    res.json(user);
  } catch (err) {
    console.error("Error fetching user details:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// Updated User -----------------------------------------------------------------------------------------------

export async function updateUserProfile(req, res) {
  const userId = req.user.sub;
  const { name } = req.body;
  const photoKey = req.file?.key; // assuming multer-S3 handles this

  try {
    const query = `
      UPDATE users
      SET name = COALESCE($1, name),
          profile_picture = COALESCE($2, profile_picture)
      WHERE id = $3
      RETURNING id, email, role, name, profile_picture, created_at;
    `;
    const values = [name || null, photoKey || null, userId];

    const { rows } = await pool.query(query, values);
    return res.json(rows[0]);
  } catch (err) {
    console.error("Profile update error:", err);
    return res.status(500).json({ message: "Server error" });
  }
}

// Delete User ----------------------------------------------------------------------------------------------------

export async function deleteUser(req, res) {
  const userIdToDelete = req.params.userId;
  const requesterId = req.user.sub;

  try {
    // 1. SECURE FIX: Get the requester's actual, verified role from the database.
    const { rows } = await pool.query("SELECT role FROM users WHERE id = $1", [
      requesterId,
    ]);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Requester not found." });
    }
    const requesterRole = rows[0].role;

    // 2. Authorization check: Either self-delete OR verified Owner
    if (requesterId !== userIdToDelete && requesterRole !== "Owner") {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this user." });
    }

    // 3. The rest of the logic remains correct
    const {
      rows: [targetUser],
    } = await pool.query("SELECT role FROM users WHERE id = $1", [
      userIdToDelete,
    ]);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }
    const isOwner = targetUser.role === "Owner";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (isOwner) {
        const { rows: workspaces } = await client.query(
          "SELECT id FROM workspaces WHERE owner_id = $1",
          [userIdToDelete]
        );
        for (const workspace of workspaces) {
          await client.query(
            "DELETE FROM user_workspace WHERE workspace_id = $1",
            [workspace.id]
          );
        }
        await client.query(
          "DELETE FROM invites WHERE sent_by = $1 OR email = (SELECT email FROM users WHERE id = $1)",
          [userIdToDelete]
        );
        if (workspaces.length > 0) {
          const workspaceIds = workspaces.map((w) => w.id).join(",");
          await client.query(
            `DELETE FROM workspaces WHERE id IN (${workspaceIds})`,
            []
          );
        }
      } else {
        await client.query("DELETE FROM user_workspace WHERE user_id = $1", [
          userIdToDelete,
        ]);
        await client.query(
          "DELETE FROM invites WHERE email = (SELECT email FROM users WHERE id = $1)",
          [userIdToDelete]
        );
      }

      await client.query("DELETE FROM users WHERE id = $1", [userIdToDelete]);

      await client.query("COMMIT");

      return res.status(200).json({
        message: isOwner
          ? "Owner account, workspaces, and all associated team data deleted successfully."
          : "User and related data deleted successfully.",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error deleting user:", err);
    return res.status(500).json({ message: "Server error during deletion." });
  }
}

// import pool from "../../db.js";
// import { sendEmail } from "../utils/email.js";
// import { comparePassword, hashPassword } from "../utils/hash.js";
// import { signAccessToken } from "../utils/jwt.js";
// import { v4 as uuidv4 } from "uuid";

// // Create Admin ----------------------------------------------------------------------------------------------------
// export const createAdmin = async (req, res) => {
//   const { email, password } = req.body;

//   if (!email || !password)
//     return res.status(400).json({ message: "Email & password are required" });

//   const client = await pool.connect();

//   try {
//     await client.query("BEGIN");

//     // 1️⃣ Check for duplicate user
//     const { rowCount: exists } = await client.query(
//       "SELECT 1 FROM users WHERE email = $1",
//       [email]
//     );
//     if (exists) {
//       await client.query("ROLLBACK");
//       return res.status(409).json({ message: "User already exists" });
//     }

//     // 2️⃣ Create user (Owner) with hashed password & seat limit
//     const hashed = await hashPassword(password);
//     const createUserQuery = `
//       INSERT INTO users (email, password_hash, role, seat_limit)
//       VALUES ($1, $2, 'Owner', 19)
//       RETURNING id
//     `;
//     const {
//       rows: [{ id: userId }],
//     } = await client.query(createUserQuery, [email, hashed]);

//     // 3️⃣ Create default workspace
//     const createWorkspaceQuery = `
//       INSERT INTO workspaces (name, owner_id, is_default)
//       VALUES ('Default Workspace', $1, TRUE)
//       RETURNING id
//     `;
//     const {
//       rows: [{ id: workspaceId }],
//     } = await client.query(createWorkspaceQuery, [userId]);

//     // 4️⃣ Link user to their default workspace
//     await client.query(
//       `INSERT INTO user_workspace (user_id, workspace_id) VALUES ($1, $2)`,
//       [userId, workspaceId]
//     );

//     // extraction_credit upsert
//     await client.query(
//       `INSERT INTO extraction_credit (user_id, credit)
//      VALUES ($1, $2)
//      ON CONFLICT (user_id) DO UPDATE
//        SET credit = EXCLUDED.credit,
//            updated_at = now();`,
//       [userId, 100000]
//     );

//     // research_credit upsert
//     await client.query(
//       `INSERT INTO research_credit (user_id, credit, last_renewed_at)
//      VALUES ($1, $2, now())
//      ON CONFLICT (user_id) DO UPDATE
//        SET credit = EXCLUDED.credit,
//            last_renewed_at = EXCLUDED.last_renewed_at,
//            updated_at = now();`,
//       [userId, 100000]
//     );

//     await client.query("COMMIT");

//     // 5️⃣ Return JWT
//     const token = signAccessToken({
//       sub: userId,
//       role: "Owner",
//       workspaceId,
//     });

//     res.status(201).json({
//       message: "Admin & default workspace created successfully",
//       token,
//     });
//   } catch (err) {
//     await client.query("ROLLBACK");
//     console.error("Create Admin Error:", err);
//     res.status(500).json({ message: "Internal server error" });
//   } finally {
//     client.release();
//   }
// };

// // Login -------------------------------------------------------------------------------------------------------------------
// export async function login(req, res) {
//   const { email, password } = req.body;

//   if (!email || !password)
//     return res.status(400).json({ message: "Email and password are required" });

//   try {
//     const {
//       rows: [user],
//     } = await pool.query(
//       "SELECT id, email, password_hash, role FROM users WHERE email = $1",
//       [email]
//     );

//     if (!user)
//       return res.status(401).json({ message: "Invalid email or password" });

//     const valid = await comparePassword(password, user.password_hash);
//     if (!valid)
//       return res.status(401).json({ message: "Invalid email or password" });

//     const {
//       rows: [workspace],
//     } = await pool.query(
//       `SELECT workspace_id
//      FROM user_workspace
//     WHERE user_id = $1
//     LIMIT 1`,
//       [user.id]
//     );

//     const workspaceId = workspace?.workspace_id;

//     // 🏷️ Include workspaceId in token
//     const token = signAccessToken({
//       sub: user.id,
//       role: user.role,
//       workspaceId, // 👈 added here
//     });

//     return res.status(200).json({
//       message: "Login successful",
//       token,
//       user: {
//         id: user.id,
//         email: user.email,
//         role: user.role,
//         workspaceId, // optionally return here too
//       },
//     });
//   } catch (err) {
//     console.error("Login error:", err);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// }

// // Request reset password -----------------------------------------------------------------------------------------------

// export async function requestPasswordReset(req, res) {
//   const { email } = req.body;

//   const userCheck = await pool.query(`SELECT id FROM users WHERE email = $1`, [
//     email,
//   ]);
//   if (userCheck.rows.length === 0) {
//     return res
//       .status(200)
//       .json({ message: "If user exists, a reset link has been sent." });
//   }

//   const token = uuidv4().replace(/-/g, "");
//   const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

//   await pool.query(
//     `
//     INSERT INTO password_resets (email, token, expires_at)
//     VALUES ($1, $2, $3)
//   `,
//     [email, token, expiresAt]
//   );

//   const resetLink = `${process.env.BASE_URL}/reset-password?token=${token}`;
//   const subject = "Reset Your Password";
//   const htmlContent = `
//     <p>You’ve requested to reset your password. Click the link below to set a new password:</p>
//     <a href="${resetLink}">${resetLink}</a>
//     <p>This link expires in 15 minutes.</p>
//   `;
//   await sendEmail(email, subject, htmlContent);

//   return res.json({ message: "Reset link sent." });
// }

// // Reset Password -------------------------------------------------------------------------------------------
// export async function resetPassword(req, res) {
//   const { token, newPassword } = req.body;

//   const resetRow = await pool.query(
//     `
//     SELECT * FROM password_resets
//     WHERE token = $1 AND used = FALSE AND expires_at > NOW()
//   `,
//     [token]
//   );

//   if (resetRow.rows.length === 0) {
//     return res.status(400).json({ message: "Invalid or expired token" });
//   }

//   const { email } = resetRow.rows[0];

//   const hashed = await hashPassword(newPassword);

//   // Update user's password
//   await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
//     hashed,
//     email,
//   ]);

//   // Mark token as used
//   await pool.query(`UPDATE password_resets SET used = TRUE WHERE token = $1`, [
//     token,
//   ]);

//   return res.json({ message: "Password reset successful" });
// }

// // Get All users --------------------------------------------------------------------------------------------------------
// export async function getAllUsers(req, res) {
//   const role = req.user.role;
//   const ownerId = req.user.sub;

//   if (role !== "Owner") {
//     return res.status(403).json({ message: "Access denied. Owners only." });
//   }

//   try {
//     const result = await pool.query(
//       `
//       SELECT u.id, u.email, u.role, u.created_at
//       FROM users u
//       WHERE u.id = $1 -- Include the owner
//       UNION
//       SELECT u.id, u.email, u.role, u.created_at
//       FROM users u
//       JOIN invites i ON u.email = i.email
//       WHERE i.sent_by = $1 AND i.used = TRUE -- Include members who accepted invites from this owner
//       ORDER BY created_at DESC
//       `,
//       [ownerId]
//     );

//     return res.status(200).json(result.rows);
//   } catch (err) {
//     console.error("Error fetching users:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// }
// export async function getUserDetailByEmail(req, res) {
//   const { email } = req.query;
//   try {
//     const result = await pool.query(
//       `
//       SELECT u.id, u.email, u.role, u.created_at
//       FROM users u
//       WHERE u.email = $1
//       AND u.role = 'Owner'
//       `,
//       [email]
//     );

//     if (result.rows.length === 0) {
//       return res.status(404).json({ message: "User not found" });
//     }
//     return res.status(200).json(result.rows[0]);
//   } catch (err) {
//     console.error("Error fetching users:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// }

// export async function getUserDetails(req, res) {
//   try {
//     const userId = req.user.sub;

//     const { rows } = await pool.query(
//       `
//   SELECT jsonb_build_object(
//     'id', u.id,
//     'email', u.email,
//     'role', u.role,
//     'name', u.name,
//     'profile_picture', u.profile_picture,
//     'created_at', u.created_at,

//     'extraction_credit',
//       CASE
//         WHEN ec.id IS NULL THEN '{}'::jsonb
//         ELSE to_jsonb(ec) - 'user_id' || jsonb_build_object(
//           'total_usage', COALESCE((
//             SELECT SUM(usage)
//             FROM extraction_credit_history
//             WHERE extraction_credit_id = ec.id
//           ), 0),

//           'history', (
//             SELECT jsonb_agg(to_jsonb(history_user))
//             FROM (
//               -- Owner
//               SELECT
//                 u.name,
//                 u.email,
//                 u.role,
//                 COALESCE((
//                   SELECT SUM(usage)
//                   FROM extraction_credit_history
//                   WHERE user_id = u.id AND extraction_credit_id = ec.id
//                 ), 0) AS total_usage,
//                 COALESCE((
//                   SELECT jsonb_agg(t)
//                   FROM (
//                     SELECT jsonb_build_object('type', ech2.type, 'total_usage', SUM(ech2.usage)) AS t
//                     FROM extraction_credit_history ech2
//                     WHERE ech2.user_id = u.id AND ech2.extraction_credit_id = ec.id
//                     GROUP BY ech2.type
//                   ) AS sub
//                 ), '[]'::jsonb) AS types
//               UNION
//               -- Invited Users
//               SELECT
//                 invited.name,
//                 invited.email,
//                 invited.role,
//                 COALESCE((
//                   SELECT SUM(usage)
//                   FROM extraction_credit_history
//                   WHERE user_id = invited.id AND extraction_credit_id = ec.id
//                 ), 0) AS total_usage,
//                 COALESCE((
//                   SELECT jsonb_agg(t)
//                   FROM (
//                     SELECT jsonb_build_object('type', ech2.type, 'total_usage', SUM(ech2.usage)) AS t
//                     FROM extraction_credit_history ech2
//                     WHERE ech2.user_id = invited.id AND ech2.extraction_credit_id = ec.id
//                     GROUP BY ech2.type
//                   ) AS sub
//                 ), '[]'::jsonb) AS types
//               FROM invites i
//               JOIN users invited ON invited.email = i.email
//               WHERE i.sent_by = u.id
//             ) AS history_user
//           )
//         )
//       END,

//     'research_credit',
//       CASE
//         WHEN rc.id IS NULL THEN '{}'::jsonb
//         ELSE to_jsonb(rc) - 'user_id' || jsonb_build_object(
//           'total_usage', COALESCE((
//             SELECT SUM(usage)
//             FROM research_credit_history
//             WHERE research_credit_id = rc.id
//           ), 0),

//           'history', (
//             SELECT jsonb_agg(to_jsonb(history_user))
//             FROM (
//               -- Owner
//               SELECT
//                 u.name,
//                 u.email,
//                 u.role,
//                 COALESCE((
//                   SELECT SUM(usage)
//                   FROM research_credit_history
//                   WHERE user_id = u.id AND research_credit_id = rc.id
//                 ), 0) AS total_usage
//               UNION
//               -- Invited Users
//               SELECT
//                 invited.name,
//                 invited.email,
//                 invited.role,
//                 COALESCE((
//                   SELECT SUM(usage)
//                   FROM research_credit_history
//                   WHERE user_id = invited.id AND research_credit_id = rc.id
//                 ), 0) AS total_usage
//               FROM invites i
//               JOIN users invited ON invited.email = i.email
//               WHERE i.sent_by = u.id
//             ) AS history_user
//           )
//         )
//       END

//   ) AS user
//   FROM users u
//   LEFT JOIN extraction_credit ec ON ec.user_id = u.id
//   LEFT JOIN research_credit rc ON rc.user_id = u.id
//   WHERE u.id = $1;
//     `,
//       [userId]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const user = rows[0].user;

//     const s3BaseUrl = "https://legal-ai-uploads.s3.amazonaws.com"; // replace with your actual bucket
//     user.profile_picture_url = user.profile_picture
//       ? `${s3BaseUrl}/${user.profile_picture}`
//       : null;

//     res.json(user);
//   } catch (err) {
//     console.error("Error fetching user details:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// }

// // Updated User -----------------------------------------------------------------------------------------------

// export async function updateUserProfile(req, res) {
//   const userId = req.user.sub;
//   const { name } = req.body;
//   const photoKey = req.file?.key; // assuming multer-S3 handles this

//   try {
//     const query = `
//       UPDATE users
//       SET name = COALESCE($1, name),
//           profile_picture = COALESCE($2, profile_picture)
//       WHERE id = $3
//       RETURNING id, email, role, name, profile_picture, created_at;
//     `;
//     const values = [name || null, photoKey || null, userId];

//     const { rows } = await pool.query(query, values);
//     return res.json(rows[0]);
//   } catch (err) {
//     console.error("Profile update error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// }

// // Delete User ----------------------------------------------------------------------------------------------------

// export async function deleteUser(req, res) {
//   const userIdToDelete = req.params.userId;
//   const requesterId = req.user.sub;
//   const requesterRole = req.user.role;

//   try {
//     if (requesterId !== userIdToDelete && requesterRole !== "Owner") {
//       return res
//         .status(403)
//         .json({ message: "Not authorized to delete this user." });
//     }

//     const {
//       rows: [targetUser],
//     } = await pool.query("SELECT role FROM users WHERE id = $1", [
//       userIdToDelete,
//     ]);
//     if (!targetUser) {
//       return res.status(404).json({ message: "User not found." });
//     }
//     const isOwner = targetUser.role === "Owner";

//     const client = await pool.connect();
//     try {
//       await client.query("BEGIN");

//       if (isOwner) {
//         const { rows: workspaces } = await client.query(
//           "SELECT id FROM workspaces WHERE owner_id = $1",
//           [userIdToDelete]
//         );
//         for (const workspace of workspaces) {
//           await client.query(
//             "DELETE FROM user_workspace WHERE workspace_id = $1",
//             [workspace.id]
//           );
//         }
//         await client.query(
//           "DELETE FROM invites WHERE sent_by = $1 OR email = (SELECT email FROM users WHERE id = $1)",
//           [userIdToDelete]
//         );
//         if (workspaces.length > 0) {
//           const workspaceIds = workspaces.map((w) => w.id).join(",");
//           await client.query(
//             `DELETE FROM workspaces WHERE id IN (${workspaceIds})`,
//             []
//           );
//         }
//       } else {
//         await client.query("DELETE FROM user_workspace WHERE user_id = $1", [
//           userIdToDelete,
//         ]);
//         await client.query(
//           "DELETE FROM invites WHERE email = (SELECT email FROM users WHERE id = $1)",
//           [userIdToDelete]
//         );
//       }

//       await client.query("DELETE FROM users WHERE id = $1", [userIdToDelete]);

//       await client.query("COMMIT");

//       return res.status(200).json({
//         message: isOwner
//           ? "Owner account, workspaces, and all associated team data deleted successfully."
//           : "User and related data deleted successfully.",
//       });
//     } catch (err) {
//       await client.query("ROLLBACK");
//       throw err;
//     } finally {
//       client.release();
//     }
//   } catch (err) {
//     console.error("Error deleting user:", err);
//     return res.status(500).json({ message: "Server error during deletion." });
//   }
// }

import pool from "../../db.js";
import { sendEmail } from "../utils/email.js";

export const updateResearchCredit = async (req, res) => {
  try {
    const { workspaceId, sub } = req.user;

    const result = await pool.query(
      `
      WITH workspace_owner AS (
        SELECT owner_id
        FROM workspaces
        WHERE id = $1
        LIMIT 1
      ),
      updated AS (
        UPDATE research_credit rc
        SET credit = credit - $2,
            updated_at = now()
        FROM workspace_owner wo
        WHERE rc.user_id = wo.owner_id
          AND rc.credit >= $2
        RETURNING rc.user_id, rc.id AS research_credit_id, rc.credit
      ),
      inserted_history AS (
        INSERT INTO research_credit_history (usage, user_id, research_credit_id, type)
        SELECT $2, $3, research_credit_id, $4
        FROM updated
        RETURNING *
      )
      SELECT u.name, u.email, u.id AS user_id, up.credit
      FROM updated up
      JOIN users u ON u.id = up.user_id;
      `,
      [workspaceId, 1, sub, "Research"]
    );

    if (result.rowCount === 0) {
      return res
        .status(400)
        .json({ message: "Insufficient credit or owner not found." });
    }

    const { name, email, credit } = result.rows[0];

    if (parseFloat(credit) < 50000) {
      const adminEmail = "kunal@infrahive.ai";
      const subject = "Owner Credit Below Threshold";

      const htmlContent = `
        <p><strong>Alert:</strong> An owner's research credit has dropped below 50,000.</p>
        <p><strong>Owner Name:</strong> ${name}</p>
        <p><strong>Owner Email:</strong> ${email}</p>
        <p><strong>Remaining Credit:</strong> ${credit}</p>
      `;

      await sendEmail(adminEmail, subject, htmlContent);
    }
    return res
      .status(200)
      .json({ message: "Research Credit updated successfully" });
  } catch (error) {
    console.error("Failed to update credit:", error.message);
    return res
      .status(500)
      .json({ message: "Failed to update credit:" + error.message });
  }
};
export const updateExactionCredit = async (req, res) => {
  try {
    const { sub, workspaceId } = req.user;
    const { usage, type } = req.body;
    const usageAmount = usage ? usage : 1;

    await pool.query(
      `
      WITH workspace_owner AS (
        SELECT owner_id
        FROM workspaces
        WHERE id = $1
        LIMIT 1
      ),
      updated AS (
        UPDATE extraction_credit ec
        SET credit = credit - $2,
            updated_at = now()
        FROM workspace_owner wo
        WHERE ec.user_id = wo.owner_id
          AND ec.credit >= $2
        RETURNING ec.user_id, ec.id AS extraction_credit_id, ec.credit
      ),
      inserted_history AS (
        INSERT INTO extraction_credit_history (usage, user_id, extraction_credit_id, type)
        SELECT $2, $3, extraction_credit_id, $4
        FROM updated
        RETURNING *
      )
      SELECT u.name, u.email, u.id AS user_id, up.credit
      FROM updated up
      JOIN users u ON u.id = up.user_id;
      `,
      [workspaceId, usageAmount, sub, type]
    );
    return res
      .status(200)
      .json({ message: "Extraction Credit updated successfully" });
  } catch (error) {
    console.error("Failed to update credit:", error.message);
    return res
      .status(500)
      .json({ message: "Failed to update credit:" + error.message });
  }
};

export const addExtractionCredit = async (req, res) => {
  const { owner_id, credit } = req.body;
  try {
    await pool.query(
      `
      UPDATE extraction_credit
      SET credit = $2,
        updated_at = now()
      WHERE user_id = $1
      `,
      [owner_id, credit]
    );
    return res
      .status(201)
      .json({ message: "Extraction Credit added successfully" });
  } catch (error) {
    console.error("Failed to add credit:", error.message);
    return res
      .status(500)
      .json({ message: "Failed to add credit:" + error.message });
  }
};

export const addResearchCredit = async (req, res) => {
  const { owner_id, credit } = req.body;
  try {
    await pool.query(
      `
      UPDATE research_credit
      SET credit = $2,
        updated_at = now()
      WHERE user_id = $1
      `,
      [owner_id, credit]
    );
    return res
      .status(201)
      .json({ message: "Research Credit added successfully" });
  } catch (error) {
    console.error("Failed to add credit:", error.message);
    return res
      .status(500)
      .json({ message: "Failed to add credit:" + error.message });
  }
};

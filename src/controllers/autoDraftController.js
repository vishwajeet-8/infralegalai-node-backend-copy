import pool from "../../db.js";

export const createAutoDraft = async (req, res) => {
  try {
    const { content, file, variables, folder } = req.body;
    const { workspaceId, sub } = req.user;

    const result = await pool.query(
      `
        INSERT INTO auto_draft (owner_id, user_id, content, file, variables, folder)
        VALUES (
                (SELECT owner_id FROM workspaces WHERE id = $1), -- lookup owner_id
                $2, 
                $3, 
                $4, 
                $5,
                $6
        )
        RETURNING id
        `,
      [workspaceId, sub, content, file, JSON.stringify(variables), folder]
    );

    const autoDraft = result.rows[0];

    return res.status(201).json({
      message: "Auto draft created successfully",
      autoDraft,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to create auto draft:" + err.message });
  }
};

export const updateAutoDraft = async (req, res) => {
  try {
    const { content, variables } = req.body;
    const { id } = req.params; // draft ID to update

    const result = await pool.query(
      `
      UPDATE auto_draft
      SET
        content   = COALESCE($1, content),
        variables = COALESCE($2, variables),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id;
      `,
      [content, JSON.stringify(variables), id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Auto draft not found" });
    }

    const autoDraft = result.rows[0];

    return res.status(200).json({
      message: "Auto draft updated successfully",
      autoDraft,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to update auto draft: " + err.message });
  }
};
export const getAutoDrafts = async (req, res) => {
  try {
    const { workspaceId } = req.user;
    const { folder } = req.query;
    const result = await pool.query(
      `
      SELECT 
      ad.id, 
      ad.file, 
      ad.user_id, 
      ad.folder, 
      ad.created_at, 
      u.name AS user_name, 
      u.role AS user_role, 
      u.email AS user_email
      FROM auto_draft ad
      JOIN users u ON ad.user_id = u.id
      WHERE ad.owner_id = (SELECT owner_id FROM workspaces WHERE id = $1)
      AND ad.folder = $2
      ORDER BY ad.created_at DESC
      `,
      [workspaceId, folder]
    );

    const autoDrafts = result.rows;

    return res.status(200).json({
      message: "Auto drafts retrieved successfully",
      autoDrafts,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to retrieve auto drafts: " + err.message });
  }
};
export const getAutoDraftDetail = async (req, res) => {
  try {
    const { id } = req.params; // draft ID to retrieve

    const result = await pool.query(
      `
      SELECT * FROM auto_draft
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Auto draft not found" });
    }

    const autoDraft = result.rows[0];

    return res.status(200).json({
      message: "Auto draft retrieved successfully",
      autoDraft,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to retrieve auto draft: " + err.message });
  }
};
export const removeAutoDraft = async (req, res) => {
  try {
    const { id } = req.params; // draft ID to retrieve

    const result = await pool.query(
      `
      DELETE FROM auto_draft
      WHERE id = $1
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Auto draft not found" });
    }

    return res.status(200).json({
      message: "Auto draft removed successfully",
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to remove auto draft: " + err.message });
  }
};

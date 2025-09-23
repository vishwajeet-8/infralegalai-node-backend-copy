import pool from "../../db.js";

export const saveExtraction = async (req, res) => {
  const { sub } = req.user;
  const { extractedResults, workspaceId, agent } = req.body;

  const { rows } = await pool.query(
    `
    WITH workspace_owner AS (
      SELECT owner_id
      FROM workspaces
      WHERE id = $1
      LIMIT 1
    )
    SELECT ec.*
    FROM extraction_credit ec
    JOIN workspace_owner wo ON ec.user_id = wo.owner_id
    LIMIT 1;
    `,
    [workspaceId]
  );

  try {
    for (const result of extractedResults) {
      const { fileName, extractedData, usage, rawResponse } = result;
      if (
        Number(rows[0].credit) < usage.output_tokens ||
        Number(rows[0].credit) === 0
      ) {
        return res
          .status(402)
          .json({ message: "Insufficient extraction credit" });
      }

      await pool.query(
        `
        INSERT INTO extracted_data (file_name, extracted_data, usage, raw_response, workspace_id, agent)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          fileName,
          extractedData,
          usage || null,
          rawResponse,
          workspaceId,
          agent || "Unassigned",
        ]
      );
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
        [workspaceId, usage.output_tokens, sub, "Smart Extraction"]
      );
    }

    res.status(200).json({ message: "Data saved successfully" });
  } catch (error) {
    console.error("Error saving extracted data:", error);
    res.status(500).json({ error: "Failed to save extracted data" });
  }
};

export const extractedDataByWorkspace = async (req, res) => {
  const { workspaceId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, file_name, extracted_data, usage, created_at, agent
      FROM extracted_data
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      `,
      [workspaceId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching extracted data:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
};

export const extractedDataById = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, file_name, extracted_data, usage, created_at, agent
      FROM extracted_data
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ error: "Failed to fetch item" });
  }
};

// import pool from "../../db.js";

// export const postRoadmap = async (req, res) => {
//   const { feature, description, expectedDate, status, workspace_id } = req.body;

//   // Validate required fields
//   if (!feature || !description || !expectedDate || !status || !workspace_id) {
//     return res.status(400).json({
//       error:
//         "All fields (feature, description, expectedDate, status, workspace_id) are required",
//     });
//   }

//   try {
//     // Convert expectedDate to a valid PostgreSQL date format (YYYY-MM-DD)
//     const formattedDate = new Date(expectedDate).toISOString().split("T")[0];
//     if (isNaN(new Date(formattedDate).getTime())) {
//       return res.status(400).json({
//         error: "Invalid date format. Use YYYY-MM-DD (e.g., 2025-08-13)",
//       });
//     }

//     // Ensure workspace_id is an integer
//     const parsedWorkspaceId = parseInt(workspace_id, 10);
//     if (isNaN(parsedWorkspaceId)) {
//       return res
//         .status(400)
//         .json({ error: "workspace_id must be a valid integer" });
//     }

//     const result = await pool.query(
//       "INSERT INTO roadmap (feature, description, expectedDate, status, workspace_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
//       [feature, description, formattedDate, status, parsedWorkspaceId]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error("Database error:", error);
//     if (error.code === "23503") {
//       // Foreign key violation
//       return res.status(400).json({
//         error: "Invalid workspace_id. It must reference an existing workspace.",
//       });
//     }
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

// export const getAllRoadmap = async (req, res) => {
//   const { workspace_id } = req.query;
//   if (!workspace_id) {
//     return res.status(400).json({ error: "workspace_id is required" });
//   }
//   try {
//     const parsedWorkspaceId = parseInt(workspace_id, 10);
//     if (isNaN(parsedWorkspaceId)) {
//       return res
//         .status(400)
//         .json({ error: "workspace_id must be a valid integer" });
//     }
//     const result = await pool.query(
//       "SELECT * FROM roadmap WHERE workspace_id = $1 ORDER BY created_at DESC",
//       [parsedWorkspaceId]
//     );
//     res.json(result.rows);
//   } catch (error) {
//     console.error("Database error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

// export const updateRoadmap = async (req, res) => {
//   const id = parseInt(req.params.id);
//   const { feature, description, expectedDate, status, workspace_id } = req.body;
//   if (!feature || !description || !expectedDate || !status || !workspace_id) {
//     return res.status(400).json({
//       error:
//         "All fields (feature, description, expectedDate, status, workspace_id) are required",
//     });
//   }
//   try {
//     // Convert expectedDate to a valid PostgreSQL date format (YYYY-MM-DD)
//     const formattedDate = new Date(expectedDate).toISOString().split("T")[0];
//     if (isNaN(new Date(formattedDate).getTime())) {
//       return res.status(400).json({
//         error: "Invalid date format. Use YYYY-MM-DD (e.g., 2025-08-13)",
//       });
//     }

//     // Ensure workspace_id is an integer
//     const parsedWorkspaceId = parseInt(workspace_id, 10);
//     if (isNaN(parsedWorkspaceId)) {
//       return res
//         .status(400)
//         .json({ error: "workspace_id must be a valid integer" });
//     }

//     const result = await pool.query(
//       "UPDATE roadmap SET feature = $1, description = $2, expectedDate = $3, status = $4, workspace_id = $5 WHERE id = $6 RETURNING *",
//       [feature, description, formattedDate, status, parsedWorkspaceId, id]
//     );
//     if (result.rowCount === 0) {
//       return res.status(404).json({ error: "Feature not found" });
//     }
//     res.json(result.rows[0]);
//   } catch (error) {
//     console.error("Database error:", error);
//     if (error.code === "23503") {
//       // Foreign key violation
//       return res.status(400).json({
//         error: "Invalid workspace_id. It must reference an existing workspace.",
//       });
//     }
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

// export const deleteRoadmap = async (req, res) => {
//   const id = parseInt(req.params.id);
//   try {
//     const result = await pool.query(
//       "DELETE FROM roadmap WHERE id = $1 RETURNING *",
//       [id]
//     );
//     if (result.rowCount === 0) {
//       return res.status(404).json({ error: "Feature not found" });
//     }
//     res.status(204).send();
//   } catch (error) {
//     console.error("Database error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

import pool from "../../db.js";

export const postRoadmap = async (req, res) => {
  const { feature, description, expectedDate, status } = req.body;

  // Validate required fields
  if (!feature || !description || !expectedDate || !status) {
    return res.status(400).json({
      error:
        "All fields (feature, description, expectedDate, status) are required",
    });
  }

  try {
    // Convert expectedDate to a valid PostgreSQL date format (YYYY-MM-DD)
    const formattedDate = new Date(expectedDate).toISOString().split("T")[0];
    if (isNaN(new Date(formattedDate).getTime())) {
      return res.status(400).json({
        error: "Invalid date format. Use YYYY-MM-DD (e.g., 2025-08-13)",
      });
    }

    const result = await pool.query(
      "INSERT INTO roadmap (feature, description, expectedDate, status) VALUES ($1, $2, $3, $4) RETURNING *",
      [feature, description, formattedDate, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getAllRoadmap = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM roadmap ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateRoadmap = async (req, res) => {
  const id = parseInt(req.params.id);
  const { feature, description, expectedDate, status } = req.body;
  if (!feature || !description || !expectedDate || !status) {
    return res.status(400).json({
      error:
        "All fields (feature, description, expectedDate, status) are required",
    });
  }
  try {
    // Convert expectedDate to a valid PostgreSQL date format (YYYY-MM-DD)
    const formattedDate = new Date(expectedDate).toISOString().split("T")[0];
    if (isNaN(new Date(formattedDate).getTime())) {
      return res.status(400).json({
        error: "Invalid date format. Use YYYY-MM-DD (e.g., 2025-08-13)",
      });
    }

    const result = await pool.query(
      "UPDATE roadmap SET feature = $1, description = $2, expectedDate = $3, status = $4 WHERE id = $5 RETURNING *",
      [feature, description, formattedDate, status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Feature not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteRoadmap = async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await pool.query(
      "DELETE FROM roadmap WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Feature not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

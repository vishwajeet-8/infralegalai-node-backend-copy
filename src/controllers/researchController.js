import pool from "../../db.js";
import cron from "node-cron";
import { sendChangeNotificationEmail } from "./emailNotificationController.js";

let cronSchedule = null;

// Enhanced function to compare case details and return differences
const getCaseChanges = (oldDetails, newDetails) => {
  console.log("=== CHANGE DETECTION START ===");

  const changes = {};

  let normalizedOldDetails = {};
  if (oldDetails) {
    if (typeof oldDetails === "string") {
      try {
        normalizedOldDetails = JSON.parse(oldDetails);
        console.log("✅ Parsed oldDetails from string");
      } catch (e) {
        console.error("❌ Failed to parse oldDetails:", e.message);
        normalizedOldDetails = {};
      }
    } else if (typeof oldDetails === "object") {
      normalizedOldDetails = oldDetails;
      console.log("✅ oldDetails is already an object");
    }
  } else {
    console.log("ℹ️ oldDetails is null/undefined");
  }

  const normalizedNewDetails = newDetails || {};

  const fieldsToSkip = new Set(["orders"]);

  const normalizeForComparison = (obj) => {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => normalizeForComparison(item));
    }

    if (typeof obj === "object" && obj.constructor === Object) {
      const sortedObj = {};
      const sortedKeys = Object.keys(obj).sort();
      for (const key of sortedKeys) {
        sortedObj[key] = normalizeForComparison(obj[key]);
      }
      return sortedObj;
    }

    return obj;
  };

  const allKeys = new Set([
    ...Object.keys(normalizedOldDetails).filter(
      (key) => !fieldsToSkip.has(key)
    ),
    ...Object.keys(normalizedNewDetails).filter(
      (key) => !fieldsToSkip.has(key)
    ),
  ]);

  console.log(
    `📋 Comparing ${allKeys.size} fields: ${Array.from(allKeys).join(", ")}`
  );
  console.log(`⏭️ Skipping fields: ${Array.from(fieldsToSkip).join(", ")}`);

  let changeCount = 0;
  for (const key of allKeys) {
    const oldValue = normalizedOldDetails[key];
    const newValue = normalizedNewDetails[key];

    console.log(`\n🔍 Checking field: "${key}"`);

    const normalizedOldValue = normalizeForComparison(oldValue);
    const normalizedNewValue = normalizeForComparison(newValue);

    const oldString = JSON.stringify(normalizedOldValue);
    const newString = JSON.stringify(normalizedNewValue);

    const isEqual = oldString === newString;

    if (!isEqual) {
      changeCount++;
      changes[key] = {
        old: oldValue,
        new: newValue,
        changeType:
          oldValue === undefined
            ? "added"
            : newValue === undefined
            ? "removed"
            : "modified",
      };

      console.log(
        `🔄 CHANGE DETECTED in "${key}": ${changes[
          key
        ].changeType.toUpperCase()}`
      );

      const oldPreview = oldString
        ? oldString.substring(0, 100) + (oldString.length > 100 ? "..." : "")
        : "null";
      const newPreview = newString
        ? newString.substring(0, 100) + (newString.length > 100 ? "..." : "")
        : "null";
      console.log(`  📄 Old normalized: ${oldPreview}`);
      console.log(`  📄 New normalized: ${newPreview}`);
    } else {
      console.log(`✅ No change in "${key}" (normalized comparison)`);
    }
  }

  console.log(`\n📊 Total meaningful changes detected: ${changeCount}`);
  console.log("=== CHANGE DETECTION END ===\n");

  return Object.keys(changes).length > 0 ? changes : null;
};

// Utility function to normalize data for consistent storage
const normalizeForStorage = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeForStorage(item));
  }
  if (typeof obj === "object" && obj.constructor === Object) {
    const sorted = {};
    Object.keys(obj)
      .sort()
      .forEach((key) => {
        sorted[key] = normalizeForStorage(obj[key]);
      });
    return sorted;
  }
  return obj;
};

// Function to generate proper cron expression
const generateCronExpression = (days, hours, minutes) => {
  const totalMinutes = days * 24 * 60 + hours * 60 + minutes;

  if (totalMinutes < 60) {
    // Run every X minutes
    return `*/${totalMinutes} * * * *`;
  } else if (totalMinutes < 1440) {
    // Run every X hours
    const totalHours = Math.floor(totalMinutes / 60);
    return `0 */${totalHours} * * *`;
  } else {
    // Run every X days
    const totalDays = Math.floor(totalMinutes / 1440);
    return `0 0 */${totalDays} * *`;
  }
};

// Function to get the appropriate API endpoint based on court type
const getApiEndpoint = (court) => {
  const baseUrl =
    "https://infrahive-ai-legal-research-gyfsavdfd0c9ehh5.centralindia-01.azurewebsites.net/legal-infrahive";

  if (court && court.toLowerCase().includes("district")) {
    return `${baseUrl}/district-court/case/`;
  } else if (court === "Central Administrative Tribunal (CAT)") {
    return `${baseUrl}/central-administrative-tribunal/diary-number/`;
  } else if (court === "National Company Law Tribunal (NCLT)") {
    return `${baseUrl}/national-company-law-tribunal/filing-number/`;
  } else if (court === "Consumer Forum") {
    return `${baseUrl}/consumer-forum/case/`;
  } else {
    return `${baseUrl}/high-court/case/`;
  }
};

// Function to determine identifier field based on court type
const getIdentifierField = (court) => {
  if (court && court.toLowerCase().includes("district")) {
    return "cnr";
  } else if (court === "National Company Law Tribunal (NCLT)") {
    return "filing_number";
  } else if (court === "Central Administrative Tribunal (CAT)") {
    return "diary_number";
  } else if (court === "Consumer Forum") {
    return "caseNumber";
  } else {
    return "cnr";
  }
};

export const getFollowedCases = async (req, res) => {
  const { workspaceId } = req.query;
  if (!workspaceId) {
    return res
      .status(400)
      .json({ success: false, error: "workspaceId is required" });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM followed_cases WHERE workspace_id = $1 ORDER BY followed_at DESC`,
      [workspaceId]
    );
    res.json({ success: true, cases: result.rows });
  } catch (error) {
    console.error("Error fetching followed cases:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getFollowedCasesByCourt = async (req, res) => {
  const { court, workspaceId } = req.query;
  if (!court || !workspaceId) {
    return res
      .status(400)
      .json({ success: false, error: "court and workspaceId are required" });
  }
  try {
    const result = await pool.query(
      `SELECT * FROM followed_cases WHERE court = $1 AND workspace_id = $2 ORDER BY followed_at DESC`,
      [court, workspaceId]
    );
    res.json({ success: true, cases: result.rows });
  } catch (error) {
    console.error("Error fetching followed cases by court:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const followCase = async (req, res) => {
  const { caseData, court, workspace_id, benchId, cnr, caseId } = req.body;

  if (!court || !workspace_id || !caseData) {
    return res.status(400).json({
      success: false,
      error: "Court, workspace_id, and caseData are required",
    });
  }

  try {
    const normalizedCaseData = normalizeForStorage(caseData);
    const normalizedPayload = normalizeForStorage(req.body);

    // Determine CNR value based on court type
    let cnrValue = null;
    let filingNumber = null;
    let diaryNumber = null;
    let caseYear = null;
    let bench_id = benchId || null;

    if (court === "Consumer Forum") {
      // For Consumer Forum, store caseNumber in cnr field
      cnrValue = cnr || caseId || caseData.caseNumber;
    } else if (court === "National Company Law Tribunal (NCLT)") {
      filingNumber = caseData.filingNumber || caseData.caseId || caseId;
    } else if (court === "Central Administrative Tribunal (CAT)") {
      if (caseData.diaryNumber) {
        if (caseData.diaryNumber.includes("/")) {
          const diaryParts = caseData.diaryNumber.split("/");
          if (diaryParts.length === 2) {
            diaryNumber = diaryParts[0].trim();
            caseYear = diaryParts[1].trim();
          }
        } else {
          diaryNumber = caseData.diaryNumber;
          caseYear = caseData.caseYear || req.body.caseYear;
        }
      } else {
        diaryNumber = req.body.diaryNumber;
        caseYear = req.body.caseYear;
      }
      bench_id = benchId || caseData.benchId;
    } else {
      // For other courts (High Court, District Court, Supreme Court)
      cnrValue = cnr || caseData.cnr || caseId;
    }

    await pool.query(
      `INSERT INTO followed_cases
       (cnr, court, filing_number, diary_number, case_year, bench_id, followed_at, case_data, payload, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cnrValue,
        court,
        filingNumber,
        diaryNumber,
        caseYear,
        bench_id,
        new Date(),
        JSON.stringify(normalizedCaseData),
        JSON.stringify(normalizedPayload),
        workspace_id,
      ]
    );

    res.json({ success: true, message: "Case followed successfully" });
  } catch (error) {
    if (error.code === "23505") {
      return res
        .status(400)
        .json({ success: false, error: "Case is already followed" });
    }
    console.error("Error following case:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const unfollowCase = async (req, res) => {
  const { caseId, court, benchId } = req.body;

  if (!caseId) {
    return res
      .status(400)
      .json({ success: false, error: "caseId is required" });
  }

  try {
    let result;

    if (court === "National Company Law Tribunal (NCLT)") {
      result = await pool.query(
        `DELETE FROM followed_cases WHERE filing_number = $1 AND court = $2`,
        [caseId, court]
      );
    } else if (court === "Central Administrative Tribunal (CAT)") {
      const diaryParts = caseId.split("/");
      if (diaryParts.length === 2 && benchId) {
        const diaryNumber = diaryParts[0].trim();
        const caseYear = diaryParts[1].trim();
        result = await pool.query(
          `DELETE FROM followed_cases WHERE diary_number = $1 AND case_year = $2 AND bench_id = $3 AND court = $4`,
          [diaryNumber, caseYear, benchId, court]
        );
      } else {
        return res.status(400).json({
          success: false,
          error:
            "Invalid CAT case format. Expected format: diaryNumber/caseYear and benchId is required",
        });
      }
    } else if (court === "Consumer Forum") {
      // Handle Consumer Forum cases - use cnr field since that's where we store the caseNumber
      result = await pool.query(
        `DELETE FROM followed_cases WHERE cnr = $1 AND court = $2`,
        [caseId, court]
      );
    } else {
      // For other courts (High Court, District Court, Supreme Court)
      result = await pool.query(`DELETE FROM followed_cases WHERE cnr = $1`, [
        caseId,
      ]);

      if (result.rowCount === 0) {
        result = await pool.query(`DELETE FROM followed_cases WHERE id = $1`, [
          caseId,
        ]);
      }
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: "Case not found" });
    }

    res.json({ success: true, message: "Case unfollowed successfully" });
  } catch (error) {
    console.error("Error unfollowing case:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// export const setCronInterval = async (req, res) => {
//   const { days, hours, minutes, workspace_id, role } = req.body;

//   // Validate input parameters
//   if (
//     days === undefined ||
//     days === null ||
//     isNaN(days) ||
//     days < 0 ||
//     hours === undefined ||
//     hours === null ||
//     isNaN(hours) ||
//     hours < 0 ||
//     hours >= 24 ||
//     minutes === undefined ||
//     minutes === null ||
//     isNaN(minutes) ||
//     minutes < 0 ||
//     minutes >= 60
//   ) {
//     return res.status(400).json({
//       success: false,
//       error:
//         "Valid days (non-negative), hours (0-23), and minutes (0-59) are required",
//     });
//   }

//   if (!workspace_id) {
//     return res.status(400).json({
//       success: false,
//       error: "workspace_id is required",
//     });
//   }

//   const totalMinutes = days * 24 * 60 + hours * 60 + minutes;

//   if (totalMinutes < 1) {
//     return res.status(400).json({
//       success: false,
//       error: "Cron interval must be at least 1 minute",
//     });
//   }

//   // Stop existing cron job if it exists
//   if (cronSchedule && cronSchedule[workspace_id]?.[role]) {
//     cronSchedule[workspace_id][role].stop();
//     delete cronSchedule[workspace_id][role];
//     console.log(`🛑 Stopped existing cron job for workspace ${workspace_id}, role ${role}`);
//   }

//   try {
//     // Save cron settings to database
//     await pool.query(
//       `
//       INSERT INTO cron_settings (workspace_id, days, hours, minutes, role, updated_at)
//       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
//       ON CONFLICT ON CONSTRAINT unique_workspace_role
//       DO UPDATE SET
//         days = EXCLUDED.days,
//         hours = EXCLUDED.hours,
//         minutes = EXCLUDED.minutes,
//         updated_at = EXCLUDED.updated_at
//       `,
//       [workspace_id, days, hours, minutes, role || "Owner"]
//     );

//     // Initialize cronSchedule structure
//     if (!cronSchedule) cronSchedule = {};
//     if (!cronSchedule[workspace_id]) cronSchedule[workspace_id] = {};

//     // Generate proper cron expression
//     const cronExpression = generateCronExpression(days, hours, minutes);
//     console.log(`📅 Setting up cron with expression: ${cronExpression} for workspace ${workspace_id}`);

//     // Create and start the cron job
//     cronSchedule[workspace_id][role] = cron.schedule(
//       cronExpression,
//       async () => {
//         console.log(
//           `🚀 Starting cron job for workspace ${workspace_id}, role ${role} at ${new Date().toISOString()}`
//         );

//         try {
//           // Fetch all cases for this workspace
//           const cases = await pool.query(
//             `SELECT cnr, filing_number, diary_number, case_year, bench_id, court, workspace_id, updated_details
//              FROM followed_cases WHERE workspace_id = $1`,
//             [workspace_id]
//           );

//           console.log(
//             `📋 Found ${cases.rows.length} cases to check for workspace ${workspace_id}`
//           );

//           let processedCases = 0;
//           let casesWithChanges = 0;
//           let errors = 0;

//           // Process each case
//           for (const caseRow of cases.rows) {
//             try {
//               const identifierField = getIdentifierField(caseRow.court);
//               let identifierValue;
//               let requestBody;

//               // Build request based on court type
//               if (identifierField === "filing_number") {
//                 identifierValue = caseRow.filing_number;
//                 requestBody = { filingNumber: identifierValue };
//               } else if (identifierField === "diary_number") {
//                 identifierValue = `${caseRow.diary_number}/${caseRow.case_year}`;
//                 requestBody = {
//                   benchId: caseRow.bench_id,
//                   diaryNumber: caseRow.diary_number,
//                   caseYear: caseRow.case_year,
//                 };
//               } else if (identifierField === "caseNumber") {
//                 // Consumer Forum case handling
//                 identifierValue = caseRow.cnr; // CNR field stores the case number for Consumer Forum
//                 requestBody = { caseNumber: identifierValue };
//               } else {
//                 identifierValue = caseRow.cnr;
//                 requestBody = { cnr: identifierValue };
//               }

//               if (!identifierValue) {
//                 console.log(
//                   `⚠️ Skipping case - no ${identifierField} available for court: ${caseRow.court}`
//                 );
//                 continue;
//               }

//               console.log(
//                 `\n🔍 Processing case ${identifierField}: ${identifierValue} (Court: ${caseRow.court}, Workspace: ${caseRow.workspace_id})`
//               );

//               const apiEndpoint = getApiEndpoint(caseRow.court);
//               console.log(`🌐 Using API endpoint: ${apiEndpoint}`);
//               console.log(`📤 Request body:`, JSON.stringify(requestBody));

//               // Fetch latest case data from API
//               const response = await fetch(apiEndpoint, {
//                 method: "POST",
//                 headers: {
//                   "Content-Type": "application/json",
//                   Authorization: "ECIAPI-XXaRks8npWTVUXpFpYc6nGj88cwPMq25",
//                 },
//                 body: JSON.stringify(requestBody),
//               });

//               if (!response.ok) {
//                 throw new Error(
//                   `API request failed for ${identifierField}: ${identifierValue}, status: ${response.status}`
//                 );
//               }

//               let newCaseData;
//               try {
//                 newCaseData = await response.json();
//                 if (newCaseData.success === false) {
//                   throw new Error(
//                     `API error for ${identifierField}: ${identifierValue}: ${
//                       newCaseData.error || "Unknown error"
//                     }`
//                   );
//                 }
//                 console.log(
//                   `📥 Fetched new case data with keys: ${Object.keys(
//                     newCaseData
//                   )}`
//                 );
//               } catch (parseError) {
//                 throw new Error(
//                   `Invalid JSON response for ${identifierField}: ${identifierValue}: ${parseError.message}`
//                 );
//               }

//               // Parse existing case data
//               let oldCaseData = null;
//               if (caseRow.updated_details) {
//                 if (typeof caseRow.updated_details === "string") {
//                   try {
//                     oldCaseData = JSON.parse(caseRow.updated_details);
//                     console.log(
//                       `✅ Successfully parsed existing updated_details for ${identifierField}: ${identifierValue}`
//                     );
//                   } catch (parseError) {
//                     console.error(
//                       `❌ Failed to parse updated_details for ${identifierField}: ${identifierValue}:`,
//                       parseError.message
//                     );
//                     oldCaseData = null;

//                     // Clear corrupted data
//                     await pool.query(
//                       `UPDATE followed_cases SET updated_details = NULL WHERE ${
//                         identifierField === "filing_number" ? "filing_number" :
//                         identifierField === "diary_number" ? "diary_number" :
//                         identifierField === "caseNumber" ? "cnr" : "cnr"
//                       } = $1 AND workspace_id = $2${
//                         identifierField === "diary_number" ? " AND case_year = $3" : ""
//                       }`,
//                       identifierField === "diary_number"
//                         ? [identifierField === "filing_number" ? caseRow.filing_number :
//                            identifierField === "caseNumber" ? caseRow.cnr :
//                            caseRow.diary_number, caseRow.workspace_id, caseRow.case_year]
//                         : [identifierField === "filing_number" ? caseRow.filing_number :
//                            identifierField === "caseNumber" ? caseRow.cnr :
//                            caseRow.cnr, caseRow.workspace_id]
//                     );

//                     // Deduct credit for API call
//                     try {
//                       await pool.query(
//                         `
//                         WITH first_owner AS (
//                           SELECT id AS user_id
//                           FROM users
//                           WHERE role = 'Owner'
//                           ORDER BY created_at ASC
//                           LIMIT 1
//                         )
//                         UPDATE research_credit rc
//                         SET credit = credit - $1,
//                             updated_at = now()
//                         FROM first_owner fo
//                         WHERE rc.user_id = fo.user_id
//                           AND rc.credit >= $1
//                         RETURNING rc.credit;
//                         `,
//                         [1]
//                       );
//                       console.log(`💳 Deducted 1 credit for API call`);
//                     } catch (creditError) {
//                       console.error(`❌ Failed to deduct credit:`, creditError.message);
//                     }
//                   }
//                 } else {
//                   oldCaseData = caseRow.updated_details;
//                   console.log(
//                     `ℹ️ updated_details is already an object for ${identifierField}: ${identifierValue}`
//                   );
//                 }
//               } else {
//                 console.log(
//                   `ℹ️ No existing updated_details for ${identifierField}: ${identifierValue} - treating as first time`
//                 );
//               }

//               // Compare old and new data
//               const normalizedOld = oldCaseData
//                 ? normalizeForStorage(oldCaseData)
//                 : null;
//               const normalizedNew = normalizeForStorage(newCaseData);
//               const changes = getCaseChanges(normalizedOld, normalizedNew);

//               console.log(
//                 `🔍 Changes result for ${identifierField} ${identifierValue}:`,
//                 changes ? "CHANGES DETECTED" : "NO CHANGES"
//               );

//               // Update database with new data
//               const updateQuery = `UPDATE followed_cases SET updated_details = $1 WHERE ${
//                 identifierField === "filing_number" ? "filing_number" :
//                 identifierField === "diary_number" ? "diary_number" :
//                 identifierField === "caseNumber" ? "cnr" : "cnr"
//               } = $2 AND workspace_id = $3${
//                 identifierField === "diary_number" ? " AND case_year = $4" : ""
//               }`;

//               const updateParams = identifierField === "diary_number"
//                 ? [normalizedNew, caseRow.diary_number, caseRow.workspace_id, caseRow.case_year]
//                 : [normalizedNew,
//                    identifierField === "filing_number" ? caseRow.filing_number :
//                    identifierField === "caseNumber" ? caseRow.cnr : caseRow.cnr,
//                    caseRow.workspace_id];

//               await pool.query(updateQuery, updateParams);
//               await pool.query(
//               `
//               WITH workspace_owner AS (
//                 SELECT owner_id
//                 FROM workspaces
//                 WHERE id = $1
//                 LIMIT 1
//               ),
//               updated AS (
//                 UPDATE research_credit rc
//                 SET credit = credit - $2,
//                     updated_at = now()
//                 FROM workspace_owner wo
//                 WHERE rc.user_id = wo.owner_id
//                   AND rc.credit >= $2
//                 RETURNING rc.user_id, rc.credit
//               )
//               SELECT u.name, u.email, u.id AS user_id, up.credit
//               FROM updated up
//               JOIN users u ON u.id = up.user_id;
//               `,
//               [caseRow.workspace_id, 1]
//             );

//               if (changes) {
//                 console.log(
//                   `🔄 Changes detected for ${identifierField}: ${identifierValue} in workspace ${caseRow.workspace_id}`
//                 );
//                 console.log(
//                   `Changed fields: ${Object.keys(changes).join(", ")}`
//                 );

//                 console.log(
//                   `✅ Successfully stored updated data for ${identifierField}: ${identifierValue}`
//                 );

//                 try {
//                   // Send email notification with workspace-specific recipients
//                   await sendChangeNotificationEmail(caseRow, changes);
//                   console.log(
//                     `📧 Email notification sent for ${identifierField}: ${identifierValue} to workspace ${caseRow.workspace_id} owner(s)`
//                   );
//                   casesWithChanges++;
//                 } catch (emailError) {
//                   console.error(
//                     `❌ Failed to send email for ${identifierField}: ${identifierValue}:`,
//                     emailError.message
//                   );
//                 }
//               } else {
//                 console.log(
//                   `✅ No changes detected for ${identifierField}: ${identifierValue} - data updated for consistency`
//                 );
//               }

//               processedCases++;
//             } catch (caseError) {
//               console.error(
//                 `❌ Error processing case: ${
//                   caseRow.cnr ||
//                   caseRow.filing_number ||
//                   `${caseRow.diary_number}/${caseRow.case_year}`
//                 }:`,
//                 caseError.message
//               );
//               errors++;
//             }
//           }

//           // Log completion summary
//           console.log(
//             `\n📊 Cron job completed for workspace ${workspace_id}, role ${role}:`
//           );
//           console.log(`  📋 Total cases: ${cases.rows.length}`);
//           console.log(`  ✅ Processed: ${processedCases}`);
//           console.log(`  🔄 With changes: ${casesWithChanges}`);
//           console.log(`  ❌ Errors: ${errors}`);
//           console.log(`  🕒 Completed at: ${new Date().toISOString()}`);
//         } catch (error) {
//           console.error(
//             `❌ Cron job error for workspace ${workspace_id}, role ${role}:`,
//             error.message
//           );
//         }
//       }
//     );

//     res.json({
//       success: true,
//       message: `Cron job set to run every ${days} days, ${hours} hours, and ${minutes} minutes for workspace ${workspace_id}`,
//       cronExpression: cronExpression,
//     });
//   } catch (error) {
//     console.error("Error setting cron job:", error.message);
//     res.status(500).json({
//       success: false,
//       error: "Failed to set cron job",
//     });
//   }
// };

export const setCronInterval = async (req, res) => {
  const { days, hours, minutes, workspace_id, role, notification_emails } =
    req.body;

  // Input validation
  if (
    days === undefined ||
    days === null ||
    isNaN(days) ||
    days < 0 ||
    hours === undefined ||
    hours === null ||
    isNaN(hours) ||
    hours < 0 ||
    hours >= 24 ||
    minutes === undefined ||
    minutes === null ||
    isNaN(minutes) ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return res.status(400).json({
      success: false,
      error:
        "Valid days (non-negative), hours (0-23), and minutes (0-59) are required",
    });
  }

  if (!workspace_id) {
    return res.status(400).json({
      success: false,
      error: "workspace_id is required",
    });
  }

  if (
    !notification_emails ||
    !Array.isArray(notification_emails) ||
    notification_emails.length === 0
  ) {
    return res.status(400).json({
      success: false,
      error: "At least one notification email is required",
    });
  }

  const totalMinutes = days * 24 * 60 + hours * 60 + minutes;
  if (totalMinutes < 1) {
    return res.status(400).json({
      success: false,
      error: "Cron interval must be at least 1 minute",
    });
  }

  // Stop existing cron job
  if (cronSchedule && cronSchedule[workspace_id]?.[role]) {
    cronSchedule[workspace_id][role].stop();
    delete cronSchedule[workspace_id][role];
    console.log(
      `🛑 Stopped existing cron job for workspace ${workspace_id}, role ${role}`
    );
  }

  try {
    // Save to database
    await pool.query(
      `INSERT INTO cron_settings (workspace_id, days, hours, minutes, role, notification_emails, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT ON CONSTRAINT unique_workspace_role
       DO UPDATE SET
         days = EXCLUDED.days,
         hours = EXCLUDED.hours,
         minutes = EXCLUDED.minutes,
         notification_emails = EXCLUDED.notification_emails,
         updated_at = EXCLUDED.updated_at`,
      [
        workspace_id,
        days,
        hours,
        minutes,
        role || "Owner",
        JSON.stringify(notification_emails),
      ]
    );

    // Initialize cron structure
    if (!cronSchedule) cronSchedule = {};
    if (!cronSchedule[workspace_id]) cronSchedule[workspace_id] = {};

    // Create cron job
    const cronExpression = generateCronExpression(days, hours, minutes);
    console.log(
      `📅 Setting up cron: ${cronExpression} for workspace ${workspace_id}`
    );

    cronSchedule[workspace_id][role] = cron.schedule(
      cronExpression,
      async () => {
        console.log(
          `🚀 Starting cron job for workspace ${workspace_id} at ${new Date().toISOString()}`
        );

        try {
          // Get current notification emails from database
          const cronSettingsResult = await pool.query(
            `SELECT notification_emails FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
            [workspace_id, role || "Owner"]
          );

          let currentNotificationEmails = notification_emails;
          if (
            cronSettingsResult.rows.length > 0 &&
            cronSettingsResult.rows[0].notification_emails
          ) {
            try {
              const storedEmails =
                cronSettingsResult.rows[0].notification_emails;
              currentNotificationEmails =
                typeof storedEmails === "string"
                  ? JSON.parse(storedEmails)
                  : storedEmails;
            } catch (parseError) {
              console.error(
                "Error parsing stored emails, using original:",
                parseError
              );
            }
          }

          // Fetch cases for this workspace
          const cases = await pool.query(
            `SELECT cnr, filing_number, diary_number, case_year, bench_id, court, workspace_id, updated_details 
           FROM followed_cases WHERE workspace_id = $1`,
            [workspace_id]
          );

          console.log(
            `📋 Found ${cases.rows.length} cases to check for workspace ${workspace_id}`
          );

          let processedCases = 0;
          let casesWithChanges = 0;
          let errors = 0;

          // Process each case
          for (const caseRow of cases.rows) {
            try {
              const identifierField = getIdentifierField(caseRow.court);
              let identifierValue;
              let requestBody;

              // Build request based on court type
              if (identifierField === "filing_number") {
                identifierValue = caseRow.filing_number;
                requestBody = { filingNumber: identifierValue };
              } else if (identifierField === "diary_number") {
                identifierValue = `${caseRow.diary_number}/${caseRow.case_year}`;
                requestBody = {
                  benchId: caseRow.bench_id,
                  diaryNumber: caseRow.diary_number,
                  caseYear: caseRow.case_year,
                };
              } else if (identifierField === "caseNumber") {
                identifierValue = caseRow.cnr;
                requestBody = { caseNumber: identifierValue };
              } else {
                identifierValue = caseRow.cnr;
                requestBody = { cnr: identifierValue };
              }

              if (!identifierValue) {
                console.log(
                  `⚠️ Skipping case - no ${identifierField} for court: ${caseRow.court}`
                );
                continue;
              }

              console.log(
                `🔍 Processing ${identifierField}: ${identifierValue} (${caseRow.court})`
              );

              const apiEndpoint = getApiEndpoint(caseRow.court);

              // API call
              const response = await fetch(apiEndpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "ECIAPI-XXaRks8npWTVUXpFpYc6nGj88cwPMq25",
                },
                body: JSON.stringify(requestBody),
              });

              if (!response.ok) {
                throw new Error(
                  `API failed for ${identifierField}: ${identifierValue}, status: ${response.status}`
                );
              }

              let newCaseData;
              try {
                newCaseData = await response.json();
                if (newCaseData.success === false) {
                  throw new Error(
                    `API error for ${identifierField}: ${identifierValue}: ${
                      newCaseData.error || "Unknown error"
                    }`
                  );
                }
              } catch (parseError) {
                throw new Error(
                  `Invalid JSON for ${identifierField}: ${identifierValue}: ${parseError.message}`
                );
              }

              // Parse existing data
              let oldCaseData = null;
              if (caseRow.updated_details) {
                if (typeof caseRow.updated_details === "string") {
                  try {
                    oldCaseData = JSON.parse(caseRow.updated_details);
                  } catch (parseError) {
                    console.error(
                      `Failed to parse updated_details for ${identifierField}: ${identifierValue}`
                    );
                    oldCaseData = null;

                    // Clear corrupted data
                    const clearQuery =
                      identifierField === "diary_number"
                        ? `UPDATE followed_cases SET updated_details = NULL WHERE diary_number = $1 AND case_year = $2 AND workspace_id = $3`
                        : `UPDATE followed_cases SET updated_details = NULL WHERE ${
                            identifierField === "filing_number"
                              ? "filing_number"
                              : identifierField === "caseNumber"
                              ? "cnr"
                              : "cnr"
                          } = $1 AND workspace_id = $2`;

                    const clearParams =
                      identifierField === "diary_number"
                        ? [
                            caseRow.diary_number,
                            caseRow.case_year,
                            caseRow.workspace_id,
                          ]
                        : [
                            identifierField === "filing_number"
                              ? caseRow.filing_number
                              : identifierField === "caseNumber"
                              ? caseRow.cnr
                              : caseRow.cnr,
                            caseRow.workspace_id,
                          ];

                    await pool.query(clearQuery, clearParams);
                  }
                } else {
                  oldCaseData = caseRow.updated_details;
                }
              }

              // Compare data
              const normalizedOld = oldCaseData
                ? normalizeForStorage(oldCaseData)
                : null;
              const normalizedNew = normalizeForStorage(newCaseData);
              const changes = getCaseChanges(normalizedOld, normalizedNew);

              // Update database
              const updateQuery =
                identifierField === "diary_number"
                  ? `UPDATE followed_cases SET updated_details = $1 WHERE diary_number = $2 AND case_year = $3 AND workspace_id = $4`
                  : `UPDATE followed_cases SET updated_details = $1 WHERE ${
                      identifierField === "filing_number"
                        ? "filing_number"
                        : identifierField === "caseNumber"
                        ? "cnr"
                        : "cnr"
                    } = $2 AND workspace_id = $3`;

              const updateParams =
                identifierField === "diary_number"
                  ? [
                      JSON.stringify(normalizedNew),
                      caseRow.diary_number,
                      caseRow.case_year,
                      caseRow.workspace_id,
                    ]
                  : [
                      JSON.stringify(normalizedNew),
                      identifierField === "filing_number"
                        ? caseRow.filing_number
                        : identifierField === "caseNumber"
                        ? caseRow.cnr
                        : caseRow.cnr,
                      caseRow.workspace_id,
                    ];

              await pool.query(updateQuery, updateParams);

              // Deduct credit
              await pool.query(
                `WITH workspace_owner AS (
                 SELECT owner_id FROM workspaces WHERE id = $1 LIMIT 1
               )
               UPDATE research_credit rc
               SET credit = credit - $2, updated_at = now()
               FROM workspace_owner wo
               WHERE rc.user_id = wo.owner_id AND rc.credit >= $2`,
                [caseRow.workspace_id, 1]
              );

              if (changes) {
                console.log(
                  `🔄 Changes detected for ${identifierField}: ${identifierValue}`
                );

                try {
                  await sendChangeNotificationEmail(
                    caseRow,
                    changes,
                    currentNotificationEmails
                  );
                  console.log(
                    `📧 Email sent to: ${currentNotificationEmails.join(", ")}`
                  );
                  casesWithChanges++;
                } catch (emailError) {
                  console.error(
                    `❌ Email failed for ${identifierField}: ${identifierValue}:`,
                    emailError.message
                  );
                }
              }

              processedCases++;
            } catch (caseError) {
              console.error(`❌ Error processing case:`, caseError.message);
              errors++;
            }
          }

          // Log summary
          console.log(
            `📊 Cron completed: ${cases.rows.length} total, ${processedCases} processed, ${casesWithChanges} with changes, ${errors} errors`
          );
          console.log(
            `📧 Notifications sent to: ${currentNotificationEmails.join(", ")}`
          );
        } catch (error) {
          console.error(
            `❌ Cron job error for workspace ${workspace_id}:`,
            error.message
          );
        }
      }
    );

    res.json({
      success: true,
      message: `Cron job set to run every ${days} days for workspace ${workspace_id}. Notifications will be sent to ${notification_emails.length} recipient(s).`,
      cronExpression: cronExpression,
      notification_emails: notification_emails,
    });
  } catch (error) {
    console.error("Error setting cron job:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to set cron job",
    });
  }
};

// export const getCronInterval = async (req, res) => {
//   const { workspace_id, role } = req.query;

//   if (!workspace_id) {
//     return res.status(400).json({
//       success: false,
//       error: "workspace_id is required",
//     });
//   }

//   try {
//     const result = await pool.query(
//       `SELECT days, hours, minutes FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
//       [workspace_id, role || "Owner"]
//     );
//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         error: "No cron schedule found for this workspace and role",
//       });
//     }
//     const { days, hours, minutes } = result.rows[0];
//     res.json({
//       success: true,
//       days,
//       hours,
//       minutes,
//     });
//   } catch (error) {
//     console.error("Error fetching cron interval:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//     });
//   }
// };

export const getCronInterval = async (req, res) => {
  const { workspace_id, role } = req.query;

  if (!workspace_id) {
    return res.status(400).json({
      success: false,
      error: "workspace_id is required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT days, hours, minutes, notification_emails FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
      [workspace_id, role || "Owner"]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No cron schedule found for this workspace and role",
      });
    }

    const { days, hours, minutes, notification_emails } = result.rows[0];

    // Parse notification_emails safely
    let emails = [];
    if (notification_emails) {
      try {
        emails =
          typeof notification_emails === "string"
            ? JSON.parse(notification_emails)
            : notification_emails;
      } catch (e) {
        console.error("Error parsing notification emails:", e);
        emails = [];
      }
    }

    res.json({
      success: true,
      days,
      hours,
      minutes,
      notification_emails: emails,
    });
  } catch (error) {
    console.error("Error fetching cron interval:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// export const stopCron = async (req, res) => {
//   const { workspace_id, role } = req.body;

//   if (!workspace_id) {
//     return res.status(400).json({
//       success: false,
//       error: "workspace_id is required",
//     });
//   }

//   try {
//     if (cronSchedule && cronSchedule[workspace_id]?.[role]) {
//       cronSchedule[workspace_id][role].stop();
//       delete cronSchedule[workspace_id][role];
//       console.log(`🛑 Stopped cron job for workspace ${workspace_id}, role ${role}`);

//       const result = await pool.query(
//         `DELETE FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
//         [workspace_id, role || "Owner"]
//       );

//       if (result.rowCount === 0) {
//         return res.status(404).json({
//           success: false,
//           error: "No cron schedule found for this workspace and role",
//         });
//       }

//       res.json({
//         success: true,
//         message: "Cron job stopped and schedule removed successfully",
//       });
//     } else {
//       const result = await pool.query(
//         `DELETE FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
//         [workspace_id, role || "Owner"]
//       );

//       res.json({
//         success: true,
//         message: "No active cron job found, schedule cleared if it existed",
//       });
//     }
//   } catch (error) {
//     console.error("Error stopping cron job:", error.message);
//     res.status(500).json({
//       success: false,
//       error: "Failed to stop cron job",
//     });
//   }
// };

export const stopCron = async (req, res) => {
  const { workspace_id, role } = req.body;

  if (!workspace_id) {
    return res.status(400).json({
      success: false,
      error: "workspace_id is required",
    });
  }

  try {
    if (cronSchedule && cronSchedule[workspace_id]?.[role]) {
      cronSchedule[workspace_id][role].stop();
      delete cronSchedule[workspace_id][role];
      console.log(
        `🛑 Stopped cron job for workspace ${workspace_id}, role ${role}`
      );
    }

    const result = await pool.query(
      `DELETE FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
      [workspace_id, role || "Owner"]
    );

    res.json({
      success: true,
      message: "Cron job stopped and schedule removed successfully",
    });
  } catch (error) {
    console.error("Error stopping cron job:", error.message);
    res.status(500).json({
      success: false,
      error: "Failed to stop cron job",
    });
  }
};

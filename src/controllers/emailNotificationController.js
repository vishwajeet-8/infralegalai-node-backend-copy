// import nodemailer from "nodemailer";
// import pool from "../../db.js"; // Import your database pool

// // Configure Nodemailer with Brevo SMTP
// const transporter = nodemailer.createTransport({
//   host: "smtp-relay.brevo.com",
//   port: 587,
//   auth: {
//     user: process.env.BREVO_USER,
//     pass: process.env.BREVO_SMTP_KEY,
//   },
// });

// // Function to fetch owner emails for a specific workspace using direct DB query
// const getOwnerEmailsByWorkspace = async (workspaceId) => {
//   try {
//     console.log(`🔍 Fetching owner emails for workspace ${workspaceId} from database...`);
    
//     // Convert workspaceId to integer in case it's passed as string
//     const workspaceIdInt = parseInt(workspaceId, 10);
    
//     // JOIN workspaces and users tables to get the owner email for this workspace
//     const result = await pool.query(
//       `SELECT u.email 
//        FROM workspaces w 
//        JOIN users u ON w.owner_id = u.id 
//        WHERE w.id = $1`,
//       [workspaceIdInt]
//     );
    
//     const ownerEmails = result.rows.map(row => row.email);
    
//     console.log(`📧 Found ${ownerEmails.length} owner(s) for workspace ${workspaceId}:`, ownerEmails);
    
//     if (ownerEmails.length === 0) {
//       console.log(`⚠️ No owners found for workspace ${workspaceId}, falling back to system-wide owners...`);
//       // Fallback: fetch all owners if no workspace-specific owners found
//       return await getAllOwnerEmails();
//     }
    
//     return ownerEmails;
    
//   } catch (error) {
//     console.error(`❌ Failed to fetch owner emails for workspace ${workspaceId}:`, error.message);
//     console.log('⚠️ Falling back to system-wide owners...');
//     // Fallback to system-wide owners
//     return await getAllOwnerEmails();
//   }
// };

// // Fallback function to get all system owners using direct DB query
// const getAllOwnerEmails = async () => {
//   try {
//     console.log('🔍 Fetching all system owner emails from database...');
    
//     const result = await pool.query(
//       `SELECT email FROM users WHERE role = $1`,
//       ['Owner']
//     );
    
//     const ownerEmails = result.rows.map(row => row.email);
    
//     console.log(`📧 Found ${ownerEmails.length} system owner(s):`, ownerEmails);
    
//     if (ownerEmails.length === 0) {
//       console.log('⚠️ No system owners found, using fallback email');
//       return ['satyajeet@infrahive.ai']; // Ultimate fallback
//     }
    
//     return ownerEmails;
    
//   } catch (error) {
//     console.error('❌ Failed to fetch system owner emails:', error.message);
//     console.log('⚠️ Using ultimate fallback email');
//     return ['satyajeet@infrahive.ai']; // Ultimate fallback
//   }
// };

// // Enhanced email notification with better formatting and support for all court types
// export const sendChangeNotificationEmail = async (caseRow, changes) => {
//   try {
//     console.log(`📧 Preparing email notification for case:`, {
//       cnr: caseRow.cnr,
//       filing_number: caseRow.filing_number,
//       court: caseRow.court,
//       workspace_id: caseRow.workspace_id,
//     });

//     // Get owner emails for the specific workspace
//     const ownerEmails = await getOwnerEmailsByWorkspace(caseRow.workspace_id);

//     // Determine the case identifier and type
//     const getCaseIdentifier = (caseRow) => {
//       if (caseRow.cnr) {
//         return { type: "CNR", value: caseRow.cnr };
//       } else if (caseRow.filing_number) {
//         return { type: "Filing Number", value: caseRow.filing_number };
//       } else {
//         return { type: "Case ID", value: caseRow.id || "Unknown" };
//       }
//     };

//     const identifier = getCaseIdentifier(caseRow);
//     const courtName = caseRow.court || "Unknown Court";

//     // Format changes for better readability with null/undefined safety
//     const formatChanges = (changes) => {
//       let formatted = [];
//       for (const [key, change] of Object.entries(changes)) {
//         // Safely format values, handling null/undefined
//         const formatValue = (value) => {
//           if (value === null) return "<em>null</em>";
//           if (value === undefined) return "<em>undefined</em>";
//           if (typeof value === "string") return value;
//           if (typeof value === "object") {
//             try {
//               return JSON.stringify(value, null, 2);
//             } catch (e) {
//               return String(value);
//             }
//           }
//           return String(value);
//         };

//         const oldValue = formatValue(change.old);
//         const newValue = formatValue(change.new);

//         formatted.push(`
//           <div style="margin-bottom: 15px; padding: 10px; border-left: 3px solid #007bff; background-color: #f8f9fa;">
//             <strong style="color: #333; font-size: 14px;">${key}:</strong>
//             <div style="margin-top: 8px;">
//               <div style="margin-bottom: 5px;">
//                 <span style="color: #dc3545; font-weight: bold;">Previous:</span> 
//                 <pre style="margin: 2px 0; padding: 5px; background-color: #fff; border: 1px solid #dee2e6; border-radius: 3px; font-size: 12px; white-space: pre-wrap;">${oldValue}</pre>
//               </div>
//               <div style="margin-bottom: 5px;">
//                 <span style="color: #28a745; font-weight: bold;">Current:</span> 
//                 <pre style="margin: 2px 0; padding: 5px; background-color: #fff; border: 1px solid #dee2e6; border-radius: 3px; font-size: 12px; white-space: pre-wrap;">${newValue}</pre>
//               </div>
//             </div>
//             <div style="margin-top: 8px; font-size: 11px; color: #6c757d; font-style: italic;">
//               Change Type: ${change.changeType || "modified"}
//             </div>
//           </div>
//         `);
//       }
//       return formatted.join("");
//     };

//     // Create text version for email clients that don't support HTML
//     const createTextVersion = (changes) => {
//       let text = [];
//       for (const [key, change] of Object.entries(changes)) {
//         text.push(`\n${key}:`);
//         text.push(`  Previous: ${JSON.stringify(change.old)}`);
//         text.push(`  Current: ${JSON.stringify(change.new)}`);
//         text.push(`  Change Type: ${change.changeType || "modified"}\n`);
//       }
//       return text.join("\n");
//     };

//     const mailOptions = {
//       from: '"InfraHive AI Support" <support@infrahive.ai>',
//       to: ownerEmails.join(', '), // Send to workspace-specific owners
//       subject: `🔔 ${courtName} - Case Update Alert - ${identifier.type}: ${identifier.value}`,
//       text: `
// Case Update Notification

// ${identifier.type}: ${identifier.value}
// Court: ${courtName}
// Workspace ID: ${caseRow.workspace_id}
// Detected at: ${new Date().toISOString()}

// Changes:${createTextVersion(changes)}

// ---
// This is an automated notification from the Legal Case Monitoring System.
//       `,
//       html: `
//         <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; background-color: #f5f5f5; padding: 20px;">
//           <div style="background-color: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
//             <!-- Header -->
//             <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center;">
//               <h1 style="margin: 0; font-size: 24px; font-weight: 600;">📋 Case Update Notification</h1>
//               <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Legal Case Monitoring System</p>
//             </div>
            
//             <!-- Case Information -->
//             <div style="padding: 25px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6;">
//               <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${
//                     identifier.type
//                   }</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${
//                     identifier.value
//                   }</p>
//                 </div>
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Court</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${courtName}</p>
//                 </div>
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Workspace</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${
//                     caseRow.workspace_id
//                   }</p>
//                 </div>
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Detected</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${new Date().toLocaleString()}</p>
//                 </div>
//               </div>
//             </div>
            
//             <!-- Changes Section -->
//             <div style="padding: 25px;">
//               <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px; font-weight: 600; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
//                 📝 Changes Detected (${Object.keys(changes).length})
//               </h2>
//               ${formatChanges(changes)}
//             </div>
            
//             <!-- Footer -->
//             <div style="background-color: #e9ecef; padding: 20px; text-align: center;">
//               <p style="margin: 0; font-size: 12px; color: #6c757d; line-height: 1.5;">
//                 This is an automated notification from the <strong>Legal Case Monitoring System</strong><br>
//                 Generated on ${new Date().toLocaleString("en-US", {
//                   weekday: "long",
//                   year: "numeric",
//                   month: "long",
//                   day: "numeric",
//                   hour: "2-digit",
//                   minute: "2-digit",
//                   timeZone: "Asia/Kolkata",
//                 })} IST
//               </p>
//             </div>
            
//           </div>
//         </div>
//       `,
//     };

//     console.log(`📧 Sending email notification to ${ownerEmails.length} workspace owner(s)...`);
//     const result = await transporter.sendMail(mailOptions);
//     console.log(
//       `📧 Email sent successfully for ${identifier.type}: ${identifier.value}`,
//       {
//         messageId: result.messageId,
//         response: result.response,
//         recipients: ownerEmails,
//         workspace_id: caseRow.workspace_id,
//       }
//     );

//     return result;
//   } catch (error) {
//     const identifier =
//       caseRow.cnr || caseRow.filing_number || caseRow.id || "Unknown";
//     console.error(`❌ Failed to send email for case ${identifier}:`, {
//       error: error.message,
//       stack: error.stack,
//       caseData: {
//         cnr: caseRow.cnr,
//         filing_number: caseRow.filing_number,
//         court: caseRow.court,
//         workspace_id: caseRow.workspace_id,
//       },
//     });
//     throw error;
//   }
// };





// import nodemailer from "nodemailer";
// import pool from "../../db.js"; // Import your database pool

// // Configure Nodemailer with Brevo SMTP
// const transporter = nodemailer.createTransport({
//   host: "smtp-relay.brevo.com",
//   port: 587,
//   auth: {
//     user: process.env.BREVO_USER,
//     pass: process.env.BREVO_SMTP_KEY,
//   },
// });

// // Function to fetch notification emails from cron_settings
// const getNotificationEmails = async (workspaceId) => {
//   try {
//     console.log(`📧 Fetching notification emails for workspace ${workspaceId} from cron_settings...`);
    
//     // Convert workspaceId to integer in case it's passed as string
//     const workspaceIdInt = parseInt(workspaceId, 10);
    
//     // Get notification emails from cron_settings table
//     const result = await pool.query(
//       `SELECT notification_emails FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
//       [workspaceIdInt, "Owner"]
//     );
    
//     if (result.rows.length > 0 && result.rows[0].notification_emails) {
//       let emails = result.rows[0].notification_emails;
      
//       console.log(`📧 Raw notification emails from database:`, {
//         emails,
//         type: typeof emails,
//         isArray: Array.isArray(emails)
//       });
      
//       // Handle both string and array cases
//       if (typeof emails === 'string') {
//         try {
//           emails = JSON.parse(emails);
//         } catch (parseError) {
//           console.error(`❌ Failed to parse notification emails:`, parseError);
//           return await getFallbackEmails(workspaceId);
//         }
//       }
      
//       // Validate emails
//       if (Array.isArray(emails) && emails.length > 0) {
//         // Filter out invalid emails
//         const validEmails = emails.filter(email => {
//           const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//           return emailRegex.test(email);
//         });
        
//         if (validEmails.length > 0) {
//           console.log(`📧 Found ${validEmails.length} valid notification emails:`, validEmails);
//           return validEmails;
//         } else {
//           console.log(`⚠️ No valid emails found in notification_emails, falling back...`);
//           return await getFallbackEmails(workspaceId);
//         }
//       } else {
//         console.log(`⚠️ notification_emails is not a valid array, falling back...`);
//         return await getFallbackEmails(workspaceId);
//       }
//     } else {
//       console.log(`⚠️ No notification emails found in cron_settings for workspace ${workspaceId}, falling back...`);
//       return await getFallbackEmails(workspaceId);
//     }
    
//   } catch (error) {
//     console.error(`❌ Failed to fetch notification emails for workspace ${workspaceId}:`, error.message);
//     console.log('⚠️ Falling back to workspace owners...');
//     return await getFallbackEmails(workspaceId);
//   }
// };

// // Fallback function to get workspace owner emails
// const getFallbackEmails = async (workspaceId) => {
//   try {
//     console.log(`🔍 Fetching fallback emails (workspace owners) for workspace ${workspaceId}...`);
    
//     const workspaceIdInt = parseInt(workspaceId, 10);
    
//     // Get workspace owner email
//     const result = await pool.query(
//       `SELECT u.email 
//        FROM workspaces w 
//        JOIN users u ON w.owner_id = u.id 
//        WHERE w.id = $1`,
//       [workspaceIdInt]
//     );
    
//     const ownerEmails = result.rows.map(row => row.email);
    
//     console.log(`📧 Found ${ownerEmails.length} workspace owner(s):`, ownerEmails);
    
//     if (ownerEmails.length === 0) {
//       console.log(`⚠️ No workspace owners found, using ultimate fallback...`);
//       return ['satyajeet@infrahive.ai']; // Ultimate fallback
//     }
    
//     return ownerEmails;
    
//   } catch (error) {
//     console.error(`❌ Failed to fetch fallback emails:`, error.message);
//     console.log('⚠️ Using ultimate fallback email');
//     return ['satyajeet@infrahive.ai']; // Ultimate fallback
//   }
// };

// // MAIN UPDATED FUNCTION: Enhanced email notification with automatic email fetching
// export const sendChangeNotificationEmail = async (caseRow, changes, customEmails = null) => {
//   try {
//     console.log(`📧 ===== EMAIL NOTIFICATION START =====`);
//     console.log(`📧 Preparing email notification for case:`, {
//       cnr: caseRow.cnr,
//       filing_number: caseRow.filing_number,
//       diary_number: caseRow.diary_number,
//       case_year: caseRow.case_year,
//       court: caseRow.court,
//       workspace_id: caseRow.workspace_id,
//       hasCustomEmails: !!customEmails
//     });

//     // STEP 1: Determine recipient emails
//     let recipientEmails = [];
    
//     if (customEmails && Array.isArray(customEmails) && customEmails.length > 0) {
//       // Use custom emails if provided (from cron job)
//       recipientEmails = customEmails;
//       console.log(`📧 Using provided custom emails: ${recipientEmails.join(", ")}`);
//     } else {
//       // Fetch emails from cron_settings table
//       recipientEmails = await getNotificationEmails(caseRow.workspace_id);
//       console.log(`📧 Fetched emails from cron_settings: ${recipientEmails.join(", ")}`);
//     }

//     // STEP 2: Validate recipient emails
//     if (!recipientEmails || recipientEmails.length === 0) {
//       console.error("❌ No recipient emails found, cannot send notification");
//       throw new Error("No recipient emails available");
//     }

//     // Filter out any invalid emails (double-check)
//     const validEmails = recipientEmails.filter(email => {
//       const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//       const isValid = emailRegex.test(email);
//       if (!isValid) {
//         console.warn(`⚠️ Invalid email filtered out: ${email}`);
//       }
//       return isValid;
//     });

//     if (validEmails.length === 0) {
//       console.error("❌ No valid recipient emails found after filtering");
//       throw new Error("No valid recipient emails available");
//     }

//     console.log(`📧 Final valid emails (${validEmails.length}):`, validEmails);

//     // STEP 3: Determine case identifier and type
//     const getCaseIdentifier = (caseRow) => {
//       if (caseRow.cnr) {
//         return { type: "CNR", value: caseRow.cnr };
//       } else if (caseRow.filing_number) {
//         return { type: "Filing Number", value: caseRow.filing_number };
//       } else if (caseRow.diary_number && caseRow.case_year) {
//         return { type: "Diary Number", value: `${caseRow.diary_number}/${caseRow.case_year}` };
//       } else {
//         return { type: "Case ID", value: caseRow.id || "Unknown" };
//       }
//     };

//     const identifier = getCaseIdentifier(caseRow);
//     const courtName = caseRow.court || "Unknown Court";

//     console.log(`📧 Case details:`, { identifier, courtName });

//     // STEP 4: Format changes for email content
//     const formatChanges = (changes) => {
//       let formatted = [];
//       for (const [key, change] of Object.entries(changes)) {
//         // Safely format values, handling null/undefined
//         const formatValue = (value) => {
//           if (value === null) return "<em>null</em>";
//           if (value === undefined) return "<em>undefined</em>";
//           if (typeof value === "string") return value;
//           if (typeof value === "object") {
//             try {
//               return JSON.stringify(value, null, 2);
//             } catch (e) {
//               return String(value);
//             }
//           }
//           return String(value);
//         };

//         const oldValue = formatValue(change.old);
//         const newValue = formatValue(change.new);

//         formatted.push(`
//           <div style="margin-bottom: 15px; padding: 10px; border-left: 3px solid #007bff; background-color: #f8f9fa;">
//             <strong style="color: #333; font-size: 14px;">${key}:</strong>
//             <div style="margin-top: 8px;">
//               <div style="margin-bottom: 5px;">
//                 <span style="color: #dc3545; font-weight: bold;">Previous:</span> 
//                 <pre style="margin: 2px 0; padding: 5px; background-color: #fff; border: 1px solid #dee2e6; border-radius: 3px; font-size: 12px; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">${oldValue}</pre>
//               </div>
//               <div style="margin-bottom: 5px;">
//                 <span style="color: #28a745; font-weight: bold;">Current:</span> 
//                 <pre style="margin: 2px 0; padding: 5px; background-color: #fff; border: 1px solid #dee2e6; border-radius: 3px; font-size: 12px; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">${newValue}</pre>
//               </div>
//             </div>
//             <div style="margin-top: 8px; font-size: 11px; color: #6c757d; font-style: italic;">
//               Change Type: ${change.changeType || "modified"}
//             </div>
//           </div>
//         `);
//       }
//       return formatted.join("");
//     };

//     // Create text version for email clients that don't support HTML
//     const createTextVersion = (changes) => {
//       let text = [];
//       for (const [key, change] of Object.entries(changes)) {
//         text.push(`\n${key}:`);
//         text.push(`  Previous: ${JSON.stringify(change.old)}`);
//         text.push(`  Current: ${JSON.stringify(change.new)}`);
//         text.push(`  Change Type: ${change.changeType || "modified"}\n`);
//       }
//       return text.join("\n");
//     };

//     // STEP 5: Prepare and send email
//     const currentTime = new Date();
//     const istTime = currentTime.toLocaleString("en-US", {
//       weekday: "long",
//       year: "numeric",
//       month: "long",
//       day: "numeric",
//       hour: "2-digit",
//       minute: "2-digit",
//       timeZone: "Asia/Kolkata",
//     });

//     const mailOptions = {
//       from: '"InfraHive AI Support" <support@infrahive.ai>',
//       to: validEmails.join(', '),
//       subject: `🔔 ${courtName} - Case Update Alert - ${identifier.type}: ${identifier.value}`,
//       text: `
// Case Update Notification

// ${identifier.type}: ${identifier.value}
// Court: ${courtName}
// Workspace ID: ${caseRow.workspace_id}
// Detected at: ${currentTime.toISOString()}

// Changes:${createTextVersion(changes)}

// ---
// This is an automated notification from the Legal Case Monitoring System.
// Recipients: ${validEmails.join(', ')}
// Generated at: ${istTime} IST
//       `,
//       html: `
//         <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; background-color: #f5f5f5; padding: 20px;">
//           <div style="background-color: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
//             <!-- Header -->
//             <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center;">
//               <h1 style="margin: 0; font-size: 24px; font-weight: 600;">📋 Case Update Notification</h1>
//               <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Legal Case Monitoring System</p>
//             </div>
            
//             <!-- Case Information -->
//             <div style="padding: 25px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6;">
//               <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${identifier.type}</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${identifier.value}</p>
//                 </div>
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Court</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${courtName}</p>
//                 </div>
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Workspace</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${caseRow.workspace_id}</p>
//                 </div>
//                 <div>
//                   <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Detected</strong>
//                   <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${currentTime.toLocaleString()}</p>
//                 </div>
//               </div>
//             </div>
            
//             <!-- Changes Section -->
//             <div style="padding: 25px;">
//               <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px; font-weight: 600; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
//                 📝 Changes Detected (${Object.keys(changes).length})
//               </h2>
//               ${formatChanges(changes)}
//             </div>
            
//             <!-- Recipients Info -->
//             <div style="padding: 15px 25px; background-color: #e3f2fd; border-top: 1px solid #bbdefb;">
//               <p style="margin: 0; font-size: 12px; color: #1565c0; line-height: 1.5;">
//                 <strong>📧 Notification sent to:</strong> ${validEmails.join(', ')}
//               </p>
//             </div>
            
//             <!-- Footer -->
//             <div style="background-color: #e9ecef; padding: 20px; text-align: center;">
//               <p style="margin: 0; font-size: 12px; color: #6c757d; line-height: 1.5;">
//                 This is an automated notification from the <strong>Legal Case Monitoring System</strong><br>
//                 Generated on ${istTime} IST
//               </p>
//             </div>
            
//           </div>
//         </div>
//       `,
//     };

//     console.log(`📧 Sending email notification to ${validEmails.length} recipient(s)...`);
//     console.log(`📧 Subject: ${mailOptions.subject}`);
//     console.log(`📧 Recipients: ${validEmails.join(', ')}`);
    
//     const result = await transporter.sendMail(mailOptions);
    
//     console.log(`📧 ✅ Email sent successfully!`, {
//       messageId: result.messageId,
//       response: result.response,
//       recipients: validEmails,
//       workspace_id: caseRow.workspace_id,
//       caseIdentifier: identifier.value,
//       changeCount: Object.keys(changes).length
//     });

//     console.log(`📧 ===== EMAIL NOTIFICATION END =====`);

//     return result;

//   } catch (error) {
//     const identifier = caseRow.cnr || caseRow.filing_number || 
//                       (caseRow.diary_number && caseRow.case_year ? `${caseRow.diary_number}/${caseRow.case_year}` : null) ||
//                       caseRow.id || "Unknown";
    
//     console.error(`📧 ❌ Failed to send email for case ${identifier}:`, {
//       error: error.message,
//       stack: error.stack,
//       caseData: {
//         cnr: caseRow.cnr,
//         filing_number: caseRow.filing_number,
//         diary_number: caseRow.diary_number,
//         case_year: caseRow.case_year,
//         court: caseRow.court,
//         workspace_id: caseRow.workspace_id,
//       },
//       providedCustomEmails: customEmails,
//     });
//     throw error;
//   }
// };

// // BONUS: Test function to manually test email sending
// export const testEmailNotification = async (req, res) => {
//   const { workspace_id } = req.body;
  
//   try {
//     console.log(`🧪 Testing email notification for workspace ${workspace_id}`);
    
//     // Mock case data
//     const mockCase = {
//       cnr: "TEST/001/2025",
//       court: "Test Court",
//       workspace_id: workspace_id
//     };
    
//     // Mock changes
//     const mockChanges = {
//       status: {
//         old: "Pending",
//         new: "Under Review",
//         changeType: "modified"
//       },
//       nextHearing: {
//         old: "2025-08-15",
//         new: "2025-08-20",
//         changeType: "modified"
//       }
//     };
    
//     // Send test email (this will automatically fetch emails from cron_settings)
//     await sendChangeNotificationEmail(mockCase, mockChanges);
    
//     res.json({
//       success: true,
//       message: "Test email sent successfully! Check your inbox.",
//       workspace_id
//     });
    
//   } catch (error) {
//     console.error(`🧪 Test email failed:`, error);
//     res.json({
//       success: false,
//       error: error.message,
//       workspace_id
//     });
//   }
// };


import nodemailer from "nodemailer";
import pool from "../../db.js"; // Import your database pool

// Configure Nodemailer with Brevo SMTP
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
});

// Function to fetch notification emails from cron_settings
const getNotificationEmails = async (workspaceId) => {
  try {
    console.log(`📧 Fetching notification emails for workspace ${workspaceId} from cron_settings...`);
    
    // Convert workspaceId to integer in case it's passed as string
    const workspaceIdInt = parseInt(workspaceId, 10);
    
    // Get notification emails from cron_settings table
    const result = await pool.query(
      `SELECT notification_emails FROM cron_settings WHERE workspace_id = $1 AND role = $2`,
      [workspaceIdInt, "Owner"]
    );
    
    if (result.rows.length > 0 && result.rows[0].notification_emails) {
      let emails = result.rows[0].notification_emails;
      
      console.log(`📧 Raw notification emails from database:`, {
        emails,
        type: typeof emails,
        isArray: Array.isArray(emails)
      });
      
      // Handle both string and array cases
      if (typeof emails === 'string') {
        try {
          emails = JSON.parse(emails);
        } catch (parseError) {
          console.error(`❌ Failed to parse notification emails:`, parseError);
          return await getFallbackEmails(workspaceId);
        }
      }
      
      // Validate emails
      if (Array.isArray(emails) && emails.length > 0) {
        // Filter out invalid emails
        const validEmails = emails.filter(email => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(email);
        });
        
        if (validEmails.length > 0) {
          console.log(`📧 Found ${validEmails.length} valid notification emails:`, validEmails);
          return validEmails;
        } else {
          console.log(`⚠️ No valid emails found in notification_emails, falling back...`);
          return await getFallbackEmails(workspaceId);
        }
      } else {
        console.log(`⚠️ notification_emails is not a valid array, falling back...`);
        return await getFallbackEmails(workspaceId);
      }
    } else {
      console.log(`⚠️ No notification emails found in cron_settings for workspace ${workspaceId}, falling back...`);
      return await getFallbackEmails(workspaceId);
    }
    
  } catch (error) {
    console.error(`❌ Failed to fetch notification emails for workspace ${workspaceId}:`, error.message);
    console.log('⚠️ Falling back to workspace owners...');
    return await getFallbackEmails(workspaceId);
  }
};

// Fallback function to get workspace owner emails
const getFallbackEmails = async (workspaceId) => {
  try {
    console.log(`🔍 Fetching fallback emails (workspace owners) for workspace ${workspaceId}...`);
    
    const workspaceIdInt = parseInt(workspaceId, 10);
    
    // Get workspace owner email
    const result = await pool.query(
      `SELECT u.email 
       FROM workspaces w 
       JOIN users u ON w.owner_id = u.id 
       WHERE w.id = $1`,
      [workspaceIdInt]
    );
    
    const ownerEmails = result.rows.map(row => row.email);
    
    console.log(`📧 Found ${ownerEmails.length} workspace owner(s):`, ownerEmails);
    
    if (ownerEmails.length === 0) {
      console.log(`⚠️ No workspace owners found for workspace ${workspaceId}`);
      // Instead of hardcoded fallback, throw an error or return empty array
      throw new Error(`No workspace owners found for workspace ${workspaceId}`);
    }
    
    return ownerEmails;
    
  } catch (error) {
    console.error(`❌ Failed to fetch fallback emails:`, error.message);
    // Don't use hardcoded fallback - let the error bubble up
    throw new Error(`Unable to determine recipient emails for workspace ${workspaceId}: ${error.message}`);
  }
};

// MAIN UPDATED FUNCTION: Enhanced email notification with automatic email fetching
export const sendChangeNotificationEmail = async (caseRow, changes, customEmails = null) => {
  try {
    console.log(`📧 ===== EMAIL NOTIFICATION START =====`);
    console.log(`📧 Preparing email notification for case:`, {
      cnr: caseRow.cnr,
      filing_number: caseRow.filing_number,
      diary_number: caseRow.diary_number,
      case_year: caseRow.case_year,
      court: caseRow.court,
      workspace_id: caseRow.workspace_id,
      hasCustomEmails: !!customEmails
    });

    // STEP 1: Determine recipient emails
    let recipientEmails = [];
    
    if (customEmails && Array.isArray(customEmails) && customEmails.length > 0) {
      // Use custom emails if provided (from cron job)
      recipientEmails = customEmails;
      console.log(`📧 Using provided custom emails: ${recipientEmails.join(", ")}`);
    } else {
      // Fetch emails from cron_settings table
      recipientEmails = await getNotificationEmails(caseRow.workspace_id);
      console.log(`📧 Fetched emails from cron_settings: ${recipientEmails.join(", ")}`);
    }

    // STEP 2: Validate recipient emails
    if (!recipientEmails || recipientEmails.length === 0) {
      console.error("❌ No recipient emails found, cannot send notification");
      throw new Error("No recipient emails available");
    }

    // Filter out any invalid emails (double-check)
    const validEmails = recipientEmails.filter(email => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValid = emailRegex.test(email);
      if (!isValid) {
        console.warn(`⚠️ Invalid email filtered out: ${email}`);
      }
      return isValid;
    });

    if (validEmails.length === 0) {
      console.error("❌ No valid recipient emails found after filtering");
      throw new Error("No valid recipient emails available");
    }

    console.log(`📧 Final valid emails (${validEmails.length}):`, validEmails);

    // STEP 3: Determine case identifier and type
    const getCaseIdentifier = (caseRow) => {
      if (caseRow.cnr) {
        return { type: "CNR", value: caseRow.cnr };
      } else if (caseRow.filing_number) {
        return { type: "Filing Number", value: caseRow.filing_number };
      } else if (caseRow.diary_number && caseRow.case_year) {
        return { type: "Diary Number", value: `${caseRow.diary_number}/${caseRow.case_year}` };
      } else {
        return { type: "Case ID", value: caseRow.id || "Unknown" };
      }
    };

    const identifier = getCaseIdentifier(caseRow);
    const courtName = caseRow.court || "Unknown Court";

    console.log(`📧 Case details:`, { identifier, courtName });

    // STEP 4: Format changes for email content
    const formatChanges = (changes) => {
      let formatted = [];
      for (const [key, change] of Object.entries(changes)) {
        // Safely format values, handling null/undefined
        const formatValue = (value) => {
          if (value === null) return "<em>null</em>";
          if (value === undefined) return "<em>undefined</em>";
          if (typeof value === "string") return value;
          if (typeof value === "object") {
            try {
              return JSON.stringify(value, null, 2);
            } catch (e) {
              return String(value);
            }
          }
          return String(value);
        };

        const oldValue = formatValue(change.old);
        const newValue = formatValue(change.new);

        formatted.push(`
          <div style="margin-bottom: 15px; padding: 10px; border-left: 3px solid #007bff; background-color: #f8f9fa;">
            <strong style="color: #333; font-size: 14px;">${key}:</strong>
            <div style="margin-top: 8px;">
              <div style="margin-bottom: 5px;">
                <span style="color: #dc3545; font-weight: bold;">Previous:</span> 
                <pre style="margin: 2px 0; padding: 5px; background-color: #fff; border: 1px solid #dee2e6; border-radius: 3px; font-size: 12px; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">${oldValue}</pre>
              </div>
              <div style="margin-bottom: 5px;">
                <span style="color: #28a745; font-weight: bold;">Current:</span> 
                <pre style="margin: 2px 0; padding: 5px; background-color: #fff; border: 1px solid #dee2e6; border-radius: 3px; font-size: 12px; white-space: pre-wrap; max-height: 150px; overflow-y: auto;">${newValue}</pre>
              </div>
            </div>
            <div style="margin-top: 8px; font-size: 11px; color: #6c757d; font-style: italic;">
              Change Type: ${change.changeType || "modified"}
            </div>
          </div>
        `);
      }
      return formatted.join("");
    };

    // Create text version for email clients that don't support HTML
    const createTextVersion = (changes) => {
      let text = [];
      for (const [key, change] of Object.entries(changes)) {
        text.push(`\n${key}:`);
        text.push(`  Previous: ${JSON.stringify(change.old)}`);
        text.push(`  Current: ${JSON.stringify(change.new)}`);
        text.push(`  Change Type: ${change.changeType || "modified"}\n`);
      }
      return text.join("\n");
    };

    // STEP 5: Prepare and send email
    const currentTime = new Date();
    const istTime = currentTime.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    });

    const mailOptions = {
      from: '"InfraHive AI Support" <support@infrahive.ai>',
      to: validEmails.join(', '),
      subject: `🔔 ${courtName} - Case Update Alert - ${identifier.type}: ${identifier.value}`,
      text: `
Case Update Notification

${identifier.type}: ${identifier.value}
Court: ${courtName}
Workspace ID: ${caseRow.workspace_id}
Detected at: ${currentTime.toISOString()}

Changes:${createTextVersion(changes)}

---
This is an automated notification from the Legal Case Monitoring System.
Recipients: ${validEmails.join(', ')}
Generated at: ${istTime} IST
      `,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 700px; margin: 0 auto; background-color: #f5f5f5; padding: 20px;">
          <div style="background-color: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">📋 Case Update Notification</h1>
              <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Legal Case Monitoring System</p>
            </div>
            
            <!-- Case Information -->
            <div style="padding: 25px; background-color: #f8f9fa; border-bottom: 1px solid #dee2e6;">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div>
                  <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">${identifier.type}</strong>
                  <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${identifier.value}</p>
                </div>
                <div>
                  <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Court</strong>
                  <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${courtName}</p>
                </div>
                <div>
                  <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Workspace</strong>
                  <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${caseRow.workspace_id}</p>
                </div>
                <div>
                  <strong style="color: #495057; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Detected</strong>
                  <p style="margin: 3px 0 0 0; font-size: 16px; font-weight: 600; color: #212529;">${currentTime.toLocaleString()}</p>
                </div>
              </div>
            </div>
            
            <!-- Changes Section -->
            <div style="padding: 25px;">
              <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px; font-weight: 600; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
                📝 Changes Detected (${Object.keys(changes).length})
              </h2>
              ${formatChanges(changes)}
            </div>
            
            <!-- Recipients Info -->
            <div style="padding: 15px 25px; background-color: #e3f2fd; border-top: 1px solid #bbdefb;">
              <p style="margin: 0; font-size: 12px; color: #1565c0; line-height: 1.5;">
                <strong>📧 Notification sent to:</strong> ${validEmails.join(', ')}
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #e9ecef; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #6c757d; line-height: 1.5;">
                This is an automated notification from the <strong>Legal Case Monitoring System</strong><br>
                Generated on ${istTime} IST
              </p>
            </div>
            
          </div>
        </div>
      `,
    };

    console.log(`📧 Sending email notification to ${validEmails.length} recipient(s)...`);
    console.log(`📧 Subject: ${mailOptions.subject}`);
    console.log(`📧 Recipients: ${validEmails.join(', ')}`);
    
    const result = await transporter.sendMail(mailOptions);
    
    console.log(`📧 ✅ Email sent successfully!`, {
      messageId: result.messageId,
      response: result.response,
      recipients: validEmails,
      workspace_id: caseRow.workspace_id,
      caseIdentifier: identifier.value,
      changeCount: Object.keys(changes).length
    });

    console.log(`📧 ===== EMAIL NOTIFICATION END =====`);

    return result;

  } catch (error) {
    const identifier = caseRow.cnr || caseRow.filing_number || 
                      (caseRow.diary_number && caseRow.case_year ? `${caseRow.diary_number}/${caseRow.case_year}` : null) ||
                      caseRow.id || "Unknown";
    
    console.error(`📧 ❌ Failed to send email for case ${identifier}:`, {
      error: error.message,
      stack: error.stack,
      caseData: {
        cnr: caseRow.cnr,
        filing_number: caseRow.filing_number,
        diary_number: caseRow.diary_number,
        case_year: caseRow.case_year,
        court: caseRow.court,
        workspace_id: caseRow.workspace_id,
      },
      providedCustomEmails: customEmails,
    });
    throw error;
  }
};

// BONUS: Test function to manually test email sending
export const testEmailNotification = async (req, res) => {
  const { workspace_id } = req.body;
  
  try {
    console.log(`🧪 Testing email notification for workspace ${workspace_id}`);
    
    // Mock case data
    const mockCase = {
      cnr: "TEST/001/2025",
      court: "Test Court",
      workspace_id: workspace_id
    };
    
    // Mock changes
    const mockChanges = {
      status: {
        old: "Pending",
        new: "Under Review",
        changeType: "modified"
      },
      nextHearing: {
        old: "2025-08-15",
        new: "2025-08-20",
        changeType: "modified"
      }
    };
    
    // Send test email (this will automatically fetch emails from cron_settings)
    await sendChangeNotificationEmail(mockCase, mockChanges);
    
    res.json({
      success: true,
      message: "Test email sent successfully! Check your inbox.",
      workspace_id
    });
    
  } catch (error) {
    console.error(`🧪 Test email failed:`, error);
    res.json({
      success: false,
      error: error.message,
      workspace_id
    });
  }
};
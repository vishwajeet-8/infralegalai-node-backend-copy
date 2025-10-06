import dotenv from "dotenv";
import axios from "axios";
import nodemailer from "nodemailer";
dotenv.config();

// export async function sendEmail(email, subject, htmlContent) {
//   const transporter = nodemailer.createTransport({
//     host: "smtp-relay.brevo.com",
//     port: 587,
//     secure: false,
//     auth: {
//       user: process.env.BREVO_USER,
//       pass: process.env.BREVO_SMTP_KEY,
//     },
//   });

//   await transporter.sendMail({
//     from: '"InfraHive AI Support" <support@infrahive.ai>',
//     to: email,
//     subject,
//     html: htmlContent,
//   });
// }

export async function sendEmail(email, subject, htmlContent) {
  try {
    const res = await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { name: "InfraHive AI Support", email: "support@infrahive.ai" },
        to: [{ email }],
        subject,
        htmlContent,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY, // use Brevo API key, not SMTP key
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ Email sent:", res.data);
  } catch (err) {
    console.error("❌ Email error:", err.response?.data || err.message);
  }
}

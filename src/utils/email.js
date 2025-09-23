import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

export async function sendEmail(email, subject, htmlContent) {
  const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_USER,
      pass: process.env.BREVO_SMTP_KEY,
    },
  });

  await transporter.sendMail({
    from: '"InfraHive AI Support" <support@infrahive.ai>',
    to: email,
    subject,
    html: htmlContent,
  });
}

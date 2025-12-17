import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Check if SMTP is configured
const isSMTPConfigured = () => {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
};

// Create transporter with better connection options
const createTransporter = () => {
  if (!isSMTPConfigured()) {
    console.warn('⚠️  SMTP not configured. Email sending will be disabled.');
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || '587');
  const secure = port === 465; // Port 465 requires secure: true, 587 uses STARTTLS

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: port,
    secure: secure, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 30000, // 30 seconds
    greetingTimeout: 30000, // 30 seconds
    socketTimeout: 30000, // 30 seconds
    requireTLS: !secure, // Only require TLS for non-SSL ports (587)
    tls: {
      rejectUnauthorized: false, // For development, set to true in production
    },
    debug: true, // Set to true for detailed debugging
    logger: true, // Set to true to see SMTP logs
  });

  return transporter;
};

// Get or create transporter (reuse if available, create new if needed)
let cachedTransporter = null;

const getTransporter = () => {
  if (!cachedTransporter) {
    cachedTransporter = createTransporter();
  }
  return cachedTransporter;
};

// Verify transporter configuration on startup (only if configured)
const initialTransporter = createTransporter();
if (initialTransporter) {
  initialTransporter.verify(function (error, success) {
    if (error) {
      console.error('❌ SMTP Connection Error:', error.message);
      console.error('   Error Code:', error.code);
      console.error('   Please check your SMTP configuration in .env file');
      console.error('   Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
      if (error.code === 'ETIMEDOUT') {
        console.error('   Connection timeout - check your network/firewall settings');
      } else if (error.code === 'EAUTH') {
        console.error('   Authentication failed - check SMTP_USER and SMTP_PASS');
      }
    } else {
      console.log('✅ SMTP Server is ready to send emails');
      console.log('   Host:', process.env.SMTP_HOST || 'smtp.gmail.com');
      console.log('   Port:', process.env.SMTP_PORT || '587');
      console.log('   User:', process.env.SMTP_USER);
    }
  });
} else {
  console.warn('⚠️  SMTP transporter not created. Check your .env file for SMTP configuration.');
}

export const sendPasswordResetEmail = async (email, resetToken) => {
  // Check if SMTP is configured
  if (!isSMTPConfigured()) {
    console.error('❌ SMTP Configuration Missing:');
    console.error('   SMTP_USER:', process.env.SMTP_USER ? '✓ Set' : '✗ Missing');
    console.error('   SMTP_PASS:', process.env.SMTP_PASS ? '✓ Set' : '✗ Missing');
    throw new Error('SMTP is not configured. Please set SMTP_USER and SMTP_PASS in .env file');
  }

  // Create fresh transporter for each email to ensure connection
  const transporter = getTransporter();
  if (!transporter) {
    console.error('❌ SMTP Transporter not created');
    throw new Error('SMTP transporter not available. Please check your configuration.');
  }

  try {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
    
    console.log('📧 Attempting to send password reset email...');
    console.log('   To:', email);
    console.log('   From:', process.env.SMTP_USER);
    console.log('   Host:', process.env.SMTP_HOST || 'smtp.gmail.com');
    console.log('   Port:', process.env.SMTP_PORT || '587');
    
    const mailOptions = {
      from: `"Luxury Stay" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Password Reset Request - Luxury Stay',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #564ade; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #ffffff; margin: 0;">Luxury Stay</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #111827; margin-top: 0;">Password Reset Request</h2>
            <p>Hello,</p>
            <p>We received a request to reset your password for your Luxury Stay account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #564ade; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600;">
                Reset Password
              </a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #564ade;">${resetUrl}</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              <strong>Note:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">
              © 2025 Luxury Stay. All rights reserved.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request - Luxury Stay
        
        We received a request to reset your password.
        
        Click this link to reset your password:
        ${resetUrl}
        
        This link will expire in 1 hour.
        
        If you didn't request this, please ignore this email.
      `,
    };

    // Send email with promise to ensure it completes
    const info = await new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          reject(error);
        } else {
          resolve(info);
        }
      });
    });
    
    console.log('✅ Password reset email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('   Accepted:', info.accepted);
    console.log('   Rejected:', info.rejected);
    
    // Check if email was actually accepted
    if (info.rejected && info.rejected.length > 0) {
      console.error('⚠️  Email was rejected by server:', info.rejected);
      throw new Error(`Email was rejected: ${info.rejected.join(', ')}`);
    }
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending password reset email:');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    console.error('   Command:', error.command);
    console.error('   Full Error:', JSON.stringify(error, null, 2));
    
    // Try to recreate transporter if connection issue
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      console.log('🔄 Attempting to recreate transporter...');
      cachedTransporter = null; // Clear cached transporter
      const newTransporter = getTransporter();
      if (newTransporter) {
        console.log('✅ New transporter created, retrying...');
        // Retry once with new transporter
        try {
          const retryInfo = await newTransporter.sendMail(mailOptions);
          console.log('✅ Email sent successfully on retry!');
          return { success: true, messageId: retryInfo.messageId };
        } catch (retryError) {
          console.error('❌ Retry also failed:', retryError.message);
        }
      }
      throw new Error('SMTP connection failed. Please check your SMTP_HOST and SMTP_PORT settings, and ensure your firewall allows SMTP connections.');
    } else if (error.code === 'EAUTH') {
      throw new Error('SMTP authentication failed. Please check your SMTP_USER and SMTP_PASS. For Gmail, make sure you are using an App Password, not your regular password.');
    } else if (error.code === 'EENVELOPE') {
      throw new Error('Invalid email address. Please check the recipient email.');
    } else {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
};


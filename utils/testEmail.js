// Test email script - Run with: node utils/testEmail.js
import dotenv from 'dotenv';
import { sendPasswordResetEmail } from './emailService.js';

dotenv.config();

const testEmail = async () => {
  console.log('🧪 Testing Email Service...\n');
  
  // Check environment variables
  console.log('Environment Check:');
  console.log('  SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com (default)');
  console.log('  SMTP_PORT:', process.env.SMTP_PORT || '587 (default)');
  console.log('  SMTP_USER:', process.env.SMTP_USER || '❌ NOT SET');
  console.log('  SMTP_PASS:', process.env.SMTP_PASS ? '✓ Set' : '❌ NOT SET');
  console.log('  FRONTEND_URL:', process.env.FRONTEND_URL || 'http://localhost:5173 (default)');
  console.log('');

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ SMTP credentials not configured!');
    console.error('Please set SMTP_USER and SMTP_PASS in your .env file');
    process.exit(1);
  }

  // Test email
  const testEmailAddress = process.env.SMTP_USER; // Send to yourself
  const testToken = 'test-token-12345';

  try {
    console.log(`📧 Sending test email to: ${testEmailAddress}\n`);
    await sendPasswordResetEmail(testEmailAddress, testToken);
    console.log('\n✅ Test email sent successfully!');
    console.log('Check your inbox (and spam folder) for the test email.');
  } catch (error) {
    console.error('\n❌ Test email failed:');
    console.error('Error:', error.message);
    process.exit(1);
  }
};

testEmail();


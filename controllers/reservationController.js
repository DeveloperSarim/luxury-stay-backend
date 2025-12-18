import { Reservation } from '../models/Reservation.js';
import { Room } from '../models/Room.js';
import { Guest } from '../models/Guest.js';
import { User } from '../models/User.js';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Public booking endpoint (no auth required)
export const createPublicReservation = async (req, res, next) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      room: roomId, 
      checkInDate, 
      checkOutDate, 
      numGuests, 
      notes,
      password 
    } = req.body;

    // Validate room availability
    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if room is in maintenance or cleaning (permanent unavailable)
    if (room.status === 'maintenance' || room.status === 'cleaning') {
      return res.status(400).json({ message: `Room is ${room.status}. Please select an available room.` });
    }

    // Check date-based availability - see if room is already booked for these dates
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    
    const conflictingReservations = await Reservation.find({
      room: roomId,
      status: { $in: ['reserved', 'checked_in'] },
      $or: [
        {
          checkInDate: { $lte: checkOut },
          checkOutDate: { $gte: checkIn }
        }
      ]
    });

    if (conflictingReservations.length > 0) {
      return res.status(400).json({ message: 'Room is already booked for the selected dates. Please choose different dates.' });
    }

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ message: 'First name, last name, email, and phone are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if guest exists, if not create one
    let guest = await Guest.findOne({ email: email.toLowerCase() });
    if (!guest) {
      // Password is required for new guests
      if (!password || password.trim() === '') {
        return res.status(400).json({ message: 'Password is required for guest account' });
      }
      
      try {
        guest = await Guest.create({
          firstName,
          lastName,
          email: email.toLowerCase(),
          phone,
          password, // Password will be hashed by pre-save hook
          notes: notes || ''
        });
      } catch (guestError) {
        console.error('Error creating guest:', guestError);
        // Handle Mongoose validation errors
        if (guestError.name === 'ValidationError') {
          const errors = Object.values(guestError.errors).map(err => err.message).join(', ');
          return res.status(400).json({ 
            message: `Validation error: ${errors}`,
            details: guestError.errors
          });
        }
        return res.status(400).json({ 
          message: guestError.message || 'Failed to create guest account. Please check your information.',
          error: guestError.name || 'Unknown error'
        });
      }
    } else {
      // Update guest info if exists
      guest.firstName = firstName;
      guest.lastName = lastName;
      guest.phone = phone;
      if (notes) guest.notes = notes;
      // Update password if provided (optional for existing guests)
      if (password && password.trim() !== '') {
        guest.password = password; // Will be hashed by pre-save hook
      }
      try {
        await guest.save();
      } catch (saveError) {
        console.error('Error saving guest:', saveError);
        // Handle Mongoose validation errors
        if (saveError.name === 'ValidationError') {
          const errors = Object.values(saveError.errors).map(err => err.message).join(', ');
          return res.status(400).json({ 
            message: `Validation error: ${errors}`,
            details: saveError.errors
          });
        }
        return res.status(400).json({ 
          message: saveError.message || 'Failed to update guest information.',
          error: saveError.name || 'Unknown error'
        });
      }
    }

    // Validate dates (checkIn and checkOut already declared above)
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ message: 'Check-in and check-out dates are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    if (checkIn < today) {
      return res.status(400).json({ message: 'Check-in date cannot be in the past' });
    }

    if (checkOut <= checkIn) {
      return res.status(400).json({ message: 'Check-out date must be after check-in date' });
    }

    // Calculate total amount
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    const totalAmount = nights * (room.pricePerNight || 0);

    // Create reservation
    const reservation = await Reservation.create({
      guest: guest._id,
      room: roomId,
      checkInDate,
      checkOutDate,
      numGuests: numGuests || 1,
      totalAmount,
      notes,
      status: 'reserved',
      paymentStatus: 'pending'
    });

    // Generate QR code
    let qrCodeImage = '';
    const qrData = JSON.stringify({
      reservationId: reservation._id.toString(),
      guestId: guest._id.toString(),
      roomNumber: room.roomNumber,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate
    });
    
    if (QRCode) {
      try {
        qrCodeImage = await QRCode.toDataURL(qrData);
        reservation.qrCode = qrCodeImage;
        reservation.qrCodeData = qrData;
        await reservation.save();
      } catch (qrError) {
        console.error('QR code generation failed:', qrError);
        reservation.qrCodeData = qrData;
        await reservation.save();
      }
    } else {
      reservation.qrCodeData = qrData;
      await reservation.save();
    }

    // Don't update room status permanently - availability is date-based
    // Room status will remain 'available' and we check dates for conflicts

    // Send email with QR code (optional - won't fail booking if email fails)
    try {
      if (nodemailer && process.env.SMTP_USER) {
        await sendBookingConfirmationEmail(email, {
          firstName,
          lastName,
          roomNumber: room.roomNumber,
          roomType: room.type,
          checkInDate,
          checkOutDate,
          numGuests: numGuests || 1,
          totalAmount,
          qrCodeImage: qrCodeImage || '',
          reservationId: reservation._id.toString()
        });
      } else {
        console.log('Email not sent - SMTP not configured');
      }
    } catch (emailError) {
      console.error('Email sending failed (non-critical):', emailError.message);
      // Don't fail the booking if email fails
    }

    // Populate and return
    const populatedReservation = await Reservation.findById(reservation._id)
      .populate('guest')
      .populate('room');

    if (!populatedReservation) {
      return res.status(500).json({ message: 'Failed to retrieve reservation' });
    }

    res.status(201).json({
      ...populatedReservation.toObject(),
      qrCode: qrCodeImage || '',
      message: qrCodeImage ? 'Booking confirmed! Check your email for QR code.' : 'Booking confirmed!'
    });
  } catch (err) {
    next(err);
  }
};

export const createReservation = async (req, res, next) => {
  try {
    const { room: roomId, checkInDate, checkOutDate, numGuests, notes } = req.body;
    const userId = req.user.id;
    
    // Try User model first, then Guest model
    let user = await User.findById(userId);
    let isGuest = false;
    let userEmail = null;
    let userName = null;
    let userPhone = null;
    
    if (!user) {
      const guest = await Guest.findById(userId);
      if (guest) {
        isGuest = true;
        userEmail = guest.email;
        userName = `${guest.firstName} ${guest.lastName}`.trim();
        userPhone = guest.phone || '';
      }
    } else {
      userEmail = user.email;
      userName = user.name;
      userPhone = user.phone || '';
    }
    
    if (!userEmail) {
      res.status(404);
      throw new Error('User not found');
    }
    
    const room = await Room.findById(roomId);
    if (!room || room.status !== 'available') {
      res.status(400);
      throw new Error('Room not available');
    }
    
    // Check date conflicts
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    
    const conflictingReservations = await Reservation.find({
      room: roomId,
      status: { $in: ['reserved', 'checked_in'] },
      $or: [
        {
          checkInDate: { $lte: checkOut },
          checkOutDate: { $gte: checkIn }
        }
      ]
    });
    
    if (conflictingReservations.length > 0) {
      res.status(400);
      throw new Error('Room is already booked for the selected dates');
    }
    
    // Find or create guest
    let guest = await Guest.findOne({ email: userEmail.toLowerCase() });
    if (!guest) {
      // Create guest from user info
      const nameParts = userName.split(' ');
      guest = await Guest.create({
        firstName: nameParts[0] || userName,
        lastName: nameParts.slice(1).join(' ') || '',
        email: userEmail.toLowerCase(),
        phone: userPhone || '',
        // password is optional - not required for authenticated users
      });
    } else {
      // Update guest info if exists
      const nameParts = userName.split(' ');
      guest.firstName = nameParts[0] || userName;
      guest.lastName = nameParts.slice(1).join(' ') || '';
      if (userPhone) {
        guest.phone = userPhone;
      }
      await guest.save();
    }
    
    // Create reservation
    const reservation = await Reservation.create({
      guest: guest._id,
      room: roomId,
      checkInDate,
      checkOutDate,
      numGuests: numGuests || 1,
      notes: notes || '',
      status: 'reserved',
    });
    
    // Update room status
    room.status = 'reserved';
    await room.save();
    
    const populatedReservation = await Reservation.findById(reservation._id)
      .populate('room')
      .populate('guest');
    
    // Generate QR code for email
    let qrCodeImage = '';
    const qrData = JSON.stringify({
      reservationId: reservation._id.toString(),
      guestId: guest._id.toString(),
      roomNumber: room.roomNumber,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate
    });
    
    try {
      qrCodeImage = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 250
      });
      
      // Save QR code to reservation
      reservation.qrCode = qrCodeImage;
      reservation.qrCodeData = qrData;
      await reservation.save();
    } catch (qrError) {
      console.error('QR code generation failed:', qrError);
    }
    
    // Send email with digital card PDF (non-blocking)
    try {
      const bookingData = {
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        phone: guest.phone || '',
        reservationId: reservation._id.toString(),
        roomNumber: room.roomNumber,
        roomType: room.type,
        checkInDate: checkInDate,
        checkOutDate: checkOutDate,
        numGuests: numGuests || 1,
        totalAmount: 0, // Calculate if needed
        qrCodeImage: qrCodeImage
      };
      
      // Generate and send digital card PDF via email
      await sendBookingConfirmationEmailWithPDF(userEmail, bookingData, reservation._id.toString(), qrCodeImage, guest, room, checkInDate, checkOutDate);
    } catch (emailError) {
      console.error('Failed to send booking confirmation email:', emailError.message);
      // Don't fail the booking if email fails
    }
    
    res.status(201).json(populatedReservation);
  } catch (err) {
    next(err);
  }
};

// Generate digital card PDF
const generateDigitalCardPDF = async (reservationId, qrCodeDataUrl, guest, room, checkInDate, checkOutDate) => {
  return new Promise((resolve, reject) => {
    try {
      const tempDir = path.join(__dirname, '../temp');
      
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const pdfPath = path.join(tempDir, `digital-card-${reservationId}.pdf`);
      const doc = new PDFDocument({
        size: [800, 500],
        layout: 'landscape',
        margin: 0
      });
      
      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);
      
      // Purple gradient background (simulated with rectangle)
      doc.rect(0, 0, 800, 500)
         .fillColor('#564ade')
         .fill();
      
      // White card
      doc.roundedRect(40, 40, 720, 420, 24)
         .fillColor('#ffffff')
         .fill()
         .strokeColor('#e5e7eb')
         .lineWidth(2)
         .stroke();
      
      // Title
      doc.fontSize(36)
         .fillColor('#564ade')
         .font('Helvetica-Bold')
         .text('Virtual Booking Card', 400, 100, {
           align: 'center',
           width: 720
         });
      
      // QR Code (center)
      if (qrCodeDataUrl) {
        const qrBase64 = qrCodeDataUrl.split(',')[1];
        const qrBuffer = Buffer.from(qrBase64, 'base64');
        doc.image(qrBuffer, 275, 150, {
          width: 250,
          height: 250,
          fit: [250, 250]
        });
      }
      
      // Booking Details - Left Side
      doc.fontSize(16)
         .fillColor('#6b7280')
         .font('Helvetica-Bold')
         .text('Name', 80, 150);
      
      doc.fontSize(18)
         .fillColor('#111827')
         .font('Helvetica')
         .text(`${guest.firstName} ${guest.lastName}`.trim(), 80, 175);
      
      doc.fontSize(16)
         .fillColor('#6b7280')
         .font('Helvetica-Bold')
         .text('Email', 80, 220);
      
      doc.fontSize(18)
         .fillColor('#111827')
         .font('Helvetica')
         .text(guest.email || 'N/A', 80, 245);
      
      doc.fontSize(16)
         .fillColor('#6b7280')
         .font('Helvetica-Bold')
         .text('Phone', 80, 290);
      
      doc.fontSize(18)
         .fillColor('#111827')
         .font('Helvetica')
         .text(guest.phone || 'N/A', 80, 315);
      
      doc.fontSize(16)
         .fillColor('#6b7280')
         .font('Helvetica-Bold')
         .text('Room', 80, 360);
      
      doc.fontSize(18)
         .fillColor('#111827')
         .font('Helvetica')
         .text(`Room ${room.roomNumber}`, 80, 385);
      
      // Booking Details - Right Side
      doc.fontSize(16)
         .fillColor('#6b7280')
         .font('Helvetica-Bold')
         .text('Check-in', 600, 360);
      
      doc.fontSize(18)
         .fillColor('#111827')
         .font('Helvetica')
         .text(new Date(checkInDate).toLocaleDateString('en-GB'), 600, 385);
      
      doc.fontSize(16)
         .fillColor('#6b7280')
         .font('Helvetica-Bold')
         .text('Check-out', 600, 420);
      
      doc.fontSize(18)
         .fillColor('#111827')
         .font('Helvetica')
         .text(new Date(checkOutDate).toLocaleDateString('en-GB'), 600, 445);
      
      doc.end();
      
      stream.on('finish', () => {
        resolve(pdfPath);
      });
      
      stream.on('error', (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Send booking confirmation email with PDF attachment
const sendBookingConfirmationEmailWithPDF = async (email, bookingData, reservationId, qrCodeImage, guest, room, checkInDate, checkOutDate) => {
  // Skip email if SMTP credentials are not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('SMTP credentials not configured, skipping email');
    return;
  }

  if (!nodemailer) {
    console.warn('Nodemailer not available, skipping email');
    return;
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch (transporterError) {
    console.error('Failed to create email transporter:', transporterError.message);
    return;
  }

  // Generate digital card PDF
  let pdfPath = null;
  try {
    pdfPath = await generateDigitalCardPDF(reservationId, qrCodeImage, guest, room, checkInDate, checkOutDate);
    console.log('✅ Digital card PDF generated:', pdfPath);
  } catch (pdfError) {
    console.error('Failed to generate PDF:', pdfError.message);
    // Continue without PDF attachment
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #564ade 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .qr-code { text-align: center; margin: 20px 0; }
        .qr-code img { max-width: 300px; border: 5px solid #564ade; border-radius: 10px; padding: 10px; background: white; }
        .info-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #564ade; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .info-row:last-child { border-bottom: none; }
        .label { font-weight: 600; color: #666; }
        .value { color: #111827; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Confirmed! 🎉</h1>
          <p>Your reservation has been successfully created</p>
        </div>
        <div class="content">
          <p>Dear ${bookingData.firstName} ${bookingData.lastName},</p>
          <p>Thank you for choosing Luxury Stay! Your booking has been confirmed.</p>
          
          <div class="info-box">
            <h3>Booking Details</h3>
            <div class="info-row">
              <span class="label">Reservation ID:</span>
              <span class="value">${bookingData.reservationId}</span>
            </div>
            <div class="info-row">
              <span class="label">Room:</span>
              <span class="value">Room ${bookingData.roomNumber} - ${bookingData.roomType}</span>
            </div>
            <div class="info-row">
              <span class="label">Check-in:</span>
              <span class="value">${new Date(bookingData.checkInDate).toLocaleDateString()}</span>
            </div>
            <div class="info-row">
              <span class="label">Check-out:</span>
              <span class="value">${new Date(bookingData.checkOutDate).toLocaleDateString()}</span>
            </div>
            <div class="info-row">
              <span class="label">Guests:</span>
              <span class="value">${bookingData.numGuests}</span>
            </div>
          </div>

          <div class="qr-code">
            <h3>Your Digital Booking Card</h3>
            <p>Your digital booking card with QR code is attached to this email as PDF.</p>
            ${qrCodeImage ? `<img src="${qrCodeImage}" alt="QR Code" />` : ''}
          </div>

          <div class="info-box">
            <h3>Important Instructions</h3>
            <ul>
              <li>Please check the attached PDF for your digital booking card</li>
              <li>Present the QR code at reception for check-in</li>
              <li>Keep this email and PDF accessible during your stay</li>
              <li>For any queries, contact us at help@luxurystay.com</li>
            </ul>
          </div>

          <div class="footer">
            <p>Luxury Stay Hotel Management System</p>
            <p>953 5th Avenue, New York, NY 10021</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const mailOptions = {
      from: `"Luxury Stay" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Booking Confirmed - Luxury Stay',
      html: htmlContent,
      attachments: []
    };

    // Add PDF attachment if generated
    if (pdfPath && fs.existsSync(pdfPath)) {
      mailOptions.attachments.push({
        filename: `digital-card-${reservationId}.pdf`,
        path: pdfPath,
        contentType: 'application/pdf'
      });
    }

    // Add QR code image attachment if available
    if (qrCodeImage && qrCodeImage.includes(',')) {
      try {
        mailOptions.attachments.push({
          filename: 'qr-code.png',
          content: qrCodeImage.split(',')[1],
          encoding: 'base64'
        });
      } catch (attachError) {
        console.warn('Failed to attach QR code to email:', attachError.message);
      }
    }

    await transporter.sendMail(mailOptions);
    console.log('✅ Booking confirmation email with PDF sent to:', email);
    
    // Clean up PDF file after sending
    if (pdfPath && fs.existsSync(pdfPath)) {
      setTimeout(() => {
        try {
          fs.unlinkSync(pdfPath);
          console.log('✅ Temporary PDF file deleted:', pdfPath);
        } catch (deleteError) {
          console.warn('Failed to delete temporary PDF:', deleteError.message);
        }
      }, 5000); // Delete after 5 seconds
    }
  } catch (mailError) {
    console.error('Failed to send email:', mailError.message);
    // Clean up PDF file even if email fails
    if (pdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (deleteError) {
        console.warn('Failed to delete temporary PDF:', deleteError.message);
      }
    }
    throw mailError;
  }
};

// Email sending function (old - kept for backward compatibility)
const sendBookingConfirmationEmail = async (email, bookingData) => {
  // Skip email if SMTP credentials are not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('SMTP credentials not configured, skipping email');
    return;
  }

  if (!nodemailer) {
    console.warn('Nodemailer not available, skipping email');
    return;
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch (transporterError) {
    console.error('Failed to create email transporter:', transporterError.message);
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #564ade 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .qr-code { text-align: center; margin: 20px 0; }
        .qr-code img { max-width: 300px; border: 5px solid #564ade; border-radius: 10px; padding: 10px; background: white; }
        .info-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #564ade; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .info-row:last-child { border-bottom: none; }
        .label { font-weight: 600; color: #666; }
        .value { color: #111827; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Booking Confirmed! 🎉</h1>
          <p>Your reservation has been successfully created</p>
        </div>
        <div class="content">
          <p>Dear ${bookingData.firstName} ${bookingData.lastName},</p>
          <p>Thank you for choosing Luxury Stay! Your booking has been confirmed.</p>
          
          <div class="info-box">
            <h3>Booking Details</h3>
            <div class="info-row">
              <span class="label">Reservation ID:</span>
              <span class="value">${bookingData.reservationId}</span>
            </div>
            <div class="info-row">
              <span class="label">Room:</span>
              <span class="value">Room ${bookingData.roomNumber} - ${bookingData.roomType}</span>
            </div>
            <div class="info-row">
              <span class="label">Check-in:</span>
              <span class="value">${new Date(bookingData.checkInDate).toLocaleDateString()}</span>
            </div>
            <div class="info-row">
              <span class="label">Check-out:</span>
              <span class="value">${new Date(bookingData.checkOutDate).toLocaleDateString()}</span>
            </div>
            <div class="info-row">
              <span class="label">Guests:</span>
              <span class="value">${bookingData.numGuests}</span>
            </div>
            <div class="info-row">
              <span class="label">Total Amount:</span>
              <span class="value">$${bookingData.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div class="qr-code">
            <h3>Your Check-in QR Code</h3>
            <p>Please present this QR code at reception for check-in/check-out</p>
            <img src="${bookingData.qrCodeImage}" alt="QR Code" />
          </div>

          <div class="info-box">
            <h3>Important Instructions</h3>
            <ul>
              <li>Please arrive at the reception with this QR code</li>
              <li>The receptionist will scan your QR code for check-in</li>
              <li>Keep this email accessible during your stay</li>
              <li>For any queries, contact us at help@luxurystay.com</li>
            </ul>
          </div>

          <div class="footer">
            <p>Luxury Stay Hotel Management System</p>
            <p>953 5th Avenue, New York, NY 10021</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const mailOptions = {
      from: process.env.SMTP_USER || 'noreply@luxurystay.com',
      to: email,
      subject: 'Booking Confirmed - Luxury Stay',
      html: htmlContent
    };

    // Add QR code attachment only if available
    if (bookingData.qrCodeImage && bookingData.qrCodeImage.includes(',')) {
      try {
        mailOptions.attachments = [{
          filename: 'qr-code.png',
          content: bookingData.qrCodeImage.split(',')[1],
          encoding: 'base64'
        }];
      } catch (attachError) {
        console.warn('Failed to attach QR code to email:', attachError.message);
        // Continue without attachment
      }
    }

    await transporter.sendMail(mailOptions);
    console.log('Booking confirmation email sent to:', email);
  } catch (mailError) {
    console.error('Failed to send email:', mailError.message);
    throw mailError; // Re-throw to be caught by caller
  }
};

export const listReservations = async (req, res, next) => {
  try {
    const reservations = await Reservation.find()
      .populate('guest')
      .populate('room');
    res.json(reservations);
  } catch (err) {
    next(err);
  }
};

// Generate/Download QR code for reservation
export const downloadQRCode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const reservation = await Reservation.findById(id)
      .populate('guest')
      .populate('room');
    
    if (!reservation) {
      res.status(404);
      throw new Error('Reservation not found');
    }
    
    // Check if user owns this reservation
    // Try User model first, then Guest model
    let user = await User.findById(userId);
    let userEmail = null;
    
    if (user) {
      userEmail = user.email;
    } else {
      const guestUser = await Guest.findById(userId);
      if (guestUser) {
        userEmail = guestUser.email;
      }
    }
    
    if (!userEmail) {
      res.status(404);
      throw new Error('User not found');
    }
    
    // Verify ownership - check if guest email matches user email
    const guest = await Guest.findById(reservation.guest._id || reservation.guest);
    if (!guest || guest.email.toLowerCase() !== userEmail.toLowerCase()) {
      res.status(403);
      throw new Error('Unauthorized: This reservation does not belong to you');
    }
    
    // Generate QR code data with required fields
    const qrData = JSON.stringify({
      reservationId: reservation._id.toString(),
      guestId: reservation.guest._id?.toString() || reservation.guest.toString(),
      roomNumber: reservation.room?.roomNumber || '',
      checkInDate: reservation.checkInDate.toISOString().split('T')[0],
      checkOutDate: reservation.checkOutDate.toISOString().split('T')[0]
    });
    
    // Generate QR code image
    let qrCodeImage = '';
    try {
      qrCodeImage = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        width: 300
      });
    } catch (qrError) {
      console.error('QR code generation failed:', qrError);
      res.status(500);
      throw new Error('Failed to generate QR code');
    }
    
    // Update reservation with QR code if not already set
    if (!reservation.qrCode || !reservation.qrCodeData) {
      reservation.qrCode = qrCodeImage;
      reservation.qrCodeData = qrData;
      await reservation.save();
    }
    
    // Return QR code as base64 image
    res.json({
      qrCode: qrCodeImage,
      qrCodeData: qrData,
      reservationId: reservation._id.toString(),
      roomNumber: reservation.room?.roomNumber || '',
      checkInDate: reservation.checkInDate.toISOString().split('T')[0],
      checkOutDate: reservation.checkOutDate.toISOString().split('T')[0]
    });
  } catch (err) {
    next(err);
  }
};

// QR code scan for check-in
export const scanQRCode = async (req, res, next) => {
  try {
    const { qrData } = req.body;
    if (!qrData) {
      res.status(400);
      throw new Error('QR code data is required');
    }

    let qrDataParsed;
    try {
      qrDataParsed = JSON.parse(qrData);
    } catch (e) {
      res.status(400);
      throw new Error('Invalid QR code format');
    }

    const reservation = await Reservation.findById(qrDataParsed.reservationId)
      .populate('guest')
      .populate('room');
    
    if (!reservation) {
      res.status(404);
      throw new Error('Reservation not found');
    }

    res.json({
      reservation,
      isValid: true,
      message: 'QR code verified successfully'
    });
  } catch (err) {
    next(err);
  }
};

export const checkIn = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id).populate('room');
    if (!reservation) {
      res.status(404);
      throw new Error('Reservation not found');
    }
    
    // Validate check-in date - cannot check in before check-in date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for comparison
    
    const checkInDate = new Date(reservation.checkInDate);
    checkInDate.setHours(0, 0, 0, 0);
    
    if (today < checkInDate) {
      res.status(400);
      throw new Error(`Cannot check in before ${checkInDate.toLocaleDateString()}. Check-in date is ${checkInDate.toLocaleDateString()}`);
    }
    
    // Check if already checked in
    if (reservation.status === 'checked_in') {
      res.status(400);
      throw new Error('Guest is already checked in');
    }
    
    // Check if cancelled
    if (reservation.status === 'cancelled') {
      res.status(400);
      throw new Error('Cannot check in a cancelled reservation');
    }
    
    reservation.status = 'checked_in';
    await reservation.save();
    reservation.room.status = 'occupied';
    await reservation.room.save();
    res.json(reservation);
  } catch (err) {
    next(err);
  }
};

export const checkOut = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id).populate('room');
    if (!reservation) {
      res.status(404);
      throw new Error('Reservation not found');
    }
    reservation.status = 'checked_out';
    await reservation.save();
    reservation.room.status = 'cleaning';
    await reservation.room.save();
    res.json(reservation);
  } catch (err) {
    next(err);
  }
};

// Get user's own bookings
export const getMyBookings = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    
    if (!userId) {
      res.status(400);
      throw new Error('User ID not found in request');
    }
    
    // Try User model first, then Guest model
    let user = await User.findById(userId);
    let guest = null;
    
    if (user) {
      // Find guest by user email
      guest = await Guest.findOne({ email: user.email.toLowerCase() });
    } else {
      // If not found in User, try Guest model (for guest login)
      guest = await Guest.findById(userId);
    }
    
    if (!guest) {
      // No guest found means no bookings - return empty array instead of error
      return res.json([]);
    }
    
    // Find reservations for this guest
    const reservations = await Reservation.find({ guest: guest._id })
      .populate('room')
      .populate('guest')
      .sort({ createdAt: -1 });
    
    res.json(reservations);
  } catch (err) {
    console.error('getMyBookings error:', err);
    next(err);
  }
};

// Cancel booking
export const cancelBooking = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('room')
      .populate('guest');
    
    if (!reservation) {
      res.status(404);
      throw new Error('Reservation not found');
    }
    
    // Check if user owns this booking
    const userId = req.user.id;
    // Try User model first, then Guest model
    let user = await User.findById(userId);
    let userEmail = null;
    
    if (user) {
      userEmail = user.email;
    } else {
      const guest = await Guest.findById(userId);
      if (guest) {
        userEmail = guest.email;
      }
    }
    
    if (!userEmail) {
      res.status(404);
      throw new Error('User not found');
    }
    
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && reservation.guest.email !== userEmail.toLowerCase()) {
      res.status(403);
      throw new Error('Not authorized to cancel this booking');
    }
    
    // Only allow cancellation if status is 'reserved'
    if (reservation.status !== 'reserved') {
      res.status(400);
      throw new Error('Only reserved bookings can be cancelled');
    }
    
    reservation.status = 'cancelled';
    await reservation.save();
    
    // Update room status if needed
    if (reservation.room) {
      reservation.room.status = 'available';
      await reservation.room.save();
    }
    
    res.json({ message: 'Booking cancelled successfully', reservation });
  } catch (err) {
    next(err);
  }
};



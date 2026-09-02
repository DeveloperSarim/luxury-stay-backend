# Luxury Stay - Backend

Hotel Management System Backend API built with Node.js, Express, and MongoDB.

## Features

- User Authentication (JWT)
- Room Management
- Reservation Management
- Guest Management
- Chat System (User-Admin)
- Email Service (SMTP)
- QR Code Generation
- Invoice Management
- Housekeeping & Maintenance
- Reports & Analytics

## Tech Stack

- Node.js
- Express.js
- MongoDB (Mongoose)
- JWT Authentication
- Nodemailer (Email)
- QRCode (QR Generation)
- Bcrypt (Password Hashing)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create your `.env` from the template:

```bash
cp .env.example .env
```

Then fill in the values:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FRONTEND_URL=http://localhost:5173
```

> Set `NODE_ENV=production` when you deploy. The error handler only strips
> stack traces from API responses when it is set, so leaving it unset exposes
> internal paths and stack frames to every client that triggers an error.

3. Start server:
```bash
npm run dev
```

## API Endpoints

- `/api/auth` - Authentication routes
- `/api/rooms` - Room management
- `/api/reservations` - Reservation management
- `/api/guests` - Guest management
- `/api/chat` - Chat system
- `/api/invoices` - Invoice management

## License

Private - Luxury Stay HMS


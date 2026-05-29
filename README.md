# 🏫 School Management System

A comprehensive, full-stack **School Management System** built with **Next.js 16**, **TypeScript**, and **PostgreSQL**. Designed for managing attendance, students, teachers, exams, fees, reports, and more — all from a single unified dashboard.

---

## ✨ Features

- **🔐 Authentication & Roles** — JWT-based login with role-based access (Admin, Teacher, Student, Accountant, Developer)
- **📋 Attendance Management** — Mark, track, and report student & staff attendance with offline support
- **👨‍🎓 Student Management** — Enroll, import (CSV/Excel), and manage student records
- **👩‍🏫 Teacher Management** — Manage teacher profiles, subject assignments, and schedules
- **📝 Marks & Exams** — Record exam marks, co-scholastic grades, and generate report cards
- **💰 Fee Management** — Track fee payments, generate receipts, and manage billing
- **📊 Reports & Analytics** — Daily, monthly, and department-wise attendance and performance reports
- **📅 Holiday Calendar** — Manage and import school holidays
- **📧 Email Notifications** — Automated email alerts for attendance and announcements
- **📱 PWA Support** — Installable as a Progressive Web App with offline capabilities
- **⚙️ Settings** — School branding, payment gateway config, and staff attendance settings

---

## 🛠️ Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Framework   | Next.js 16 (App Router)           |
| Language    | TypeScript                        |
| Database    | PostgreSQL (Supabase compatible)  |
| Auth        | JWT (jsonwebtoken + bcrypt)       |
| Styling     | Tailwind CSS v4                   |
| UI          | Radix UI + Lucide Icons           |
| Email       | Nodemailer (Gmail SMTP)           |
| PDF Reports | Puppeteer                         |
| Data Import | PapaParse (CSV) + SheetJS (Excel) |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** database (or a [Supabase](https://supabase.com) project)
- **npm** or **yarn**

### 1. Clone the repository

```bash
git clone https://github.com/Coderbeb/School-Management-System.git
cd School-Management-System
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your database URL, JWT secret, and email credentials.

### 4. Initialize the Database

```bash
node scripts/setup-db.js
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

---

## 📁 Project Structure

```
├── public/              # Static assets, PWA manifest, service worker
├── scripts/             # Database setup, migration, and seed scripts
├── sql/                 # SQL schema and migration files
├── src/
│   ├── app/             # Next.js App Router pages & API routes
│   │   ├── api/         # REST API endpoints
│   │   ├── dashboard/   # Main dashboard
│   │   ├── attendance/  # Attendance pages
│   │   ├── manage/      # Admin management pages
│   │   ├── marks/       # Marks & exam pages
│   │   ├── reports/     # Report pages
│   │   └── settings/    # Settings pages
│   ├── components/      # Reusable UI components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utilities (auth, db, email, PDF)
│   └── types/           # TypeScript type definitions
├── .env.example         # Environment variable template
├── next.config.ts       # Next.js configuration
└── package.json
```

---

## 🌐 Deployment (Vercel)

This project is optimized for deployment on [Vercel](https://vercel.com):

1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository
3. Add your environment variables in Vercel's dashboard
4. Deploy!

> See the **Deployment Guide** section below for detailed instructions.

---

## 📄 License

This project is private and intended for educational/institutional use.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

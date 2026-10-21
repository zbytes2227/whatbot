# WhatBot - WhatsApp Campaign Manager

WhatBot is a powerful web-based application built with Next.js and MongoDB that allows users to manage and run automated WhatsApp messaging campaigns. It utilizes `@whiskeysockets/baileys` to connect to multiple WhatsApp accounts simultaneously and provides a comprehensive dashboard to track campaign progress, message delivery, and contacts.

## 🚀 Features

- **Multi-Account Support:** Connect and manage multiple WhatsApp accounts (up to 4 profiles) simultaneously by scanning QR codes directly from the dashboard.
- **Advanced Campaign Management:** Create and schedule campaigns with multiple messages in sequence.
- **Media Support:** Send text, images, videos, and documents seamlessly.
- **Intelligent Scheduling:** Set specific start and end times for campaigns in a designated timezone. The system automatically pauses campaigns at the end time and resumes them the next day.
- **Anti-Ban Features:** Configure randomized minimum and maximum delays between messages to mimic human behavior and reduce the risk of account bans.
- **Contact Management:** Upload and manage bulk contact lists (CSV support).
- **Live Reporting & Analytics:** Track real-time delivery status, success rates, failed messages, and average delivery times.
- **Secure Authentication:** Built-in user authentication using JWT and robust password hashing (Argon2/bcrypt).
- **Docker Ready:** Includes `Dockerfile` and `docker-compose` setups for straightforward deployment.

## 🛠 Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS, Lucide Icons
- **Backend:** Next.js API Routes, Node.js
- **Database:** MongoDB (Mongoose schemas)
- **WhatsApp Integration:** `@whiskeysockets/baileys`
- **Authentication:** JWT, Argon2, bcrypt

## 📂 Project Structure

- `/app`: Next.js frontend pages, layout, and UI components.
- `/pages/api`: Backend API endpoints (auth, campaigns, contacts, whatsapp logic).
- `/lib`: Core backend utilities, including the WhatsApp client manager (`whatsappClients.js`), MongoDB connection (`mongodb.js`), and logging (`logger.js`).
- `/models`: Mongoose database schemas (`Campaigns.js`, `ContactList.js`, `MessageHistory.js`).
- `/.baileys_auth`: Local storage directory for WhatsApp session state (auto-generated, git-ignored).

## 💻 Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB instance (local or Atlas)
- Docker (optional, for containerized deployment)

### Local Development

1. Clone the repository and navigate to the project folder:
   ```bash
   cd whatmot
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
   *Edit `.env.local` to include your MongoDB URI and a secure JWT secret.*

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker Deployment

To run the application using Docker, ensure your `.env.local` is configured, then run:

```bash
docker-compose -f server_docker_compose.yml up -d --build
```
This will spin up the Next.js application container with the appropriate volumes for session storage.

## ⚠️ Important Note on Session Storage
WhatsApp session files are stored in the `.baileys_auth` directory. When deploying (especially with Docker), ensure this directory is mounted as a persistent volume so you do not have to re-scan the QR codes every time the container restarts.

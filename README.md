# Intelligent Burnout Protection Agent

An AI-powered agent that proactively prevents burnout by analyzing Google Calendar patterns and automatically scheduling protective time blocks.

## 🚀 Features

- **🛡️ Meeting Marathon Defense**: Adds buffer time between back-to-back meetings
- **🍽️ Lost Lunch Defense**: Ensures you always have time for meals
- **💧 Focus Guard**: Breaks up long work sessions with recharge breaks  
- **🌙 Hard Stop**: Creates boundaries to prevent late work sessions
- **🔐 Secure Authentication**: Uses Descope Outbound Apps for secure Google OAuth
- **⏰ Automated Protection**: Runs every 20 minutes without user intervention

## 🏆 MCP Hackathon Submission
This project addresses **Theme 1: Build a purposeful AI agent** by:
- Solving the real-world problem of workplace or school burnout
- Using Descope Outbound Apps for secure API authentication
- Avoiding hardcoded credentials through proper token management
- Delivering seamless automation with minimal user effort

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Authentication**: Descope (Outbound Apps + Management SDK)
- **Scheduling**: node-cron
- **Calendar API**: Google Calendar API
- **Storage**: JSON file (for prototype)
- **Deployment**: Railway-ready

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ installed
- Descope account ([sign up free](https://descope.com/))
- Google Cloud account ([console.cloud.google.com](https://console.cloud.google.com/))

### STEPS -

# 1. Clone the Repository
```bash
git clone <url>
cd <project folder>
```

# 2. Install Dependencies

```bash
npm install
```

# 3. Environment Configuration

1. Copy .env
2. Fill in your credentials:
   · DESCOPE_PROJECT_ID: From Descope Settings > General
   · DESCOPE_OUTBOUND_APP_ID: From Descope > Applications > Outbound Apps
   · DESCOPE_MANAGEMENT_KEY: From Descope > Settings > General > Management Keys

# 4. Run the Application

```bash
npm start
```

The server will start on http://localhost:3000

const express = require('express');
const { DescopeClient } = require('descope-node');
const { google } = require('googleapis');
const cron = require('node-cron');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
app.use(express.json());

// ===== INITIALIZE DESCOPE CLIENT =====
const descope = new DescopeClient({
  projectId: process.env.DESCOPE_PROJECT_ID,
  managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
});

// ===== SIMPLE USER STORAGE =====
const USER_STORAGE_FILE = 'users.json';
let connectedUsers = [];

const loadUsers = async () => {
  try {
    const data = await fs.readFile(USER_STORAGE_FILE, 'utf8');
    connectedUsers = JSON.parse(data);
  } catch (error) {
    connectedUsers = [];
  }
};

const saveUsers = async () => {
  await fs.writeFile(USER_STORAGE_FILE, JSON.stringify(connectedUsers, null, 2));
};

// ===== AUTHENTICATION ROUTES =====
app.get('/auth', async (req, res) => {
  try {
    const redirectUrl = `${req.protocol}://${req.get('host')}/callback`;
    const resp = await descope.oauth.start('google', redirectUrl);
    res.redirect(resp.url);
  } catch (error) {
    res.status(500).send('Auth initiation failed: ' + error.message);
  }
});

app.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) throw new Error('No authorization code received');

    const redirectUrl = `${req.protocol}://${req.get('host')}/callback`;
    const authInfo = await descope.oauth.exchange(code, redirectUrl);
    const sessionToken = authInfo.sessionJwt;

    const resp = await descope.auth.validateSession(sessionToken);
    const userId = resp.userId;

    await loadUsers();
    if (!connectedUsers.includes(userId)) {
      connectedUsers.push(userId);
      await saveUsers();
      console.log(`New user connected: ${userId}`);
    }

    res.send(`
      <h1>Welcome to Intelligent Burnout Protection Agent! 🔥</h1>
      <p>Your calendar is now connected. AI Agent will now run automatically in the background.</p>
      <p>To test it, create events like "Study", "Meeting", or work past 7 PM in your Google Calendar.</p>
      <p>You can close this window.</p>
    `);

  } catch (error) {
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// ===== BURNOUT PROTECTION RULESET ENGINE =====
async function protectUser(userId) {
  console.log(`\n[Agent] Checking calendar for user: ${userId}`);
  let actionsTaken = 0;
  const actionLog = []; // To log what we did

  try {
    // 1. Get Google access token from Descope Outbound App
    const tokenResp = await descope.outbound.getToken(process.env.DESCOPE_OUTBOUND_APP_ID, userId);
    const accessToken = tokenResp.token;

    // 2. Set up Google Calendar API client
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth });

    // 3. Define time range: now -> 36 hours in future
    const now = new Date();
    const future = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    // 4. Fetch calendar events
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100 
    });

    const events = res.data.items;
    if (!events || events.length === 0) {
      console.log('  No events found in the next 36 hours.');
      return { actions: 0, log: [] };
    }

    console.log(`  Found ${events.length} events to analyze...`);

    // Convert events to a more usable format with Date objects
    const eventsWithDates = events.map(event => ({
      ...event,
      start: event.start.dateTime ? new Date(event.start.dateTime) : new Date(event.start.date),
      end: event.end.dateTime ? new Date(event.end.dateTime) : new Date(event.end.date),
      isAllDay: !event.start.dateTime // Check if it's an all-day event
    })).filter(event => !event.isAllDay); // Filter out all-day events for rule processing

    // RULE 1: Meeting Marathon Defense (3+ consecutive meetings)
    for (let i = 0; i < eventsWithDates.length - 2; i++) {
      const meeting1 = eventsWithDates[i];
      const meeting2 = eventsWithDates[i + 1];
      const meeting3 = eventsWithDates[i + 2];

      // Check if these are likely meetings and consecutive
      const gap1 = (meeting2.start - meeting1.end) / (1000 * 60); // gap in minutes
      const gap2 = (meeting3.start - meeting2.end) / (1000 * 60);

      // If 3 meetings with less than 5 min gap between them
      if (gap1 < 5 && gap2 < 5) {
        // Check if buffer already exists
        const existingBuffers = events.filter(e => 
          e.summary && e.summary.includes('Buffer Time') && 
          new Date(e.start.dateTime).getTime() === meeting2.end.getTime()
        );

        if (existingBuffers.length === 0) {
          const bufferEvent = {
            summary: '🛡️ Buffer Time (by Agent)',
            description: 'Automatically added to prevent meeting fatigue and burnout.',
            start: { dateTime: meeting2.end.toISOString() },
            end: { dateTime: new Date(meeting2.end.getTime() + 15 * 60 * 1000).toISOString() },
            colorId: 5 // Green
          };

          await calendar.events.insert({
            calendarId: 'primary',
            resource: bufferEvent
          });

          actionLog.push(`Added 15min buffer between ${meeting2.summary} and ${meeting3.summary}`);
          actionsTaken++;
          break; // Handle one marathon at a time
        }
      }
    }

    // RULE 2: The Lost Lunch Defense
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 30, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 30, 0);

    const hasLunch = eventsWithDates.some(event => {
      return event.start >= todayStart && event.end <= todayEnd && 
             /lunch|meal|break|eat|food|dinner/i.test(event.summary || '');
    });

    if (!hasLunch) {
      const lunchEvent = {
        summary: '🍽️ Lunch Break (by Agent)',
        description: 'Automatically added to ensure you take time to recharge and refuel.',
        start: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 15, 0).toISOString() },
        end: { dateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0, 0).toISOString() },
        colorId: 2 // Red for importance
      };

      await calendar.events.insert({
        calendarId: 'primary',
        resource: lunchEvent
      });

      actionLog.push('Added lunch break at 12:15 PM');
      actionsTaken++;
    }

    // RULE 3: The Focus Guard (Long work blocks > 90 minutes)
    for (const event of eventsWithDates) {
      if (/study|deep work|focus|work session|coding|homework/i.test(event.summary || '')) {
        const duration = (event.end - event.start) / (1000 * 60); // duration in minutes
        
        if (duration > 90) {
          // Check if break already exists in the middle
          const midPoint = new Date(event.start.getTime() + duration * 60 * 1000 / 2);
          const breakExists = eventsWithDates.some(e => 
            e.start.getTime() === midPoint.getTime() && 
            /break|recharge|walk/i.test(e.summary || '')
          );

          if (!breakExists) {
            const breakEnd = new Date(midPoint.getTime() + 20 * 60 * 1000);
            
            const breakEvent = {
              summary: '💧 Recharge Break (by Agent)',
              description: 'Time to hydrate, stretch, and reset. Your focus will thank you!',
              start: { dateTime: midPoint.toISOString() },
              end: { dateTime: breakEnd.toISOString() },
              colorId: 8 // Blue for calm
            };

            await calendar.events.insert({
              calendarId: 'primary',
              resource: breakEvent
            });

            actionLog.push(`Added recharge break to long session: ${event.summary}`);
            actionsTaken++;
            break; // Handle one long session at a time
          }
        }
      }
    }

    // RULE 4: The Hard Stop (Work ending after 7 PM)
    const todayEvents = eventsWithDates.filter(event => {
      return event.start.getDate() === now.getDate() &&
             event.start.getMonth() === now.getMonth() &&
             event.start.getFullYear() === now.getFullYear();
    });

    const lastWorkEvent = todayEvents.reduce((latest, event) => {
      if (/work|meeting|study|call|project/i.test(event.summary || '') && event.end > latest) {
        return event.end;
      }
      return latest;
    }, new Date(0));

    // If last work event ends after 7 PM
    if (lastWorkEvent.getHours() >= 19 || (lastWorkEvent.getHours() === 18 && lastWorkEvent.getMinutes() > 30)) {
      const hardStopTime = new Date(lastWorkEvent.getTime() + 5 * 60 * 1000); // 5 min after last event
      
      const hardStopEvent = {
        summary: '🌙 Hard Stop: Wind Down (by Agent)',
        description: 'Your workday is officially over. Time to rest and recharge for tomorrow.',
        start: { dateTime: hardStopTime.toISOString() },
        end: { dateTime: new Date(hardStopTime.getTime() + 30 * 60 * 1000).toISOString() },
        colorId: 3 // Purple for wind down
      };

      await calendar.events.insert({
        calendarId: 'primary',
        resource: hardStopEvent
      });

      actionLog.push('Added hard stop after late work');
      actionsTaken++;
    }

  } catch (error) {
    console.error(`  ❌ Error processing calendar for user ${userId}:`, error.message);
    actionLog.push(`Error: ${error.message}`);
  }

  // Log all actions taken
  actionLog.forEach(log => console.log(`  ✅ ${log}`));
  return { actions: actionsTaken, log: actionLog };
}

// ===== SCHEDULER & MANUAL TRIGGER =====
cron.schedule('*/20 * * * *', async () => {
  console.log('\n=== [Agent] Running scheduled protection check ===');
  await loadUsers();
  
  let totalActions = 0;
  for (const userId of connectedUsers) {
    const result = await protectUser(userId);
    totalActions += result.actions;
  }
  
  console.log(`=== [Agent] Check complete. Took ${totalActions} protective actions. ===\n`);
});

app.get('/run-now', async (req, res) => {
  await loadUsers();
  let results = [];
  
  for (const userId of connectedUsers) {
    const result = await protectUser(userId);
    results.push(`User ${userId}: ${result.actions} actions taken`);
    if (result.log.length > 0) {
      results.push(...result.log.map(log => `  - ${log}`));
    }
  }
  
  res.send(`<h1>Agent Manual Run</h1><pre>${results.join('\n')}</pre>`);
});

// ===== START THE SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await loadUsers();
  console.log(`\n🔥 Intelligent Burnout Protection Agent is running on http://localhost:${PORT}`);
  console.log(`🔗 Connect your calendar: http://localhost:${PORT}/auth`);
  console.log(`⏰ Agent will run automatically every 20 minutes`);
  console.log(`🧪 Manual test: http://localhost:${PORT}/run-now`);
  console.log(`\n=== Logs will appear below ===\n`);
});

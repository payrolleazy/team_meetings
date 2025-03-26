import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { msalAuth, createMeeting, checkAuth, logout } from './msGraph.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Initialize Microsoft auth
app.post('/api/auth/init', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const authUrl = await msalAuth(userId, supabase);
    res.json({ authUrl });
  } catch (error) {
    console.error('Auth initialization error:', error);
    res.status(500).json({ error: 'Authentication initialization failed' });
  }
});

// Check auth status
app.get('/api/auth/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await checkAuth(userId, supabase);
    res.json(status);
  } catch (error) {
    console.error('Auth status check error:', error);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

// Logout
app.post('/api/auth/logout/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await logout(userId, supabase);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Create meeting
app.post('/api/meetings', async (req, res) => {
  try {
    const {
      userId,
      subject,
      startTime,
      endTime,
      attendees,
      body,
      attachments = []
    } = req.body;

    if (!userId || !subject || !startTime || !endTime || !attendees) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const meeting = await createMeeting(
      userId,
      {
        subject,
        startTime,
        endTime,
        attendees,
        body,
        attachments
      },
      supabase
    );

    res.json(meeting);
  } catch (error) {
    console.error('Meeting creation error:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
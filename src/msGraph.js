import msal from 'msal';
import { GRAPH_API_ENDPOINT } from './config.js';

const SCOPES = ['Calendars.ReadWrite'];

export async function msalAuth(userId, supabase) {
  try {
    const accessTokenCache = new msal.SerializableTokenCache();
    
    // Check existing token
    const { data: existingToken } = await supabase
      .from('private.ms_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existingToken) {
      const tokenExpiration = new Date(existingToken.expires_on);
      if (new Date() < tokenExpiration) {
        return { authenticated: true };
      }
    }

    // Initialize new auth flow
    const client = new msal.PublicClientApplication({
      auth: {
        clientId: process.env.MS_APP_ID,
        authority: 'https://login.microsoftonline.com/common'
      },
      cache: accessTokenCache
    });

    const flow = await client.initiate_device_flow({ scopes: SCOPES });
    
    // Store the flow data temporarily
    await supabase
      .from('private.ms_auth_flow')
      .upsert({ 
        user_id: userId,
        flow_data: flow,
        created_at: new Date().toISOString()
      });

    return {
      authenticated: false,
      deviceCode: flow.user_code,
      verificationUrl: 'https://microsoft.com/devicelogin'
    };
  } catch (error) {
    console.error('MSAL auth error:', error);
    throw error;
  }
}

export async function checkAuth(userId, supabase) {
  try {
    const { data: token } = await supabase
      .from('private.ms_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!token) {
      return { authenticated: false };
    }

    const tokenExpiration = new Date(token.expires_on);
    return {
      authenticated: new Date() < tokenExpiration,
      expiresOn: token.expires_on
    };
  } catch (error) {
    console.error('Auth check error:', error);
    throw error;
  }
}

export async function logout(userId, supabase) {
  try {
    await supabase
      .from('private.ms_tokens')
      .delete()
      .eq('user_id', userId);
    
    await supabase
      .from('private.ms_auth_flow')
      .delete()
      .eq('user_id', userId);

    return true;
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

export async function createMeeting(userId, meetingDetails, supabase) {
  try {
    const { data: token } = await supabase
      .from('private.ms_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .single();

    if (!token) {
      throw new Error('User not authenticated');
    }

    const headers = {
      'Authorization': `Bearer ${token.access_token}`,
      'Content-Type': 'application/json'
    };

    const meetingBody = {
      subject: meetingDetails.subject,
      start: {
        dateTime: meetingDetails.startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: meetingDetails.endTime,
        timeZone: 'UTC'
      },
      body: {
        contentType: 'HTML',
        content: meetingDetails.body || ''
      },
      attendees: meetingDetails.attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required'
      })),
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness'
    };

    const response = await fetch(`${GRAPH_API_ENDPOINT}/me/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(meetingBody)
    });

    if (!response.ok) {
      throw new Error('Failed to create meeting');
    }

    return await response.json();
  } catch (error) {
    console.error('Meeting creation error:', error);
    throw error;
  }
}
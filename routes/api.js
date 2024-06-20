const express = require('express');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const url = require('url');
const { OAuth2Client } = require('google-auth-library');

dotenv.config();

const router = express.Router();
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// AUTH

// Middleware to verify ID token
const verifyToken = async (req, res, next) => {
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  console.log('verifyToken got', idToken)
  if (!idToken) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// Google Sign-In Route
router.get('/google-signin', (req, res) => {
  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
  });
  res.redirect(authUrl);
});

router.get('/google-callback', async (req, res) => {
  const { code } = req.query;
  console.log('req.query', req.query)
  try {
    const { tokens } = googleClient.getToken({ code, redirect_uri: process.env.GOOGLE_REDIRECT_URI });
    googleClient.setCredentials(tokens);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const userId = payload['sub'];
    let user = await admin.auth().getUser(userId).catch(async () => {
      user = await admin.auth().createUser({
        uid: userId,
        email: payload.email,
        displayName: payload.name,
      });
    });

    // if (user) {
    //   console.log('user', user);
    // } else {
    //   console.log('no user');
    // }
    const customToken = await admin.auth().createCustomToken(user.uid);
    console.log('Custom Token:', customToken);

    // Construct the redirect URL with the correct base URL
    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    const redirectUrl = new URL('/cms/dashboard', baseUrl);
    redirectUrl.searchParams.append('authToken', encodeURIComponent(customToken));

    // Redirect the client's browser to the constructed URL
    const clientSuccessUrl = redirectUrl.toString();
    console.log('Redirecting to:', clientSuccessUrl);
    res.redirect(clientSuccessUrl);

  } catch (error) {
    console.error('Error during Google callback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Anonymous Sign-In Route
router.post('/anonymous-signin', async (req, res) => {
  try {
    const userRecord = await admin.auth().createUser({});
    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    res.status(200).json({ authToken: customToken });
    
    // Parse the Referer URL and construct the redirect URL
    const refererUrl = new URL(req.headers.referer);
    const redirectUrl = new URL('/cms/dashboard', refererUrl);
    redirectUrl.searchParams.append('authToken', encodeURIComponent(customToken));

    // Redirect the client's browser to the constructed URL
    const clientSuccessUrl = url.format(redirectUrl);
    console.log('success?', clientSuccessUrl);
    res.redirect(clientSuccessUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Example protected route
router.get('/protected', verifyToken, (req, res) => {
  res.status(200).json({ message: 'This is a protected route', user: req.user });
});


// FETCH

// Function to get user info by userID
const getUserInfo = async (userID) => {
  try {
    const db = admin.database();
    const ref = db.ref(`users/${userID}`);
    const snapshot = await ref.once('value');
    return snapshot.val();
  } catch (error) {
    throw new Error(`Error getting user info: ${error.message}`);
  }
};

// Function to get list of authorized sites for userID
const getUserAuthorizedSites = async (userID) => {
  try {
    const db = admin.database();
    const ref = db.ref(`userAuthorizations/${userID}`);
    const snapshot = await ref.once('value');
    return snapshot.val();
  } catch (error) {
    throw new Error(`Error getting user authorized sites: ${error.message}`);
  }
};

// Function to get site data by siteID and path
const getSiteData = async (siteID, path = '') => {
  try {
    const db = admin.database();
    // Construct the database path, ensuring no trailing slash
    const dbPath = `sites/${siteID}/${path}`.replace(/\/$/, '');
    const ref = db.ref(dbPath);
    const snapshot = await ref.once('value');
    return snapshot.val();
  } catch (error) {
    throw new Error(`Error getting site data: ${error.message}`);
  }
};

// Get user info by userID
router.get('/user/:userID', async (req, res) => {
  try {
    const { userID } = req.params;
    const userInfo = await getUserInfo(userID);
    res.status(200).json(userInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of authorized sites for userID
router.get('/user/:userID/sites', async (req, res) => {
  try {
    const { userID } = req.params;
    const siteIDs = await getUserAuthorizedSites(userID);
    res.status(200).json(siteIDs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get site data by siteID and path
router.get('/site/:siteID/:environment/*', async (req, res) => {
  try {
    const { siteID, environment } = req.params;

    // Construct the full path
    const fullPath = `${environment}/${req.params[0]}`;

    const siteData = await getSiteData(siteID, fullPath);
    res.status(200).json(siteData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH

router.patch('/site/:siteID/:environment/*', async (req, res) => {
  try {
    const { siteID, environment } = req.params;
    const fullPath = `${environment}/${req.params[0]}`;
    const newValue = req.body.value; // Assuming the new value is sent in request body as 'value'

    // Validate that newValue is provided
    if (newValue === undefined) {
      return res.status(400).json({ error: 'Missing "value" property in request body.' });
    }

    const db = admin.database();
    const ref = db.ref(`sites/${siteID}/${fullPath.replace(/\/$/, '')}`);

    await ref.set(newValue);

    res.status(200).json({ message: 'Value updated successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
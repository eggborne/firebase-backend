const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();

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
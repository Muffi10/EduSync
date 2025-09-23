const admin = require("firebase-admin/app");
admin.initializeApp();

const functions = require("firebase-functions/v1");

exports.created = functions.auth.user().onCreate(async (user) => {
  const email = user.email;
  console.log(email);
  return null;
});

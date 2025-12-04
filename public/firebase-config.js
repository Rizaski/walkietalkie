// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCSlLZECPylvBNvy3emPEKKLC8f4ax3Lb4",
    authDomain: "walkietalkie-78199.firebaseapp.com",
    projectId: "walkietalkie-78199",
    storageBucket: "walkietalkie-78199.firebasestorage.app",
    messagingSenderId: "280385042338",
    appId: "1:280385042338:web:efdcdc4993dcf6a5ebe4fb",
    databaseURL: "https://walkietalkie-78199-default-rtdb.firebaseio.com"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getDatabase, ref, set, onValue, push } from "firebase/database";
import { firebaseConfig, emailAccessKey } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let appData = { membres: [], historique: [] };

// --- BASCULEMENT INTERFACE CONNEXION / ADHÉSION ---
const tabLogin = document.getElementById('tab-login-btn');
const tabSignup = document.getElementById('tab-signup-btn');
const formLogin = document.getElementById('form-login-box');
const formSignup = document.getElementById('form-signup-box');

tabLogin.addEventListener('click', () => {
  tabLogin.className = "w-1/2 py-2 text-center font-bold text-amber-600 border-b-2 border-amber-600";
  tabSignup.className = "w-1/2 py-2 text-center font-bold text-slate-400 border-b-2 border-transparent";
  formLogin.classList.remove('hidden');
  formSignup.classList.add('hidden');
});

tabSignup.addEventListener('click', () => {
  tabSignup.className = "w-1/2 py-2 text-center font-bold text-emerald-600 border-b-2 border-emerald-600";
  tabLogin.className = "w-1/2 py-2 text-center font-bold text-slate-400 border-b-2 border-transparent";
  formSignup.classList.remove('hidden');
  formLogin.classList.add('hidden');
});

// --- ENREGISTREMENT ACTIONS & NOTIFICATION SÉCURISÉE ---
function saveStateToCloud() {
  if (currentUser) set(ref(db, `agents/${currentUser.uid}/membres`), appData.membres);
}

function pushLogToCloud(type, detail) {
  if (!currentUser) return;
  const newLog = {
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().getTime(),
    type: type,
    detail: detail
  };
  push(ref(db, `agents/${currentUser.uid}/historique`), newLog);

  if (emailAccessKey !== "00000000-0000-0000-0000-000000000000") {
    fetch('https://web3forms.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: emailAccessKey,
        subject: `⚠️ Mouvement Caisse Tontine : ${type}`,
        to: currentUser.email,
        message: `Notification d'activité :\n\nAction : ${type}\nDétails : ${detail}\nHeure : ${new Date().toLocaleString()}`
      })
    }).catch(e => console.log("Email report deferred."));
  }
}

// --- ACTIONS CLICS FONCTIONNELS ---
document.getElementById('btn-login').addEventListener('click', (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  if (email && pass) {
    signInWithEmailAndPassword(auth, email, pass).catch(err => alert("Erreur : " + err.message));
  } else {
    alert("Veuillez remplir les champs de connexion.");
  }
});

// Gestion de l'Adhésion Sécurisée
document.getElementById('btn-signup').addEventListener('click', (e) => {
  e.preventDefault();

  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-pass').value.trim();
  const confirmPass = document.getElementById('signup-confirm-pass').value.trim();

  if (!email || !pass) {
    alert("Veuillez remplir tous les champs obligatoires !");
    return;
  }

  if (pass !== confirmPass) {
    alert("Les mots de passe ne correspondent pas !");
    return;
  }

  if (pass.length < 6) {
    alert("Par sécurité, le mot de passe doit contenir au moins 6 caractères.");
    return;
  }

  createUserWithEmailAndPassword(auth, email, pass)
    .then(() => {
      alert("Compte Agent créé avec succès ! Bienvenue.");
    })
    .catch((err) => {
      if (err.code === "auth/email-already-in-use") {
        alert("Cette adresse email est déjà utilisée par un autre collecteur.");
      } else {
        alert("Erreur d'adhésion : " + err.message);
      }
    });
});

document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// --- ÉCOUTEUR CLOUD SYNCHRONISÉ EN TEMPS RÉEL ---
onAuthStateChanged(auth, (user) => {
  const authScreen = document.getElementById('auth-screen');
  const appScreen = document.getElementById('app-screen');
  
  if (user) {
    currentUser = user;
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    document.getElementById('agent-email').innerText = `Agent : ${user.email}`;

    onValue(ref(db, `agents/${user.uid}`), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        appData.membres = data.membres || [];
        appData.historique = data.historique ? Object.values(data.historique) : [];
      } else {
        appData = { membres: [], historique: [] };
      }
      renderInterface();
    });
  } else {
    currentUser = null;
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
  }
});

// --- COMPTABILITÉ MÉTIER ---
document.getElementById('btn-save-membre').addEventListener('click', () => {
  const carnet = document.getElementById('m-carnet').value.trim();
  const nom = document.getElementById('m-nom').value.trim();
  const tel = document.getElementById('m-tel').value.trim();
  const mise = parseFloat(document.getElementById('m-mise').value) || 0;

  if (!carnet || !nom || mise <= 0) return alert("Veuillez remplir correctement les fiches.");

  appData.membres.push({ carnet, nom, tel, mise, cotise: 0, paye: 0 });
  pushLogToCloud("Nouveau Client", `Création du carnet #${carnet} pour ${nom}.`);
  saveStateToCloud();

  document.getElementById('m-carnet').value = "";
  document.getElementById('m-nom').value = "";
  document.getElementById('m-tel').value = "";
  document.getElementById('m-mise').value = "";
});

document.getElementById('btn-trigger-cotis').addEventListener('click', () => {
  const idx = document.getElementById('select-cotis-membre').value;
  const mult = parseInt(document.getElementById('inp-cotis-mult').value) || 1;
  if (idx === "") return;

  const montant = appData.membres[idx].mise * mult;
  appData.membres[idx].cotise += montant;

  pushLogToCloud("Encaissement", `Reçu +${montant} FCFA de ${appData.membres[idx].nom} (Carnet #${appData.membres[idx].carnet}).`);
  saveStateToCloud();
  document.getElementById('inp-cotis-mult').value = 1;
});

document.getElementById('btn-trigger-retrait').addEventListener('click', () => {
  const idx = document.getElementById('select-retrait-membre').value;
  const montant = parseFloat(document.getElementById('inp-retrait-val').value) || 0;
  if (idx === "" || montant <= 0) return alert("Spécifiez un montant valide.");

  appData.membres[idx].paye += montant;

  pushLogToCloud("Décaissement (Tirage)", `A payé -${montant} FCFA à ${appData.membres[idx].nom}.`);
  saveStateToCloud();
  document.getElementById('inp-retrait-val').value = "";
});

// --- MOTEUR DE RENDU SUR L'ECRAN ---
function renderInterface() {
  const today = new Date().toISOString().split('T')[0];
  let dayIn = 0, dayOut = 0;

  appData.historique.forEach(log => {
    if (log.date === today) {
      const match = log.detail.match(/\d+/);
      if (match) {
        if (log.type === "Encaissement") dayIn += parseInt(match[0]);
        if (log.type === "Décaissement (Tirage)") dayOut += parseInt(match[0]);
      }
    }
  });

  document.getElementById('stat-day-in').innerText = `${dayIn} FCFA`;
  document.getElementById('stat-day-out').innerText = `${dayOut} FCFA`;
  document.getElementById('stat-day-solde').innerText = `${dayIn - dayOut} FCFA`;

  // Listes déroulantes
  const selectC = document.getElementById('select-cotis-membre');
  const selectR = document.getElementById('select-retrait-membre');
  let options = `<option value="">-- Choisir un compte --</option>`;
  appData.membres.forEach((m, idx) => {
    options += `<option value="${idx}">${m.nom} (Carnet #${m.carnet})</option>`;
  });
  selectC.innerHTML = options;
  selectR.innerHTML = options;

  // Remplissage Tableau
  const tbody = document.getElementById('membres-tbody');
  tbody.innerHTML = "";
  appData.membres.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 font-semibold text-slate-500">#${m.carnet}</td>
      <td class="p-3 font-bold text-slate-800">${m.nom}</td>
      <td class="p-3 text-slate-500">${m.tel || '-'}</td>
      <td class="p-3 text-right font-medium">${m.mise} F</td>
      <td class="p-3 text-right text-emerald-600 font-bold">+${m.cotise} F</td>
      <td class="p-3 text-right text-amber-800 font-extrabold">${m.cotise - m.paye} F</td>
    `;
    tbody.appendChild(tr);
  });
}

// CORRECTION DE LA FIN DU FICHIER (Restauration de la navigation)
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.className = "nav-tab px-4 py-2 text-sm font-semibold text-slate-500");
    btn.className = "nav-tab px-4 py-2 text-sm font-semibold text-amber-600 border-b-2 border-amber-600";
    
    const target = btn.getAttribute('data-target');
    document.getElementById('sec-membres').classList.toggle('hidden', target !== 'sec-membres');
    document.getElementById('sec-cotisations').classList.toggle('hidden', target !== 'sec-cotisations');
  });
});

window.onload = () => lucide.createIcons();

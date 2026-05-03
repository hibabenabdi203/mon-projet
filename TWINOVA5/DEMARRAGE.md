# 🚀 TWINOVA — Guide de Démarrage

## À chaque fois que tu ouvres VS Code, suis ces 3 étapes :

---

## ✅ ÉTAPE 1 — Lancer le serveur backend

Dans le **terminal de VS Code**, tape ces 2 commandes :

```
cd backend
python main.py
```

⏳ Attends de voir ce message :
```
Uvicorn running on http://0.0.0.0:8000
```
✅ Le serveur est prêt !

---

## ✅ ÉTAPE 2 — Lancer le frontend

Dans l'explorateur de fichiers VS Code :
- Clique sur **`frontend/index.html`**
- Clic **droit** → **"Open with Live Server"**

Ou clique sur **"Go Live"** en bas à droite de VS Code.

✅ Le navigateur s'ouvre automatiquement !

---


## ✅ ÉTAPE 3 — Ouvrir la plateforme

Dans le navigateur, va sur :

```
http://127.0.0.1:5500/frontend/index.html
```

✅ La plateforme est prête !

---

## 🔑 Compte de test

| Champ | Valeur |
|-------|--------|
| Email | elbaraka@laiterie.dz |
| Mot de passe | baraka2026 |

---

## 🛑 Pour arrêter le serveur

Dans le terminal, appuie sur :
```
Ctrl + C
```

---

## 📁 Structure du projet

```
TWINOVA5/
├── backend/
│   ├── main.py          ← Serveur FastAPI (routes API)
│   ├── database.py      ← Base de données SQLAlchemy
│   ├── kpi.py           ← Calculs KPI
│   ├── auth.py          ← Authentification JWT
│   ├── models.py        ← Schémas Pydantic
│   ├── demo_data.py     ← Script données démo
│   └── twinova.db       ← Base de données SQLite
├── frontend/
│   ├── index.html       ← Interface utilisateur
│   ├── App.js           ← Logique JavaScript
│   └── style.css        ← Design
└── DEMARRAGE.md         ← Ce fichier !
```

---

## ⚠️ Problèmes fréquents

| Problème | Solution |
|----------|----------|
| "Erreur de connexion au serveur" | Le serveur n'est pas lancé → Étape 1 |
| Page blanche | Live Server pas lancé → Étape 2 |
| "Failed to fetch" | Relancer `python main.py` |
| Port 8000 déjà utilisé | Fermer l'ancien terminal et relancer |

---

*TWINOVA — Digital Model Industriel — Version MVP*

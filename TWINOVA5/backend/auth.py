# ═══════════════════════════════════════════════
# TWINOVA — Authentification
# Gestion des utilisateurs et tokens JWT
# ═══════════════════════════════════════════════

from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import Column, Integer, String
from database import Base

# ── Clé secrète pour signer les tokens ──────────
SECRET_KEY = "twinova-secret-key-2026"
ALGORITHM  = "HS256"
TOKEN_EXPIRE_HOURS = 24

# ── Outil pour chiffrer les mots de passe ───────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── TABLE : utilisateurs ─────────────────────────
class Utilisateur(Base):
    __tablename__ = "utilisateurs"

    id            = Column(Integer, primary_key=True, index=True)
    nom_entreprise = Column(String, nullable=False)
    email         = Column(String, unique=True, nullable=False, index=True)
    mot_de_passe  = Column(String, nullable=False)


# ── Fonctions utilitaires ─────────────────────────
def chiffrer_mdp(mot_de_passe: str) -> str:
    """Chiffre le mot de passe avant de le sauvegarder"""
    return pwd_context.hash(mot_de_passe)


def verifier_mdp(mot_de_passe: str, mdp_chiffre: str) -> bool:
    """Vérifie si le mot de passe entré correspond au mot de passe chiffré"""
    return pwd_context.verify(mot_de_passe, mdp_chiffre)


def creer_token(data: dict) -> str:
    """Crée un token JWT valable 24h"""
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    data.update({"exp": expire})
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def verifier_token(token: str) -> dict:
    """Vérifie et décode un token JWT"""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
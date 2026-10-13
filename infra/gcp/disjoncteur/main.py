"""Disjoncteur du budget Awzid (Cloud Function, déclenchée par les notifications de budget Pub/Sub).

Un budget Google Cloud ne bloque aucune dépense : il envoie des messages. Cette fonction lit ces messages et ARRÊTE la
machine virtuelle quand le coût RÉEL du mois atteint ou dépasse le montant du budget. La machine est arrêtée (pas
supprimée) : le disque et les données restent ; le client la relance après avoir regardé la facture.

Ne fait rien pour une alerte de seuil inférieur (50 %, 90 %) ni pour la prévision. Aucune donnée personnelle ici : elle
ne lit que des montants. Configurée par variables d'environnement : PROJET, ZONE, MACHINE.
"""

import base64
import json
import os


def doit_arreter(message: dict) -> bool:
    """Vrai si le coût réel du mois est au moins égal au montant du budget (montants dans la même devise)."""
    cout = float(message.get("costAmount", 0))
    budget = float(message.get("budgetAmount", 0))
    return budget > 0 and cout >= budget


def arreter_si_plafond(event, context=None):
    """Point d'entrée (Pub/Sub) : `event` est un CloudEvent (Gen2) ou le dictionnaire hérité (Gen1)."""
    data = None
    if hasattr(event, "data") and isinstance(event.data, dict):  # CloudEvent
        data = event.data.get("message", {}).get("data")
    elif isinstance(event, dict):
        data = event.get("data")
    if not data:
        print("message vide : rien à faire")
        return "vide"
    message = json.loads(base64.b64decode(data).decode("utf-8"))
    if not doit_arreter(message):
        print("seuil non atteint : rien à faire")
        return "ok"
    # import tardif : la logique de décision se teste sans la bibliothèque Google
    from googleapiclient import discovery  # type: ignore

    compute = discovery.build("compute", "v1", cache_discovery=False)
    projet, zone, machine = os.environ["PROJET"], os.environ["ZONE"], os.environ["MACHINE"]
    etat = compute.instances().get(project=projet, zone=zone, instance=machine).execute().get("status")
    if etat in ("STOPPING", "TERMINATED", "SUSPENDED"):
        print("machine déjà arrêtée")
        return "deja"
    compute.instances().stop(project=projet, zone=zone, instance=machine).execute()
    print("PLAFOND ATTEINT : machine arrêtée")
    return "arretee"

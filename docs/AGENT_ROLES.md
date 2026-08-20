# Agentenrollen

Aus dem Playbook des Product Owners (Abschnitte 3–11). Sie standen bisher nur in der PDF und
damit nirgends, wo bei der Arbeit jemand hineinsieht.

## Die sieben Rollen

| # | Rolle | Aufgabe |
| --- | --- | --- |
| 1 | **Product Architect** | Gesamtarchitektur, MVP, User Flows, Abhängigkeiten |
| 2 | **UX/UI** | Nutzerführung, Screens, Informationshierarchie, Designsystem |
| 3 | **Backend/Data** | Datenmodell, APIs, Authentifizierung, Datenintegrität |
| 4 | **Adaptive Engine** | Behavioral Loop, Mustererkennung, Experimente, persönliche Regeln |
| 5 | **AI** | LLM-Integration, strukturierte Outputs, Prompts, Kontext, Guardrails |
| 6 | **QA/Test** | Technische, funktionale, Edge-Case- und User-Flow-Tests |
| 7 | **Product Critic** | Schwächen, generische Features, fehlende Differenzierung, Retention |

## Wie sie eingesetzt werden

Das Playbook ist an dieser Stelle ausdrücklich: **nicht dauerhaft parallel.** Zu viele
gleichzeitig aktive Rollen erzeugen widersprüchliche Architekturentscheidungen. Der Architect
hält die Richtung zusammen.

**QA und Product Critic prüfen die Arbeit, bevor die nächste große Phase beginnt** — nicht
nebenher, sondern als Tor zwischen den Phasen.

## Was QA prüfen soll

*User Cases:* Onboarding-Abbruch, fehlende Daten, Zieländerung, viele ausgelassene Tage,
widersprüchliche Angaben, mehrere Ziele, Planverschiebungen, lange Inaktivität.

*AI Cases:* ungültiges JSON, fehlende Felder, widersprüchliche Empfehlung, unzulässige
Gesundheits- oder Ernährungsempfehlung, Timeout.

*Regression:* Nach jedem größeren Feature die bestehenden Kernfunktionen erneut prüfen.

## Was der Product Critic fragen soll

Warum diese App statt bestehender Health-, Fitness- oder AI-Apps? Ist die Personalisierung
echt? Warum kommt der Nutzer nach 30 Tagen zurück? Ist das nur ChatGPT plus Dashboard? Welche
Features sind unnötig? Warum sollte jemand später bezahlen?

**Regel:** Kritik muss konkret sein und Verbesserungsvorschläge enthalten.

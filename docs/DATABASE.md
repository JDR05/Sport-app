# Datenmodell

Konzeptioneller Entwurf. Die Migrations entstehen in Schritt 2; dieses Dokument ist die
Vorlage dafür und wird bei Abweichungen nachgezogen.

## Grundregeln

- Jede Tabelle mit Nutzerdaten trägt `profile_id` und referenziert `auth.users`.
- **Row Level Security auf jeder Tabelle**, ohne Ausnahme. Policy-Grundform:
  `profile_id = auth.uid()`. Tabellen ohne direkte Spalte prüfen über einen Join auf die
  Elterntabelle.
- Zeitstempel `created_at` / `updated_at` überall, `timestamptz`.
- Statuswerte als Postgres-Enums, nicht als freie Strings.
- Löschen kaskadiert vom Profil abwärts — Datenexport und -löschung sind
  Datenschutzanforderungen, keine Extras.

## Entitäten

### `profiles`
Erweiterung von `auth.users`. `id` (PK, FK auf `auth.users`), `birth_year`, `height_cm`,
`sex_at_birth`, `life_situation`, `motivation_style`, `onboarding_stage`.

`sex_at_birth` wird ausschließlich für die Grundumsatzformel erhoben, ist optional, und hat
einen sicheren Fallback (konservativster Wert), wenn er fehlt.

### `schedules`
Alltagsstruktur je Profil: `wake_time`, `sleep_time`, `work_pattern`, `free_slots` (jsonb),
`weekend_differs`. Basis dafür, wann eine Aktion überhaupt stattfinden kann.

### `goals`
`profile_id`, `title`, `goal_type`, `target_date`, `priority`, `status`
(`active` | `paused` | `reached` | `abandoned`). Im MVP ist genau ein `active` Ziel je Profil
erlaubt — durchgesetzt über einen partiellen Unique-Index, nicht nur in der Anwendung.

### `goal_metrics`
`goal_id`, `metric_key` (z. B. `weight_kg`), `start_value`, `target_value`, `unit`.

### `constraints`
`profile_id`, `kind` (`time` | `dietary` | `equipment` | `dislike` | `medical_selfreport`),
`value` (jsonb), `hard` (boolean). Harte Constraints darf die Engine nie verletzen; weiche
sind Präferenzen.

### `plans`
`profile_id`, `goal_id`, `week_start`, `strategy` (jsonb), `rationale`, `generated_by`
(`engine` | `engine_ai`), `superseded_by`. Pläne werden nie überschrieben, sondern
versioniert — sonst ist der Vorher-Nachher-Vergleich eines Experiments nicht rekonstruierbar.

### `plan_items`
`plan_id`, `date`, `domain` (`training` | `nutrition` | `movement` | `sleep` |
`self_improvement` | `priority`), `title`, `details` (jsonb), `planned_duration_min`,
`time_slot`, `status` (`planned` | `done` | `moved` | `missed` | `not_relevant`),
`status_changed_at`.

Die Unterscheidung zwischen `missed` und `not_relevant` ist für die Adaptive Engine
entscheidend: `not_relevant` ist ein Planungsfehler, `missed` ein Verhaltenssignal.

### `check_ins`
`profile_id`, `date`, `energy`, `mood`, `note`. Kurz und optional.

### `measurements`
`profile_id`, `metric_key`, `value`, `unit`, `measured_at`. Trends werden berechnet, nie
gespeichert.

### `experiments`
`profile_id`, `goal_id`, `hypothesis`, `variable`, `change_description`, `baseline` (jsonb),
`start_date`, `end_date`, `status` (`proposed` | `running` | `evaluating` | `adopted` |
`rejected` | `extended` | `aborted`).

### `experiment_results`
`experiment_id`, `metric`, `baseline_value`, `observed_value`, `decision`, `evaluated_at`.

### `insights`
`profile_id`, `kind`, `statement`, `evidence` (jsonb), `created_at`. `evidence` referenziert
konkrete Zeilen-IDs — ein Insight ohne Beleg darf nicht entstehen.

### `personal_rules`
`profile_id`, `rule_key`, `rule_value` (jsonb), `confidence`, `source_experiment_id`,
`active`. Das ist der eigentliche Moat: die über Zeit gelernten persönlichen Regeln.

### `subscriptions`
Auf V2 verschoben. Im MVP nicht angelegt.

## Beziehungen

```
auth.users 1─1 profiles
profiles 1─1 schedules
profiles 1─n goals 1─n goal_metrics
profiles 1─n constraints
profiles 1─n plans 1─n plan_items
profiles 1─n check_ins
profiles 1─n measurements
profiles 1─n experiments 1─n experiment_results
profiles 1─n insights
profiles 1─n personal_rules
```

## Was in Schritt 2 getestet wird

- RLS-Isolation: Nutzer A kann unter keinen Umständen Daten von Nutzer B lesen oder ändern.
- Der Unique-Index auf genau ein aktives Ziel greift.
- Kaskadierendes Löschen hinterlässt keine Waisen.
- Enum-Constraints weisen ungültige Statuswerte ab.

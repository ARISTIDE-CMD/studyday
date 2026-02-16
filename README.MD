# StudyDay - Setup IA (OpenAI)

## 1) Securite (important)
- Ne mets jamais une cle OpenAI dans `.env` Expo (`EXPO_PUBLIC_*`).
- La cle doit rester cote serveur (Supabase Edge Function).
- Si une cle a deja ete commitee dans un fichier, revoque-la immediatement puis regenere une nouvelle cle.

## 2) Configurer les secrets Supabase (serveur)
Depuis la racine du projet:

```bash
supabase functions deploy ai-assistant
supabase secrets set OPENAI_API_KEY=ta_nouvelle_cle
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

Si ton projet n'est pas encore lie:

```bash
supabase link --project-ref <PROJECT_REF>
```

## 3) Fonction Edge deja ajoutee
Le endpoint serveur est:

- `supabase/functions/ai-assistant/index.ts`

Il verifie l'utilisateur connecte via JWT Supabase et appelle OpenAI cote serveur.

## 4) Cote application mobile
Le client de l'app est:

- `lib/ai-assistant.ts`

Exemple d'usage:

```ts
import { summarizeText } from '@/lib/ai-assistant';

const result = await summarizeText({ text: 'Mon texte...', locale: 'fr-FR' });
```

## 5) Integration UI
Un bouton **IA Resumer** a ete ajoute dans l'editeur de ressource:

- `app/resource-editor.tsx`

## 6) Build Android (preview APK)
```bash
npx eas build -p android --profile preview
```

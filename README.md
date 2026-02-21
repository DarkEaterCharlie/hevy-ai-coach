🏋️ Hevy AI Coach (v2.0 - Local Storage Edition)
Hevy AI Coach je modulární Node.js asistent pro elitní silové sportovce. Verze 2.0 přináší úplné odstranění závislosti na Google Sheets a přechází na lokální databázový model pro vyšší rychlost a stabilitu.

🧠 Hlavní Funkce
Local Data Core: Veškerá konfigurace, profil atleta a tréninkový plán jsou uloženy lokálně v souborech user_db.json a training_plan.json.

AI Discovery & Smart Catalog: Automaticky analyzuje tvou databázi cviků v Hevy a inteligentně mapuje rodiny cviků (např. progres z kliku na weighted variantu).

CNS Shield & Autoregulace: Striktně vynucuje bezpečnostní limity (max 7 opakování u dřepu/tahu) a automaticky počítá váhy na základě tvého aktuálního E-1RM z historie.

Hevy Cloud Sync: Přímý upload vygenerovaných rutin do tvé mobilní aplikace pomocí Hevy API.

Pojistka proti smazání warmupů: Writer modul garantuje, že AI nikdy neodstraní tvé manuálně nastavené rozcvičovací série ze šablony.

📂 Struktura Projektu
coach.js: Hlavní orchestrátor řídící sběr dat a generování plánu.

services/storageService.js: Nový mozek pro správu lokálních dat a posun tréninkových týdnů.

services/aiService.js: Komunikace s Gemini API (využívá modely Flash/Pro).

services/hevyService.js: Konektor pro Hevy API (stahování rutin, historie a nahrávání změn).

runDiscovery.js: Skript pro analýzu nových cviků a aktualizaci smart_catalog.json.

prompts/: Modulární trenérská pravidla (safety, progression, discovery, output).

🚀 Rychlý Start
1. Instalace

Bash
npm install
2. První spuštění (Onboarding)

Při prvním spuštění tě trenér provede dotazníkem, vytěží tvé maximálky z historie Hevy a vytvoří soubor .env a config/user_db.json.

Bash
node coach.js
3. Discovery (Volitelné)

Pokud jsi v Hevy přidal nové cviky, spusť discovery pro jejich zařazení do progresních rodin:

Bash
node runDiscovery.js
🔐 Bezpečnost a Git
Citlivá data: Soubory .env, google-credentials.json a celá složka exports/ jsou v .gitignore.

Secrets: V GitHub Actions (workflow pondeli.yml) se používají šifrované secrets pro API klíče.

🛠️ Jak projekt upravit
Tréninková logika: Pravidla, jak má AI přemýšlet, upravuj přímo v textových souborech ve složce /prompts.

Periodizace: Tvůj 12-týdenní plán (fáze, intenzita, RPE cíle) najdeš v config/training_plan.json.

Autor: Jarda the Developer & Gemini Coach

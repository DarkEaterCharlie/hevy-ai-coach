🏋️ Hevy AI Coach
Hevy AI Coach je modulární Node.js asistent navržený pro elitní silové sportovce. Automatizuje proces plánování tréninků tím, že propojuje tvou silovou historii, aktuální maxima a tréninkové cíle s aplikací Hevy přes Gemini AI.
+3

🧠 Hlavní Funkce
Adaptivní plánování: AI generuje váhy a opakování na základě aktuální fáze (Hypertrofie, Síla, Deload) a tvých 1RM.
+1

Bezpečnostní protokoly (CNS Shield): Striktně vynucuje 2-3 rampa série (warmup) a limituje pracovní série u těžkých cviků (dřep, mrtvý tah).
+3

Autoregulace (7-Rep Veto): Automaticky omezuje počet opakování na 5-7 u komplexních cviků pro zachování techniky a ochranu CNS.

Hevy Cloud Sync: Přímý upload vygenerovaných rutin do tvé mobilní aplikace pomocí Hevy API.
+1

Nezrušitelné komponenty: Kardio intervaly a střed těla (Core) zůstávají v plánu jako povinná prevence zranění.
+4

📂 Struktura Projektu
coach.js: Hlavní orchestrátor řídící sběr dat a generování plánu.

aiService.js: Komunikace s Gemini API a zpracování tréninkové logiky.

hevyService.js: Konektor pro Hevy API (stahování rutin a historie).

sheetsService.js: Správa dat v Google Tabulce (1RM, profil atleta, posun týdnů).

writer.js & uploader.js: Transformace dat do JSON a jejich nahrávání do Hevy cloudu.

/prompts: Modulární trenérská pravidla (role, bezpečnost, komponenty, výstup).
+3

🚀 Rychlý Start (Před fitkem)
1. Požadavky

Node.js (v18+)

Google Cloud účet (pro Sheets API)

Hevy API klič a Gemini API klíč

2. Instalace

Bash
git clone https://github.com/vas-profil/hevy-ai-coach.git
cd hevy-ai-coach
npm install
3. Nastavení Environmentu

Vytvoř soubor .env v kořenovém adresáři:

Code snippet
GEMINI_API_KEY=tvuj_gemini_klic
HEVY_API_KEY=tvuj_hevy_klic
SPREADSHEET_ID=id_tve_google_tabulky
Poznámka: Nikdy tento soubor nenahrávej na GitHub! 

4. Spuštění

Bash
node coach.js
Skript analyzuje tvou formu, vypočítá váhy a po potvrzení (napsání "ano") odešle plán přímo do tvého mobilu.

🔐 Bezpečnost a Git
Tento projekt je nastaven tak, aby neunikla žádná citlivá data:

google-credentials.json a .env jsou ignorovány v .gitignore.

Kritické bezpečnostní limity jsou "hard-coded" v /prompts/safety.txt a nelze je AI obemknout.
+1

🛠️ Jak projekt zobecnit
Pokud chceš projekt sdílet:

Uživatel si musí vytvořit vlastní kopii Google Tabulky pro správu 1RM.

ID složky v Hevy se nastavuje v listu Config, což umožňuje správu různých tréninkových programů.

Všechna pravidla v /prompts lze upravit podle individuálních potřeb trenéra.

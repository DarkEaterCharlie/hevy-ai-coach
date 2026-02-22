# 🏋️‍♂️ Hevy AI Coach - v4 Hybrid (Online Brain)

Vítej ve verzi **v4-online-brain**. Tohle je ultimátní hybridní AI trenér, který spojuje to nejlepší ze dvou světů:

🧠 **Lokální mozek (JSON):** Řídí tréninkovou logiku, periodizaci, RPE a intenzitu (`config/training_plan.json`).
☁️ **Online svaly (Google Sheets):** Dodává dynamická data – aktuální tělesnou váhu, aktuální týden a hlavně **čerstvé 1RM maximálky**.

## 🚀 Co je nového ve v4:
* **Přímá injektáž 1RM:** AI už nevaří z vody. Vidí tvá reálná maxima (E-1RM) z Google Sheets a přesně z nich počítá pracovní série.
* **Chytrá matematika (Prilepinova logika):** Zrušeny tupé limity opakování. Umělá inteligence nyní chápe vztah: *Váha jde nahoru = opakování musí jít dolů*. Respektuje hypertrofickou i silovou fázi.
* **Smart Catalog & Automatická Progrese:** AI umí číst tvou reálnou historii. Jakmile u bodyweight cviku (např. shyby, kliky) dosáhneš nastaveného prahu opakování, systém tě **automaticky upgraduje** na weighted variantu a spočítá ti váhu na opasek.
* **Deload Výhybka (Smart History):** Tréninkový algoritmus není blbý. Pokud zjistí, že jsi měl v předchozím týdnu Deload, natvrdo ho v historii před AI vymaže, aby se model nenechal zmást tvým úmyslným podvýkonem a bral v úvahu tvoje reálná maxima z vrcholné fáze.
* **Podpora času (Vteřiny):** Planky a izometrické cviky konečně fungují a zapisují se přesně na vteřiny!
* **Automatický posuv týdne:** Po schválení plánu se v Google Tabulce automaticky zvedne počítadlo týdne o +1.
* **Plná integrace API:** Zápis přes `PUT` metodu rovnou do existujících rutin v Hevy (přes mikroservis `uploader.js`). Eliminace závislosti na externích knihovnách.

## ⚙️ Jak to spustit:
1. Ujisti se, že máš správně nastavené `.env` a aktivní Google API klíče (`google-credentials.json`).
2. Spusť hlavního orchestrátora:
   ```bash
   node coach.js

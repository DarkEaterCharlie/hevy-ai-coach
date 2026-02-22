# 🏋️‍♂️ Hevy AI Coach - v4 Hybrid (Online Brain)

Vítej ve verzi **v4-online-brain**. Tohle je ultimátní hybridní AI trenér, který spojuje to nejlepší ze dvou světů:

🧠 **Lokální mozek (JSON):** Řídí tréninkovou logiku, periodizaci, RPE a intenzitu (`config/training_plan.json`).
☁️ **Online svaly (Google Sheets):** Dodává dynamická data – aktuální tělesnou váhu, aktuální týden a hlavně **čerstvé 1RM maximálky**.

## 🚀 Co je nového ve v4:
* **Přímá injektáž 1RM:** AI už nevaří z vody. Vidí tvá reálná maxima (E-1RM) z Google Sheets a přesně z nich počítá pracovní série.
* **Chytrá matematika (Prilepinova logika):** Zrušeny tupé limity opakování. Umělá inteligence nyní chápe vztah: *Váha jde nahoru = opakování musí jít dolů*. Respektuje hypertrofickou i silovou fázi.
* **Podpora času (Vteřiny):** Planky a izometrické cviky konečně fungují a zapisují se přesně na vteřiny!
* **Automatický posuv týdne:** Po schválení plánu se v Google Tabulce automaticky zvedne počítadlo týdne o +1.
* **Plná integrace API:** Zápis přes `PUT` metodu rovnou do existujících rutin v Hevy (přes mikroservis `uploader.js`).

## ⚙️ Jak to spustit:
1. Ujisti se, že máš správně nastavené `.env` a aktivní Google API klíče (`google-credentials.json`).
2. Spusť hlavního orchestrátora:
   ```bash
   node coach.js
Zkontroluj vygenerované váhy, série a opakování přímo ve výpisu v terminálu.

Napiš ano pro odeslání do mobilu (Hevy) a automatické posunutí týdne online.

Ať to roste! 💪

### Synthèse par palier

| UV | scénario | requêtes | req/s | erreurs % | p50 ms | p95 ms | p99 ms | max ms | CPU machine moy. / max % | cœurs moy. : caddy / web / api / db / écoute | mémoire api / db Mo (pic) | connexions PG (pic / actives) | générateur (cœurs) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|
| 100 | parcours | 9552 | 159.2 | 0 | 6.3 | 25.7 | 45.7 | 220.9 | 16.8 / 23.5 | 0.11 / 0.04 / 0.27 / 0.34 / 0.02 | 545 / 1129 | 14 / 3 | 0.17 |
| 200 | parcours | 17167 | 286.1 | 0 | 19 | 729.5 | 1714 | 3328.2 | 49.4 / 53.8 | 0.21 / 0.07 / 0.55 / 0.8 / 0.03 | 633 / 1119 | 14 / 9 | 0.3 |
| 400 | parcours | 21184 | 353.1 | 0.3 | 503.3 | 3428.9 | 6280 | 7411.4 | 41.9 / 52 | 0.24 / 0.08 / 0.68 / 0.92 / 0.03 | 775 / 1126 | 14 / 7 | 0.35 |

### Palier 100 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 945 | 15.7 | 0 | 5.1 | 11.2 | 22.7 | 42.5 |
| GET audio de leçon (mp3) | 933 | 15.5 | 0 | 3.9 | 12.3 | 20.8 | 33.2 |
| web /coran/mushaf (page) | 321 | 5.3 | 0 | 2.6 | 4.7 | 5.9 | 7.2 |
| GET /quran/mushaf-exact | 321 | 5.3 | 0 | 4.1 | 10.9 | 15.5 | 23.4 |
| GET /quran/audio/reciters | 321 | 5.3 | 0 | 11.6 | 21.3 | 29 | 35.1 |
| web /madjaliss/:texte (page) | 318 | 5.3 | 0 | 2.6 | 5.4 | 8.5 | 15.2 |
| GET /mutun/:texte.json | 318 | 5.3 | 0 | 4.1 | 9.6 | 17.5 | 22.8 |
| GET /profiles/:id/madjaliss | 318 | 5.3 | 0 | 6.2 | 16.5 | 29.9 | 35.5 |
| GET /mutun/:texte-differe.json (bêta) | 318 | 5.3 | 0 | 11.5 | 30.1 | 56.1 | 63.7 |
| GET /levels/:code/units | 308 | 5.1 | 0 | 7.3 | 17.1 | 25.9 | 34 |
| web /lecons/:id (page) | 308 | 5.1 | 0 | 2.3 | 4.5 | 6.9 | 11.9 |
| GET /units/:id (leçon) | 308 | 5.1 | 0 | 25.3 | 50.8 | 112.1 | 148.5 |
| GET /quran/audio/reciters/:id/suras/:n | 301 | 5 | 0 | 5.9 | 10.8 | 15.8 | 32.2 |
| GET audio de verset (mp3) | 301 | 5 | 0 | 5.4 | 15 | 21.1 | 220.9 |
| web /hifz (page) | 301 | 5 | 0 | 2.6 | 4.9 | 6 | 12.9 |
| GET /hifz/books | 301 | 5 | 0 | 5 | 14 | 19.4 | 30.6 |
| GET /hifz/profiles/:id | 301 | 5 | 0 | 6 | 16.3 | 22.8 | 37.7 |
| POST /attempts (5 événements) | 300 | 5 | 0 | 13.7 | 27.8 | 47.5 | 58.3 |
| GET /famille/messages | 300 | 5 | 0 | 5.1 | 14.7 | 24.4 | 61.2 |
| GET /today/:id | 294 | 4.9 | 0 | 13.2 | 37.1 | 73.9 | 89.5 |
| web / (page) | 293 | 4.9 | 0 | 3.3 | 6.2 | 8.7 | 17.3 |
| GET /config | 293 | 4.9 | 0 | 7.7 | 14.4 | 22.6 | 29.9 |
| GET /acces/statut | 293 | 4.9 | 0 | 9 | 17.6 | 26.1 | 34.6 |
| GET /auth/me | 293 | 4.9 | 0 | 15.7 | 29.9 | 47.7 | 57.4 |
| GET /fonctions | 293 | 4.9 | 0 | 11.6 | 25.5 | 35 | 38.4 |
| GET /levels | 293 | 4.9 | 0 | 19.2 | 36.6 | 70.6 | 76.8 |
| GET /profiles/:id/parcours | 293 | 4.9 | 0 | 11.5 | 32.9 | 58.5 | 80.1 |
| POST /auth/login | 65 | 1.1 | 0 | 49.4 | 91.2 | 133.4 | 133.4 |

Courbe (fenêtres de 10 s) : 0s:129.1/s p95=15 ; 10s:189.4/s p95=28.4 ; 20s:132.8/s p95=17.2 ; 30s:184.1/s p95=33.3 ; 40s:135.5/s p95=16.9 ; 50s:184.3/s p95=28.9

### Palier 200 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 1727 | 28.8 | 0 | 10.5 | 306.3 | 578.2 | 867 |
| GET audio de leçon (mp3) | 1706 | 28.4 | 0 | 21 | 252.8 | 439 | 554.4 |
| GET /mutun/:texte-differe.json (bêta) | 603 | 10.1 | 0 | 49.3 | 1215.3 | 1719.2 | 1785.4 |
| web /coran/mushaf (page) | 597 | 10 | 0 | 2.9 | 13.6 | 72.8 | 89.3 |
| GET /quran/mushaf-exact | 597 | 10 | 0 | 9.1 | 235.1 | 342.8 | 480 |
| GET /quran/audio/reciters | 597 | 10 | 0 | 26.3 | 351.3 | 524.2 | 665 |
| GET /profiles/:id/madjaliss | 594 | 9.9 | 0 | 23 | 586.2 | 908.4 | 959.9 |
| web /madjaliss/:texte (page) | 588 | 9.8 | 0 | 2.9 | 16.5 | 78.6 | 169.6 |
| GET /mutun/:texte.json | 588 | 9.8 | 0 | 4.8 | 17.6 | 68.5 | 185.1 |
| GET /units/:id (leçon) | 562 | 9.4 | 0 | 265.3 | 792.4 | 1280 | 1490.7 |
| GET /levels/:code/units | 556 | 9.3 | 0 | 93.4 | 459.4 | 843.5 | 1037.6 |
| web /lecons/:id (page) | 556 | 9.3 | 0 | 2.9 | 14 | 94 | 191.2 |
| GET /today/:id | 555 | 9.3 | 0 | 484.2 | 2717.3 | 3252.9 | 3328.2 |
| GET /profiles/:id/parcours | 553 | 9.2 | 0 | 339.5 | 1993.3 | 2301.4 | 2472.6 |
| GET /auth/me | 534 | 8.9 | 0 | 255.5 | 1578.3 | 1720.1 | 1765.4 |
| GET /quran/audio/reciters/:id/suras/:n | 525 | 8.8 | 0 | 10.4 | 141.9 | 331.7 | 423.4 |
| GET audio de verset (mp3) | 525 | 8.8 | 0 | 11.5 | 122.3 | 229 | 503.7 |
| GET /fonctions | 523 | 8.7 | 0 | 156.9 | 914.9 | 1142.6 | 1186.3 |
| GET /levels | 521 | 8.7 | 0 | 178.1 | 798.5 | 958.8 | 1057.5 |
| GET /acces/statut | 520 | 8.7 | 0 | 93.9 | 593.4 | 709.8 | 755.9 |
| GET /config | 519 | 8.7 | 0 | 65.5 | 404.5 | 469.3 | 520.6 |
| web / (page) | 511 | 8.5 | 0 | 4.3 | 36.1 | 98.3 | 159.5 |
| web /hifz (page) | 498 | 8.3 | 0 | 3 | 16.4 | 54.2 | 98.2 |
| GET /hifz/books | 497 | 8.3 | 0 | 11.9 | 241.1 | 444.8 | 517.6 |
| GET /hifz/profiles/:id | 497 | 8.3 | 0 | 16.7 | 378.1 | 588.3 | 797.2 |
| POST /attempts (5 événements) | 477 | 8 | 0 | 50.1 | 782.1 | 1199.3 | 1343.1 |
| GET /famille/messages | 477 | 8 | 0 | 25 | 505.1 | 745.1 | 912.4 |
| POST /auth/login | 164 | 2.7 | 0 | 792 | 3033.2 | 3119.8 | 3163.1 |

Courbe (fenêtres de 10 s) : 0s:275.8/s p95=1934.1 ; 10s:272.3/s p95=108.2 ; 20s:293.1/s p95=809.2 ; 30s:276.1/s p95=36.8 ; 40s:314.1/s p95=547.9 ; 50s:285.3/s p95=185.7

### Palier 400 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET audio de leçon (mp3) | 2389 | 39.8 | 0 | 428.2 | 913.7 | 1199.8 | 1696.9 |
| GET /quran/mushaf-exact/pages/:p | 1841 | 30.7 | 0 | 293.2 | 1525.6 | 1952.2 | 2451.1 |
| GET /units/:id (leçon) | 794 | 13.2 | 0 | 1932.4 | 2747.3 | 3100.6 | 3993.1 |
| GET /levels/:code/units | 786 | 13.1 | 0 | 1036.5 | 1652.4 | 2272.7 | 2546.8 |
| web /lecons/:id (page) | 786 | 13.1 | 0 | 2.9 | 12 | 42.3 | 56.8 |
| GET /today/:id | 783 | 13.1 | 0 | 3495.9 | 6602.9 | 7134.1 | 7411.4 |
| web /madjaliss/:texte (page) | 780 | 13 | 0 | 3.6 | 27.4 | 70.6 | 105.2 |
| GET /mutun/:texte.json | 780 | 13 | 0 | 5.7 | 32.6 | 78.8 | 99.3 |
| GET /profiles/:id/madjaliss | 780 | 13 | 0 | 545.5 | 1467.3 | 1866.5 | 2256.4 |
| GET /mutun/:texte-differe.json (bêta) | 780 | 13 | 56 | 1097.4 | 2503.3 | 2509.9 | 2673.1 |
| GET /profiles/:id/parcours | 772 | 12.9 | 0 | 2419.2 | 4557.7 | 5535.5 | 5868.6 |
| GET /auth/me | 740 | 12.3 | 0 | 2494.7 | 4127.7 | 4360 | 4513.6 |
| web /coran/mushaf (page) | 722 | 12 | 0 | 3.3 | 36.5 | 153.9 | 297.1 |
| GET /quran/mushaf-exact | 720 | 12 | 0 | 260.2 | 695.4 | 980.3 | 1315.6 |
| GET /quran/audio/reciters | 719 | 12 | 0 | 432.8 | 1059.7 | 1367.1 | 1756.4 |
| GET /fonctions | 714 | 11.9 | 0 | 1549 | 2638.9 | 3015.4 | 3188.5 |
| GET /levels | 704 | 11.7 | 0 | 1279.2 | 2287.4 | 2532.7 | 2572.1 |
| GET /acces/statut | 696 | 11.6 | 0 | 911.9 | 1765.1 | 1987.3 | 2023.2 |
| GET /config | 684 | 11.4 | 0 | 615.4 | 1215.4 | 1424.6 | 1690.2 |
| web / (page) | 668 | 11.1 | 0 | 4.1 | 20.1 | 48.6 | 119.3 |
| GET /quran/audio/reciters/:id/suras/:n | 488 | 8.1 | 0 | 62.2 | 986 | 1304.2 | 1374.2 |
| GET audio de verset (mp3) | 486 | 8.1 | 0 | 54.5 | 739.1 | 1003.8 | 1360.9 |
| web /hifz (page) | 449 | 7.5 | 0 | 3.3 | 16 | 42.4 | 123.2 |
| GET /hifz/books | 446 | 7.4 | 0 | 135.1 | 977.8 | 1232.8 | 1308.7 |
| GET /hifz/profiles/:id | 446 | 7.4 | 0 | 199.5 | 1415.2 | 1721.6 | 1861.8 |
| POST /attempts (5 événements) | 434 | 7.2 | 0 | 1194.6 | 3168.9 | 3963.4 | 4209.6 |
| GET /famille/messages | 434 | 7.2 | 0 | 761.5 | 2746.7 | 3010.7 | 3315 |
| POST /auth/login | 363 | 6.1 | 0 | 6195.8 | 6764.8 | 6842.3 | 6901.6 |

Courbe (fenêtres de 10 s) : 0s:324.2/s p95=6376.4 ; 10s:387.2/s p95=2364.2 ; 20s:402/s p95=904.5 ; 30s:319.5/s p95=2413.4 ; 40s:297/s p95=4547.6 ; 50s:388.5/s p95=1892.1


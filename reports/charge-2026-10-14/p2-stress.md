### Synthèse par palier

| UV | scénario | requêtes | req/s | erreurs % | p50 ms | p95 ms | p99 ms | max ms | CPU machine moy. / max % | cœurs moy. : caddy / web / api / db / écoute | mémoire api / db Mo (pic) | connexions PG (pic / actives) | générateur (cœurs) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|
| 10 | parcours | 21657 | 361 | 0 | 26.1 | 102.9 | 181.5 | 537.2 | 47.5 / 55.2 | 0.24 / 0.08 / 0.69 / 0.97 / 0.03 | 782 / 1129 | 15 / 6 | 0.36 |
| 25 | parcours | 20004 | 333.4 | 0 | 84.7 | 272.9 | 376.3 | 1029.5 | 54.7 / 81.5 | 0.24 / 0.08 / 0.67 / 0.99 / 0.03 | 659 / 1134 | 15 / 7 | 0.34 |
| 50 | parcours | 20885 | 348.1 | 0 | 170.2 | 514.7 | 706.5 | 1046.3 | 53.3 / 57.4 | 0.23 / 0.08 / 0.68 / 0.98 / 0.03 | 668 / 1135 | 14 / 8 | 0.34 |
| 100 | parcours | 21749 | 362.5 | 0 | 322.9 | 1019.2 | 1484 | 1900.6 | 43.1 / 51.2 | 0.24 / 0.08 / 0.69 / 0.96 / 0.03 | 683 / 1137 | 14 / 6 | 0.35 |

### Palier 10 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 2084 | 34.7 | 0 | 25.9 | 48.6 | 67.7 | 128.3 |
| GET audio de leçon (mp3) | 2076 | 34.6 | 0 | 16.8 | 40.4 | 58.8 | 119.6 |
| GET /acces/statut | 695 | 11.6 | 0 | 24 | 44.2 | 61.5 | 77.3 |
| GET /fonctions | 695 | 11.6 | 0 | 34.9 | 61 | 71.2 | 84.5 |
| GET /mutun/:texte-differe.json (bêta) | 694 | 11.6 | 0 | 49.6 | 92.7 | 134.6 | 265.1 |
| web /coran/mushaf (page) | 694 | 11.6 | 0 | 3.2 | 13.3 | 49.2 | 105.2 |
| GET /quran/mushaf-exact | 694 | 11.6 | 0 | 15.5 | 33.7 | 47.4 | 72.7 |
| GET /auth/me | 694 | 11.6 | 0 | 50.8 | 84.8 | 102.6 | 126.7 |
| GET /famille/messages | 694 | 11.6 | 0 | 32.6 | 61.7 | 89.6 | 130.7 |
| GET /levels | 694 | 11.6 | 0 | 76.4 | 128.9 | 169.4 | 256.5 |
| GET /quran/audio/reciters | 694 | 11.6 | 0 | 59.3 | 104.2 | 146.8 | 164.5 |
| web / (page) | 694 | 11.6 | 0 | 4 | 20.6 | 57.2 | 86.1 |
| GET /config | 694 | 11.6 | 0 | 18.8 | 33.9 | 44.2 | 57.3 |
| GET /hifz/books | 693 | 11.6 | 0 | 22.2 | 47.7 | 70 | 106.1 |
| web /madjaliss/:texte (page) | 693 | 11.6 | 0 | 3.5 | 16.7 | 37.5 | 82.7 |
| GET /mutun/:texte.json | 693 | 11.6 | 0 | 5.3 | 28.7 | 90.5 | 162.6 |
| GET /hifz/profiles/:id | 693 | 11.6 | 0 | 30.5 | 59.4 | 86.9 | 128 |
| GET /profiles/:id/madjaliss | 693 | 11.6 | 0 | 25.3 | 50.2 | 66.1 | 143.3 |
| POST /attempts (5 événements) | 693 | 11.6 | 0 | 62.6 | 99.6 | 131.5 | 180.3 |
| GET /today/:id | 692 | 11.5 | 0 | 77.5 | 122.4 | 155.3 | 187.5 |
| GET /quran/audio/reciters/:id/suras/:n | 692 | 11.5 | 0 | 23.5 | 45.9 | 63 | 76.9 |
| GET /profiles/:id/parcours | 692 | 11.5 | 0 | 59.2 | 103.1 | 128.5 | 175.4 |
| GET audio de verset (mp3) | 692 | 11.5 | 0 | 25.9 | 56.5 | 73.9 | 137.1 |
| web /hifz (page) | 692 | 11.5 | 0 | 3.5 | 14.3 | 32.9 | 74 |
| GET /units/:id (leçon) | 691 | 11.5 | 0 | 146 | 237 | 275 | 310.2 |
| GET /levels/:code/units | 690 | 11.5 | 0 | 32.4 | 64.6 | 92.2 | 138.1 |
| web /lecons/:id (page) | 690 | 11.5 | 0 | 3.1 | 14.8 | 48.1 | 84.5 |
| POST /auth/login | 172 | 2.9 | 0 | 151.9 | 277.2 | 498.3 | 537.2 |

Courbe (fenêtres de 10 s) : 0s:339.6/s p95=106 ; 10s:352.5/s p95=105.5 ; 20s:355.3/s p95=106.6 ; 30s:397/s p95=94.2 ; 40s:342.8/s p95=110.5 ; 50s:378.5/s p95=95.5

### Palier 25 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 1913 | 31.9 | 0 | 94.6 | 148.7 | 184.2 | 280.9 |
| GET audio de leçon (mp3) | 1908 | 31.8 | 0 | 45.7 | 85.3 | 113.4 | 441.2 |
| GET /levels | 645 | 10.8 | 0 | 144.8 | 223.4 | 272.6 | 340.3 |
| GET /fonctions | 645 | 10.8 | 0 | 106.3 | 173.3 | 204.6 | 242 |
| GET /levels/:code/units | 644 | 10.7 | 0 | 90.6 | 144.5 | 175.9 | 208.9 |
| web /lecons/:id (page) | 644 | 10.7 | 0 | 3.4 | 37.7 | 90.8 | 160 |
| GET /config | 644 | 10.7 | 0 | 49.2 | 90.3 | 110.8 | 146 |
| web / (page) | 644 | 10.7 | 0 | 4.8 | 35.5 | 100 | 155.5 |
| GET /acces/statut | 644 | 10.7 | 0 | 67.3 | 117.4 | 143.3 | 150 |
| GET /profiles/:id/parcours | 644 | 10.7 | 0 | 207.5 | 287 | 336.9 | 396.4 |
| GET /auth/me | 644 | 10.7 | 0 | 167.6 | 249.9 | 297.9 | 352.1 |
| GET /today/:id | 644 | 10.7 | 0 | 291.8 | 390.8 | 457.8 | 485.3 |
| GET /famille/messages | 641 | 10.7 | 0 | 131.2 | 198.4 | 244.7 | 279.3 |
| POST /attempts (5 événements) | 639 | 10.7 | 0 | 204.9 | 302.2 | 346.4 | 617.3 |
| GET /quran/audio/reciters/:id/suras/:n | 638 | 10.6 | 0 | 80.8 | 128.5 | 162.1 | 494.6 |
| GET /hifz/books | 638 | 10.6 | 0 | 82.8 | 131.3 | 165.3 | 203.2 |
| GET audio de verset (mp3) | 638 | 10.6 | 0 | 72.2 | 124.4 | 170.8 | 1029.5 |
| GET /quran/mushaf-exact | 637 | 10.6 | 0 | 44.8 | 75.3 | 98 | 145 |
| GET /quran/audio/reciters | 637 | 10.6 | 0 | 109.7 | 174.3 | 224.6 | 287.3 |
| web /hifz (page) | 637 | 10.6 | 0 | 3.6 | 24.9 | 58.1 | 403.5 |
| GET /hifz/profiles/:id | 637 | 10.6 | 0 | 119.4 | 181.8 | 211.6 | 263.7 |
| GET /profiles/:id/madjaliss | 636 | 10.6 | 0 | 83.6 | 128.6 | 153.6 | 199.5 |
| GET /mutun/:texte-differe.json (bêta) | 636 | 10.6 | 0 | 164.1 | 240 | 292 | 320 |
| web /coran/mushaf (page) | 636 | 10.6 | 0 | 3.5 | 22.5 | 67.6 | 395.9 |
| GET /units/:id (leçon) | 635 | 10.6 | 0 | 250.4 | 380.8 | 476.4 | 541.4 |
| web /madjaliss/:texte (page) | 635 | 10.6 | 0 | 3.6 | 30 | 86.1 | 134 |
| GET /mutun/:texte.json | 635 | 10.6 | 0 | 5.9 | 31.2 | 83.2 | 129.5 |
| POST /auth/login | 186 | 3.1 | 0 | 376.1 | 527.1 | 639.2 | 712.3 |

Courbe (fenêtres de 10 s) : 0s:359.5/s p95=250.7 ; 10s:318.9/s p95=287.4 ; 20s:294.5/s p95=313.1 ; 30s:307.5/s p95=296.2 ; 40s:353.9/s p95=259.8 ; 50s:366.1/s p95=248

### Palier 50 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET audio de leçon (mp3) | 2014 | 33.6 | 0 | 88.4 | 141 | 173.8 | 265.9 |
| GET /quran/mushaf-exact/pages/:p | 1998 | 33.3 | 0 | 204.9 | 288.7 | 341.7 | 396.4 |
| GET /levels/:code/units | 672 | 11.2 | 0 | 178.5 | 254.3 | 312.6 | 489.8 |
| web /lecons/:id (page) | 672 | 11.2 | 0 | 3 | 26.8 | 63.7 | 102.3 |
| GET /units/:id (leçon) | 672 | 11.2 | 0 | 384.5 | 535.6 | 623.7 | 699.5 |
| GET /quran/mushaf-exact | 671 | 11.2 | 0 | 88.8 | 141.3 | 185.2 | 251.3 |
| GET /mutun/:texte-differe.json (bêta) | 671 | 11.2 | 0 | 333.8 | 433.8 | 464.5 | 572.3 |
| GET /quran/audio/reciters | 671 | 11.2 | 0 | 174.5 | 248.4 | 300.8 | 384.7 |
| web /coran/mushaf (page) | 671 | 11.2 | 0 | 3.2 | 17.9 | 45.6 | 89.1 |
| web /madjaliss/:texte (page) | 671 | 11.2 | 0 | 3.4 | 36.6 | 80.7 | 216.6 |
| GET /mutun/:texte.json | 670 | 11.2 | 0 | 5.4 | 30.6 | 99.1 | 123.2 |
| GET /acces/statut | 669 | 11.2 | 0 | 131.6 | 188.5 | 259.4 | 284.3 |
| GET /auth/me | 669 | 11.2 | 0 | 337 | 431.8 | 474.4 | 622.3 |
| GET /fonctions | 669 | 11.2 | 0 | 216.6 | 300.4 | 344.2 | 403.7 |
| GET /levels | 669 | 11.2 | 0 | 229.8 | 314.7 | 368.9 | 496.8 |
| GET /quran/audio/reciters/:id/suras/:n | 668 | 11.1 | 0 | 165.8 | 234.3 | 290.8 | 387.3 |
| GET /today/:id | 668 | 11.1 | 0 | 640.1 | 800.4 | 868.1 | 987.7 |
| web / (page) | 667 | 11.1 | 0 | 4.3 | 27.8 | 61.6 | 105.9 |
| GET audio de verset (mp3) | 667 | 11.1 | 0 | 137.3 | 209.3 | 261.4 | 373.7 |
| web /hifz (page) | 667 | 11.1 | 0 | 3.4 | 28.6 | 84.5 | 147.1 |
| GET /config | 667 | 11.1 | 0 | 91.8 | 142.7 | 195.8 | 254.7 |
| GET /hifz/profiles/:id | 666 | 11.1 | 0 | 246.8 | 343.3 | 380.2 | 483.8 |
| GET /profiles/:id/madjaliss | 666 | 11.1 | 0 | 168.7 | 238.8 | 290.8 | 346.5 |
| GET /profiles/:id/parcours | 665 | 11.1 | 0 | 442.4 | 577.5 | 647 | 696.8 |
| POST /attempts (5 événements) | 664 | 11.1 | 0 | 425.5 | 551.1 | 621 | 744.5 |
| GET /hifz/books | 664 | 11.1 | 0 | 166.9 | 248.3 | 307 | 336.7 |
| GET /famille/messages | 661 | 11 | 0 | 280.3 | 367 | 422.3 | 442.6 |
| POST /auth/login | 166 | 2.8 | 0 | 670.1 | 852.4 | 975.4 | 1046.3 |

Courbe (fenêtres de 10 s) : 0s:358.7/s p95=498.5 ; 10s:332.1/s p95=556.8 ; 20s:357.5/s p95=497 ; 30s:336.1/s p95=528.3 ; 40s:352/s p95=503.6 ; 50s:352.1/s p95=510

### Palier 100 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET audio de leçon (mp3) | 2097 | 35 | 0 | 176.9 | 276.6 | 343.7 | 579.9 |
| GET /quran/mushaf-exact/pages/:p | 2093 | 34.9 | 0 | 406.1 | 568.3 | 651.1 | 718.5 |
| GET /config | 701 | 11.7 | 0 | 176.6 | 277.5 | 335.4 | 411.6 |
| GET /today/:id | 700 | 11.7 | 0 | 1334.8 | 1653.1 | 1767.9 | 1900.6 |
| GET /levels/:code/units | 700 | 11.7 | 0 | 364.2 | 504.6 | 566.3 | 792.5 |
| web /lecons/:id (page) | 700 | 11.7 | 0 | 3.1 | 24.7 | 79.3 | 258.5 |
| GET /acces/statut | 700 | 11.7 | 0 | 264 | 377 | 429.1 | 511.9 |
| GET /units/:id (leçon) | 699 | 11.7 | 0 | 622.9 | 851.5 | 950.9 | 968.7 |
| GET /auth/me | 698 | 11.6 | 0 | 690 | 906.9 | 982.4 | 1174.9 |
| GET /profiles/:id/parcours | 698 | 11.6 | 0 | 931.2 | 1190.1 | 1268.2 | 1363 |
| GET /levels | 698 | 11.6 | 0 | 392.6 | 548.7 | 603.9 | 712.2 |
| GET /fonctions | 697 | 11.6 | 0 | 442.3 | 613.7 | 685.8 | 801.3 |
| GET /quran/mushaf-exact | 697 | 11.6 | 0 | 173.9 | 265.9 | 318.1 | 473.8 |
| web /madjaliss/:texte (page) | 697 | 11.6 | 0 | 3.4 | 28.4 | 90.9 | 258.9 |
| GET /quran/audio/reciters | 697 | 11.6 | 0 | 304.8 | 422.4 | 470.4 | 566.5 |
| GET /mutun/:texte.json | 697 | 11.6 | 0 | 5.2 | 34.8 | 87.1 | 305 |
| GET /mutun/:texte-differe.json (bêta) | 694 | 11.6 | 0 | 675 | 877.2 | 946 | 1083.8 |
| web /coran/mushaf (page) | 694 | 11.6 | 0 | 3.6 | 30.3 | 67.1 | 169.6 |
| web / (page) | 694 | 11.6 | 0 | 4.6 | 42.4 | 102.4 | 267.2 |
| GET /profiles/:id/madjaliss | 693 | 11.6 | 0 | 340.5 | 499.9 | 572.4 | 625 |
| GET /quran/audio/reciters/:id/suras/:n | 693 | 11.6 | 0 | 318.5 | 455.5 | 514.8 | 613.1 |
| GET audio de verset (mp3) | 693 | 11.6 | 0 | 253.1 | 357.1 | 437.9 | 695.4 |
| web /hifz (page) | 693 | 11.6 | 0 | 3.3 | 35.4 | 93.1 | 260.8 |
| GET /hifz/books | 691 | 11.5 | 0 | 325.5 | 483.1 | 564.6 | 690.9 |
| GET /hifz/profiles/:id | 688 | 11.5 | 0 | 475.9 | 674.5 | 747.7 | 784.9 |
| POST /attempts (5 événements) | 684 | 11.4 | 0 | 808.7 | 1066.1 | 1173 | 1270.6 |
| GET /famille/messages | 679 | 11.3 | 0 | 550.7 | 758.5 | 827.3 | 931.8 |
| POST /auth/login | 184 | 3.1 | 0 | 1245 | 1613.6 | 1765.7 | 1785.3 |

Courbe (fenêtres de 10 s) : 0s:386.5/s p95=1044.1 ; 10s:364.9/s p95=1032.2 ; 20s:392.7/s p95=881.9 ; 30s:373.3/s p95=1016.8 ; 40s:334.2/s p95=1045.6 ; 50s:323.3/s p95=1089.8


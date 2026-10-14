### Synthèse par palier

| UV | scénario | requêtes | req/s | erreurs % | p50 ms | p95 ms | p99 ms | max ms | CPU machine moy. / max % | cœurs moy. : caddy / web / api / db / écoute | mémoire api / db Mo (pic) | connexions PG (pic / actives) | générateur (cœurs) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|
| 5 | parcours | 733 | 8.1 | 0 | 7.9 | 22.2 | 33.6 | 60 | 4 / 11.3 | 0.01 / 0.01 / 0.03 / 0.04 / 0.02 | 348 / 1118 | 14 / 1 | 0.02 |
| 20 | parcours | 2826 | 31.4 | 0 | 6.3 | 20.5 | 31.3 | 54.4 | 13 / 53.6 | 0.04 / 0.01 / 0.08 / 0.09 / 0.02 | 380 / 1122 | 14 / 1 | 0.04 |
| 50 | parcours | 7338 | 81.5 | 0 | 5.5 | 17.8 | 29.7 | 144.8 | 10.3 / 13.4 | 0.08 / 0.03 / 0.17 / 0.19 / 0.02 | 455 / 1124 | 14 / 2 | 0.09 |
| 100 | parcours | 14444 | 160.5 | 0 | 5.3 | 20.3 | 33.5 | 299 | 18.2 / 25.2 | 0.15 / 0.05 / 0.32 / 0.37 / 0.02 | 504 / 1128 | 14 / 3 | 0.16 |

### Palier 5 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 72 | 0.8 | 0 | 12.1 | 20.8 | 22.7 | 22.7 |
| GET audio de leçon (mp3) | 66 | 0.7 | 0 | 5 | 15.7 | 18.1 | 18.1 |
| GET /quran/audio/reciters/:id/suras/:n | 25 | 0.3 | 0 | 7.1 | 14.9 | 15.9 | 15.9 |
| GET audio de verset (mp3) | 25 | 0.3 | 0 | 7.3 | 15 | 21.2 | 21.2 |
| web /hifz (page) | 25 | 0.3 | 0 | 5.8 | 8.2 | 13.1 | 13.1 |
| GET /hifz/books | 25 | 0.3 | 0 | 5.9 | 7.2 | 8.1 | 8.1 |
| GET /hifz/profiles/:id | 25 | 0.3 | 0 | 7.3 | 9.9 | 10.5 | 10.5 |
| POST /attempts (5 événements) | 24 | 0.3 | 0 | 21.9 | 34.3 | 34.5 | 34.5 |
| GET /famille/messages | 24 | 0.3 | 0 | 5.4 | 7.3 | 8.4 | 8.4 |
| web / (page) | 24 | 0.3 | 0 | 4.7 | 10 | 10.7 | 10.7 |
| GET /config | 24 | 0.3 | 0 | 8 | 17.3 | 21.1 | 21.1 |
| GET /acces/statut | 24 | 0.3 | 0 | 9.3 | 18.1 | 18.8 | 18.8 |
| GET /fonctions | 24 | 0.3 | 0 | 10.7 | 19 | 19.1 | 19.1 |
| GET /auth/me | 24 | 0.3 | 0 | 14.1 | 22.9 | 23.5 | 23.5 |
| GET /levels | 24 | 0.3 | 0 | 18.4 | 26.4 | 27.5 | 27.5 |
| GET /profiles/:id/parcours | 24 | 0.3 | 0 | 9.7 | 12.9 | 13.1 | 13.1 |
| GET /today/:id | 24 | 0.3 | 0 | 10.8 | 14.3 | 17.2 | 17.2 |
| web /coran/mushaf (page) | 23 | 0.3 | 0 | 5.6 | 7.2 | 10.7 | 10.7 |
| GET /quran/mushaf-exact | 23 | 0.3 | 0 | 5.6 | 7.6 | 7.6 | 7.6 |
| GET /quran/audio/reciters | 23 | 0.3 | 0 | 13 | 14.8 | 15 | 15 |
| GET /levels/:code/units | 23 | 0.3 | 0 | 12 | 16.9 | 18 | 18 |
| web /lecons/:id (page) | 23 | 0.3 | 0 | 2.6 | 3.4 | 4.1 | 4.1 |
| GET /units/:id (leçon) | 23 | 0.3 | 0 | 22.1 | 29.3 | 33.6 | 33.6 |
| web /madjaliss/:texte (page) | 22 | 0.2 | 0 | 4.5 | 6.6 | 6.9 | 6.9 |
| GET /mutun/:texte.json | 22 | 0.2 | 0 | 4.9 | 9.4 | 9.4 | 9.4 |
| GET /profiles/:id/madjaliss | 22 | 0.2 | 0 | 6.4 | 9 | 9.7 | 9.7 |
| GET /mutun/:texte-differe.json (bêta) | 22 | 0.2 | 0 | 11.2 | 13.9 | 15.2 | 15.2 |
| POST /auth/login | 4 | 0 | 0 | 50.5 | 60 | 60 | 60 |

Courbe (fenêtres de 10 s) : 0s:6.4/s p95=20.8 ; 10s:10.4/s p95=22.1 ; 20s:7.4/s p95=23.2 ; 30s:9/s p95=24.1 ; 40s:6.9/s p95=23 ; 50s:8.1/s p95=20.5 ; 60s:7.5/s p95=21.7 ; 70s:8.8/s p95=22.1 ; 80s:8.8/s p95=25

### Palier 20 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 290 | 3.2 | 0 | 6.1 | 15 | 19.9 | 22.1 |
| GET audio de leçon (mp3) | 267 | 3 | 0 | 4.2 | 9.3 | 12.6 | 13.9 |
| web /coran/mushaf (page) | 95 | 1.1 | 0 | 3.5 | 6.3 | 8.1 | 8.1 |
| GET /quran/mushaf-exact | 95 | 1.1 | 0 | 4.1 | 7 | 11.3 | 11.3 |
| GET /quran/audio/reciters | 95 | 1.1 | 0 | 11.8 | 16.3 | 24.6 | 24.6 |
| GET /quran/audio/reciters/:id/suras/:n | 93 | 1 | 0 | 6.7 | 13.5 | 14.5 | 14.5 |
| GET audio de verset (mp3) | 93 | 1 | 0 | 6.2 | 13.6 | 15.7 | 15.7 |
| web /hifz (page) | 93 | 1 | 0 | 3.2 | 6.3 | 8.3 | 8.3 |
| GET /hifz/books | 93 | 1 | 0 | 5.2 | 8.1 | 12.3 | 12.3 |
| GET /hifz/profiles/:id | 93 | 1 | 0 | 6.4 | 10 | 14.5 | 14.5 |
| POST /attempts (5 événements) | 92 | 1 | 0 | 14.6 | 29.1 | 31.6 | 31.6 |
| GET /famille/messages | 92 | 1 | 0 | 4.9 | 6.4 | 9.2 | 9.2 |
| web /madjaliss/:texte (page) | 90 | 1 | 0 | 3.2 | 6.2 | 10 | 10 |
| GET /mutun/:texte.json | 90 | 1 | 0 | 4.4 | 7.6 | 8.6 | 8.6 |
| GET /profiles/:id/madjaliss | 90 | 1 | 0 | 5.2 | 8.9 | 17 | 17 |
| GET /mutun/:texte-differe.json (bêta) | 90 | 1 | 0 | 10 | 14.4 | 22.3 | 22.3 |
| GET /levels/:code/units | 88 | 1 | 0 | 8.4 | 15.7 | 16.8 | 16.8 |
| web /lecons/:id (page) | 88 | 1 | 0 | 2.4 | 3 | 3.8 | 3.8 |
| GET /units/:id (leçon) | 88 | 1 | 0 | 21.5 | 31.3 | 40.1 | 40.1 |
| web / (page) | 86 | 1 | 0 | 3.4 | 7.1 | 12.1 | 12.1 |
| GET /config | 86 | 1 | 0 | 6.7 | 12 | 18 | 18 |
| GET /acces/statut | 86 | 1 | 0 | 7.5 | 13.3 | 29.4 | 29.4 |
| GET /fonctions | 86 | 1 | 0 | 8.4 | 15 | 19 | 19 |
| GET /auth/me | 86 | 1 | 0 | 10.8 | 17.6 | 25.8 | 25.8 |
| GET /levels | 86 | 1 | 0 | 15.4 | 22.1 | 25.9 | 25.9 |
| GET /profiles/:id/parcours | 86 | 1 | 0 | 8.9 | 13.2 | 28.2 | 28.2 |
| GET /today/:id | 86 | 1 | 0 | 9.4 | 15.8 | 28.4 | 28.4 |
| POST /auth/login | 23 | 0.3 | 0 | 42.5 | 53.4 | 54.4 | 54.4 |

Courbe (fenêtres de 10 s) : 0s:25.9/s p95=17.8 ; 10s:37/s p95=22.1 ; 20s:31.2/s p95=19.9 ; 30s:33.2/s p95=20.5 ; 40s:27.6/s p95=16.7 ; 50s:36.4/s p95=20.8 ; 60s:27.5/s p95=17.4 ; 70s:35.7/s p95=21.1 ; 80s:28.1/s p95=19.4

### Palier 50 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 744 | 8.3 | 0 | 5.1 | 10.4 | 12.7 | 15.8 |
| GET audio de leçon (mp3) | 687 | 7.6 | 0 | 3.4 | 5.9 | 9.1 | 12.1 |
| GET /quran/audio/reciters/:id/suras/:n | 246 | 2.7 | 0 | 5.7 | 11.6 | 13.6 | 14.7 |
| GET audio de verset (mp3) | 246 | 2.7 | 0 | 5.4 | 9.2 | 14.5 | 144.8 |
| web /coran/mushaf (page) | 243 | 2.7 | 0 | 2.8 | 5.5 | 6 | 6.5 |
| GET /quran/mushaf-exact | 243 | 2.7 | 0 | 3.7 | 5.8 | 7.2 | 7.7 |
| GET /quran/audio/reciters | 243 | 2.7 | 0 | 10.7 | 14.4 | 15.2 | 16.8 |
| web /hifz (page) | 241 | 2.7 | 0 | 2.9 | 5.6 | 6.2 | 6.6 |
| GET /hifz/books | 241 | 2.7 | 0 | 4.5 | 7.2 | 8.6 | 18.7 |
| GET /hifz/profiles/:id | 241 | 2.7 | 0 | 5.6 | 8.9 | 11.4 | 28.1 |
| GET /mutun/:texte.json | 235 | 2.6 | 0 | 3.8 | 6.4 | 9.5 | 10.8 |
| GET /profiles/:id/madjaliss | 235 | 2.6 | 0 | 4.9 | 8.6 | 11.9 | 15.3 |
| GET /mutun/:texte-differe.json (bêta) | 235 | 2.6 | 0 | 9.6 | 14.2 | 21.5 | 23 |
| web /madjaliss/:texte (page) | 234 | 2.6 | 0 | 2.8 | 5.7 | 6.4 | 7 |
| POST /attempts (5 événements) | 233 | 2.6 | 0 | 12.9 | 20 | 25.4 | 33.6 |
| GET /famille/messages | 233 | 2.6 | 0 | 4.5 | 6.4 | 9.6 | 10.1 |
| GET /levels/:code/units | 230 | 2.6 | 0 | 7.1 | 12.3 | 16.1 | 17.2 |
| web /lecons/:id (page) | 230 | 2.6 | 0 | 2.2 | 3.1 | 4.4 | 5 |
| GET /units/:id (leçon) | 230 | 2.6 | 0 | 22.1 | 29.7 | 37 | 41.9 |
| web / (page) | 226 | 2.5 | 0 | 2.9 | 5.8 | 6.6 | 7.4 |
| GET /config | 226 | 2.5 | 0 | 5.8 | 9.8 | 11.1 | 17.8 |
| GET /acces/statut | 226 | 2.5 | 0 | 6.5 | 11.1 | 13.3 | 18 |
| GET /fonctions | 226 | 2.5 | 0 | 7.7 | 13.2 | 16.2 | 18.8 |
| GET /auth/me | 226 | 2.5 | 0 | 9.9 | 15.9 | 24.6 | 27 |
| GET /levels | 226 | 2.5 | 0 | 14.7 | 20.2 | 23.5 | 28.4 |
| GET /profiles/:id/parcours | 226 | 2.5 | 0 | 8.5 | 12.5 | 18.5 | 20.1 |
| GET /today/:id | 226 | 2.5 | 0 | 9.2 | 13.9 | 19.1 | 25.8 |
| POST /auth/login | 60 | 0.7 | 0 | 39.9 | 47.7 | 50.7 | 50.7 |

Courbe (fenêtres de 10 s) : 0s:66.5/s p95=13.1 ; 10s:101.3/s p95=21.2 ; 20s:69.7/s p95=14.7 ; 30s:92.1/s p95=20.5 ; 40s:74.7/s p95=15.5 ; 50s:88.1/s p95=19.8 ; 60s:76.1/s p95=15.6 ; 70s:89.4/s p95=20.5 ; 80s:75.9/s p95=15.6

### Palier 100 UV (parcours) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| GET /quran/mushaf-exact/pages/:p | 1462 | 16.2 | 0 | 4.8 | 8.6 | 11.9 | 19 |
| GET audio de leçon (mp3) | 1368 | 15.2 | 0 | 3.4 | 6.8 | 10.4 | 16.6 |
| GET /quran/audio/reciters/:id/suras/:n | 483 | 5.4 | 0 | 5.4 | 10.1 | 14.2 | 21.8 |
| GET audio de verset (mp3) | 483 | 5.4 | 0 | 5.2 | 9.8 | 14.3 | 299 |
| web /coran/mushaf (page) | 480 | 5.3 | 0 | 2.5 | 4.7 | 5.7 | 7.6 |
| GET /quran/mushaf-exact | 480 | 5.3 | 0 | 3.5 | 6.4 | 10 | 10.7 |
| GET /quran/audio/reciters | 480 | 5.3 | 0 | 10.4 | 16.3 | 25.3 | 29.9 |
| web /hifz (page) | 474 | 5.3 | 0 | 2.5 | 4.1 | 6.1 | 11.2 |
| GET /hifz/books | 474 | 5.3 | 0 | 4.3 | 8.9 | 11.5 | 17.8 |
| GET /hifz/profiles/:id | 474 | 5.3 | 0 | 5.4 | 10.5 | 15.8 | 24.4 |
| web /madjaliss/:texte (page) | 468 | 5.2 | 0 | 2.5 | 4.8 | 5.9 | 9.9 |
| GET /mutun/:texte.json | 468 | 5.2 | 0 | 3.5 | 6.7 | 9.7 | 20.1 |
| GET /profiles/:id/madjaliss | 468 | 5.2 | 0 | 4.8 | 9.4 | 14.2 | 15.7 |
| GET /mutun/:texte-differe.json (bêta) | 468 | 5.2 | 0 | 9.3 | 17.5 | 25.1 | 31.2 |
| POST /attempts (5 événements) | 460 | 5.1 | 0 | 12.3 | 22.4 | 28.6 | 33.5 |
| GET /famille/messages | 460 | 5.1 | 0 | 4.7 | 9.3 | 15.4 | 22.6 |
| GET /units/:id (leçon) | 450 | 5 | 0 | 23.4 | 32.6 | 39.2 | 51.6 |
| GET /levels/:code/units | 449 | 5 | 0 | 6.9 | 12.2 | 17.1 | 24.6 |
| web /lecons/:id (page) | 449 | 5 | 0 | 2.2 | 3.2 | 4.9 | 8 |
| web / (page) | 441 | 4.9 | 0 | 2.8 | 5.4 | 6.7 | 8.7 |
| GET /config | 441 | 4.9 | 0 | 5.7 | 10 | 16.5 | 25.4 |
| GET /acces/statut | 441 | 4.9 | 0 | 6.6 | 11.9 | 18.1 | 22.5 |
| GET /fonctions | 441 | 4.9 | 0 | 7.7 | 14.5 | 19.9 | 31.5 |
| GET /auth/me | 441 | 4.9 | 0 | 10.2 | 19 | 27.9 | 35.6 |
| GET /levels | 441 | 4.9 | 0 | 15.1 | 23.4 | 34.1 | 42.9 |
| GET /profiles/:id/parcours | 441 | 4.9 | 0 | 9 | 18.2 | 22.6 | 26.1 |
| GET /today/:id | 441 | 4.9 | 0 | 9.8 | 20.3 | 29.6 | 32.6 |
| POST /auth/login | 118 | 1.3 | 0 | 41.3 | 53.7 | 56.1 | 86.4 |

Courbe (fenêtres de 10 s) : 0s:132.6/s p95=14.4 ; 10s:186.9/s p95=23.4 ; 20s:139.1/s p95=12.7 ; 30s:188.9/s p95=22.4 ; 40s:138.9/s p95=16.4 ; 50s:184.3/s p95=21.8 ; 60s:144.9/s p95=14.4 ; 70s:177.9/s p95=22.2 ; 80s:150.9/s p95=15.2


### Synthèse par palier

| UV | scénario | requêtes | req/s | erreurs % | p50 ms | p95 ms | p99 ms | max ms | CPU machine moy. / max % | cœurs moy. : caddy / web / api / db / écoute | mémoire api / db Mo (pic) | connexions PG (pic / actives) | générateur (cœurs) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|
| 10 | connexion | 1753 | 43.8 | 0 | 222.3 | 314.3 | 352.9 | 957 | 43.7 / 48.4 | 0.03 / 0.01 / 1.77 / 0.19 / 0.02 | 685 / 1126 | 13 / 2 | 0.08 |
| 30 | connexion | 1890 | 47.2 | 0 | 612.9 | 775.3 | 985.4 | 4668.1 | 29.4 / 31.4 | 0.04 / 0.01 / 1.76 / 0.19 / 0.02 | 685 / 1128 | 14 / 3 | 0.07 |
| 60 | connexion | 1664 | 41.6 | 0 | 1287 | 2503.4 | 2679.3 | 9104.8 | 44.8 / 93.8 | 0.03 / 0 / 1.76 / 0.2 / 0.05 | 685 / 1118 | 14 / 3 | 0.06 |

### Palier 10 UV (connexion) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| POST /auth/login | 1753 | 43.8 | 0 | 222.3 | 314.3 | 352.9 | 957 |

Courbe (fenêtres de 10 s) : 0s:41.7/s p95=325.8 ; 10s:43.6/s p95=301.4 ; 20s:42/s p95=320.8 ; 30s:48/s p95=282.8

### Palier 30 UV (connexion) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| POST /auth/login | 1890 | 47.2 | 0 | 612.9 | 775.3 | 985.4 | 4668.1 |

Courbe (fenêtres de 10 s) : 0s:51.7/s p95=701.3 ; 10s:46.9/s p95=737.4 ; 20s:44.2/s p95=846.8 ; 30s:46.2/s p95=960.6

### Palier 60 UV (connexion) — routes (triées par volume)

| route | n | req/s | err | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|---:|
| POST /auth/login | 1664 | 41.6 | 0 | 1287 | 2503.4 | 2679.3 | 9104.8 |

Courbe (fenêtres de 10 s) : 0s:27.4/s p95=2698.2 ; 10s:43.1/s p95=1621 ; 20s:49/s p95=1556.8 ; 30s:46.9/s p95=1460.6


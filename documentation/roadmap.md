# Roadmap — повний план робіт

Статуси: ✅ зроблено · 🔄 в роботі · ⬜ заплановано

---

## Майлстоун 1 — Фундамент

### 1.1 Середовище та репозиторій (TASK-001…003)
- [x] Node.js, npm, Git перевірені
- [x] Монорепозиторій: npm workspaces (`apps/*`, `packages/*`)
- [x] `.gitignore`, `.env.example`, `README.md`, `documentation/`
- [x] `docker-compose.yml`: PostgreSQL 16, Redis 7, Adminer (+healthchecks, volumes)
- [x] Перший коміт, репозиторій на GitHub (`Envyyy-uk/crypto_changer`)
- [x] Docker Desktop встановлений, `docker compose up -d` — postgres/redis/adminer healthy

### 1.2 Backend-каркас (TASK-004…005)
- [x] NestJS-застосунок, глобальний префікс `/api`
- [x] `GET /api/health` → `{"status":"ok"}`
- [x] Всі 14 модулів створені (7 робочих + 7 заглушок: trades, market-data, wallets, admin, notifications, audit, p2p)
- [x] Prisma-схема повністю описана (snake_case таблиці)
- [x] Перша міграція застосована до PostgreSQL (`20260714220717_init`)
- [x] Seed виконаний (4 активи, 3 ринки)

### 1.3 Користувачі та вхід (TASK-006…008)
- [x] Модель User: role (USER/SUPPORT/ADMIN/SUPER_ADMIN), status (ACTIVE/SUSPENDED/BLOCKED), 2FA-поля
- [x] `POST /api/auth/register`: email-валідація, пароль ≥10 символів, Argon2id, унікальність
- [x] `POST /api/auth/login`: accessToken + refreshToken (JWT)
- [x] `POST /api/auth/refresh`: оновлення токенів
- [x] Блокування на 15 хв після 5 невдалих спроб
- [x] Журнал входів `login_audits` (IP, user-agent, причина відмови)
- [x] `GET /api/users/me`

### 1.4 Активи та ринки (TASK-011…012)
- [x] Модель Asset: BTC, ETH, SOL, USDT (у seed)
- [x] Модель Market: tickSize, quantityStep, minimumQuantity, minimumNotional, makerFee, takerFee, статуси
- [x] BTCUSDT (tick 0.10, step 0.00001, minNotional 5, fee 0.1%), ETHUSDT, SOLUSDT
- [x] `GET /api/assets`, `GET /api/markets`, `GET /api/markets/:symbol`

### 1.5 Ledger і баланси (TASK-013…016)
- [x] Таблиці: `accounts`, `ledger_transactions`, `ledger_entries`, `holds`
- [x] Подвійний запис: Σ дебетів = Σ кредитів, інакше транзакція відхиляється
- [x] Заборона прямої зміни балансу — тільки через ledger
- [x] 100 000 тестових USDT при реєстрації (DEBIT системного рахунку → CREDIT користувача)
- [x] Блокування коштів: available → locked + hold; повернення при скасуванні
- [x] Захист від double-spend: guarded atomic updates, від'ємний баланс неможливий
- [x] `GET /api/balances`
- [x] Всі суми: NUMERIC(36,18) + decimal.js, серіалізація як string

### 1.6 Limit-ордери (TASK-020…022)
- [x] Модель Order: side, type, price, quantity, filled/remaining, 6 статусів
- [x] `POST /api/orders`: перевірки ринку, tickSize, quantityStep, minimumNotional, балансу; блокування коштів
- [x] `DELETE /api/orders/:id`: CANCELLED + повернення locked → available (повторне скасування → 409)
- [x] `GET /api/orders/open`, `GET /api/orders/history` (пагінація, фільтр за ринком), `GET /api/orders/:id`

### 1.7 Тести та верифікація
- [x] Unit-тести: ledger-інваріанти (5), ордери (9), decimal-правила (8) — 23 зелених
- [x] Build чистий, сервер стартує, health перевірений
- [x] E2E через живу БД: реєстрація → 100000 USDT (ledger DEBIT/CREDIT перевірено в psql) → Limit Buy 0.01 BTC@60000 → locked 600 → cancel → available 100000. Перевірено і через curl, і через живий браузерний UI

---

## Майлстоун 2 — Торгове ядро

### 2.1 Стакан (TASK-023)
- [x] Окремий order book на кожен ринок (in-memory ядро, `matching/engine/order-book.ts`)
- [x] Buy: найвища ціна перша; Sell: найнижча перша; при рівній ціні — FIFO за часом
- [x] Агрегований snapshot рівнів (для майбутнього `GET /api/orderbook/:symbol`)
- [x] Відновлення стакана з БД після рестарту (`MatchingService.onModuleInit`, FIFO за createdAt) — перевірено логом "Matching engines ready... N resting order(s) restored"
- [ ] `GET /api/orderbook/:symbol` REST endpoint (снепшот вже є через `MatchingService.getSnapshot`, лишається обгорнути контролером)

### 2.2 Matching engine (TASK-024…025)
- [x] Крос: виконання коли best Bid ≥ best Ask (ядро, `matching/engine/matching-engine.ts`)
- [x] Повне виконання (FILLED) і часткове (PARTIALLY_FILLED) з коректними залишками
- [x] Ціна виконання = ціна maker-ордера
- [x] Атомарність: `MatchingService.submitAndSettle` — Trade + баланси (reduceHold) + статуси ордерів в одній Prisma-транзакції
- [x] Консумація holds при виконанні (ACTIVE → CONSUMED через `BalancesService.reduceHold`, пропорційно щодо власної ціни ордера — природно реалізує price-improvement refund для покупця)
- [x] **Перевірено на реальних двох користувачах**: SELL 0.01 BTC@60000 проти resting BUY@60100 → FILLED за ціною мейкера 60100 (продавець отримав price improvement), Trade-рядок і 6 ledger-записів збалансовані (Σdebit=Σcredit=601.01)

### 2.3 Market-ордери (TASK-026)
- [x] Проходження по кількох рівнях стакана (ядро; залишок скасовується, не лягає в стакан)
- [x] Розрахунок середньої ціни виконання (перевірено тестом: 1802 ÷ 0.03 = 60066.67)
- [x] Відхилення при порожньому стакані — і в ядрі, і в API (`resolveMarketReservePrice` перевіряє снепшот перед створенням ордера)
- [x] Резервування для MARKET BUY: cap-ціна = найкращий ask × 1.10 (буфер прослизання), надлишок автоматично повертається тим самим price-improvement механізмом. **Перевірено наживо**: MARKET BUY 0.005 BTC проти resting SELL@61000 → FILLED за 61000, зайвий резерв (67100 cap) повністю повернувся, `locked` після операції = 0
- [ ] Захист: max price deviation (окрема перевірка понад cap-буфер) — не реалізовано

### 2.4 Комісії (TASK-027)
- [x] maker/taker fee з конфігурації ринку (0.1%), окремо для сторони-мейкера і сторони-тейкера
- [x] Комісія береться з активу, який сторона отримує (покупець — у базовому активі, продавець — у quote), округлення природне через Decimal(36,18)
- [x] Зарахування на системний рахунок FEE_REVENUE через ledger (окремо base і quote FEE_REVENUE-рахунки)

### 2.5 Захист engine (TASK-028)
- [x] Self-trade prevention (cancel-taker: залишок taker скасовується, resting-ордер недоторканий, rejectReason='SELF_TRADE_PREVENTED')
- [ ] Maximum order size
- [ ] Idempotency key на створення ордера
- [x] Захист від подвійного виконання: вся розрахункова частина йде в одній Prisma-транзакції; двофазний дизайн (лок коштів окремою транзакцією, потім matching+settle) — якщо друга транзакція впаде, ордер лишається OPEN з залоченими коштами (безпечний відкат), а не в напіврозрахованому стані

### 2.6 Угоди та історія (TASK-029…030)
- [x] Модель Trade: maker/taker ордери, buyer/seller, price, quantity, quoteAmount, makerFee, takerFee — заповнюється `MatchingService.settleFill`
- [x] `GET /api/trades/history` (пагінація, фільтр за ринком) — перевірено наживо, показує реальну угоду

### 2.7 Ринкові дані (TASK-017…019)
- [x] Підключення до публічного WebSocket Binance: ціна, 24h change, high/low, volume
- [x] Автоперепідключення з backoff, позначка `stale` після 10 с без оновлень
- [x] `GET /api/market-data/tickers`, `GET /api/market-data/tickers/:symbol`
- [x] Власний WebSocket `/ws`: розсилка тикерів клієнтам (1 раз/с + snapshot при підключенні)
- [ ] Свічки: 1m, 5m, 15m, 1h, 4h, 1d (OHLCV) у БД ← чекає БД
- [ ] Канали стакана, угод, балансів у власному WS (наразі REST `GET /api/orderbook/:symbol` — знімок стакана вже реальний, live-push каналом не зроблено)

---

## Майлстоун 3 — Торговий інтерфейс

### 3.1 Frontend-каркас (TASK-031)
- [x] React + Vite + TypeScript в `apps/frontend` (dark exchange theme)
- [x] Сторінки: /login, /register, /markets, /trade/:symbol, /wallet, /orders (settings — пізніше)
- [x] Авторизація: зберігання токенів, auto-refresh при 401, route guards
- [x] Vite proxy на backend (/api, /ws), `host: true` для доступу з телефона

### 3.2 Торгова сторінка (TASK-032…034)
- [x] Layout: market info | chart-зона | форма Buy/Sell + відкриті ордери знизу
- [x] Форма Buy/Sell (Limit): Total = Price × Quantity, комісія, доступний баланс, скасування ордерів
- [x] Live-ціни через власний WebSocket /ws (markets + trade сторінки, LIVE/STALE бейджі)
- [x] Графік свічок (Lightweight Charts v5) через klines-проксі (`GET /api/market-data/klines/:symbol`), перемикання 1m/5m/15m/1h/4h/1d — перевірено наживо в браузері
- [x] Стакан (`OrderBook.tsx`, поллінг `/api/orderbook/:symbol` кожні 2с) і публічна стрічка угод (`TradeTape.tsx`, новий `GET /api/trades/recent/:symbol` без авторизації, показує тільки price/quantity/side тейкера — без buyer/seller id). Перевірено наживо: реальні рівні бота і реальні угоди відображаються на торговій сторінці, spread рахується коректно
- [ ] Live-оновлення через WS (зараз — поллінг кожні 2с для стакана/угод, refresh після дій для ордерів/балансу) — окремий WS-канал лишається на потім

### 3.3 Маркетмейкер (TASK-035)
- [x] Окремий системний користувач (`marketmaker@system.local`), тестові BTC/ETH/SOL/USDT (10/100/2000/5,000,000 — засіюється один раз через ledger)
- [x] Котирування навколо реальної ціни (3 рівні bid/ask, 0.02%/0.05%/0.10% від mid, округлення до tickSize)
- [x] Регулярне скасування й переставлення заявок (кожні 5с, `MARKET_MAKER_INTERVAL_MS`)
- [x] Self-trade неможливий за конструкцією (той самий userId → STP движка); fallback на ціну останньої угоди, якщо зовнішній тікер stale
- [x] **Перевірено наживо**: реальний користувач зробив MARKET BUY 0.01 BTC проти котирувань бота → FILLED за ціною бота (мейкер-комісія списалась з бота, taker-комісія з користувача)
- [ ] Явна позначка «симуляція ліквідності» в публічному API/UI (зараз лише впізнавана системна пошта)

### 3.4 Доступ з телефона (TASK-047)
- [ ] Vite з `--host 0.0.0.0`, перевірка з телефона по Wi-Fi
- [ ] Адаптивна верстка торгової сторінки

---

## Майлстоун 4 — Операції

### 4.1 Депозити/виведення-симулятор (TASK-036…037)
- [x] «Add test funds»: вибір активу й суми, статуси PENDING → CONFIRMED через ledger (симуляція затримки підтвердження ~2с)
- [x] Виведення: адреса, статуси PENDING → APPROVED → PROCESSING → COMPLETED (автопрогрес по таймеру, ~1.5с/крок); кошти списуються з available одразу при створенні (system-рахунок WITHDRAWAL_SUSPENSE), без окремого Hold (Hold прив'язаний до Order у схемі)
- [x] Історія депозитів і виведень (backend + сторінка Wallet: форми + таблиці історії з поллінгом)
- [ ] 2FA-код при виведенні (DTO вже приймає `twoFactorCode`, але не перевіряється — 2FA ще не реалізовано, чекає Майлстоуна 5)
- [ ] **Код написаний і зібраний чисто, але НЕ перевірений на живій БД** — Docker Desktop завис під час цієї сесії (~15+ хв, движок не відповідав навіть після повного перезапуску); користувач вирішив зупинитись на цьому до відновлення бази. Коли Docker підніметься: `prisma migrate dev --name add_deposits_withdrawals`, потім E2E (deposit → CONFIRMED → баланс +amount; withdrawal → available -amount одразу → PENDING→APPROVED→PROCESSING→COMPLETED)

### 4.2 Адмінпанель (TASK-039…040)
- [x] Admin-модуль API з RBAC: `@Roles(ADMIN, SUPER_ADMIN)` + `RolesGuard` (перевірено unit-тестами, 4/4)
- [x] Користувачі: `GET /api/admin/users` (список), `GET /api/admin/users/:id` (баланси/ордери/угоди/депозити/виведення), `PATCH /api/admin/users/:id/status` (ACTIVE/SUSPENDED/BLOCKED)
- [x] Перегляд балансів, ордерів, угод будь-якого користувача (у `getUserDetail`)
- [x] Керування ринками: `GET/PATCH /api/admin/markets/:symbol` — статус (ACTIVE/HALTED/CANCEL_ONLY/DISABLED), maker/taker fee
- [x] Коригування балансу тільки через ledger-операцію: `POST /api/admin/balance-adjustments` (userId, asset, підписана сума, reason) — DEBIT/CREDIT системного рахунку ADMIN_ADJUSTMENT, ніколи прямий UPDATE
- [x] Запуск/зупинка маркетмейкера: `GET/POST /api/admin/market-maker/{status,pause,resume}` (MarketMakerService.pause/start/isRunning)
- [ ] Окремий `apps/admin` React-фронтенд — не зроблено, є тільки API. Керувати поки можна через curl/Postman/adminer
- [ ] **Не перевірено на живій БД** (та сама причина — Docker завис цієї сесії). Потребує вручну підняти роль User.role до ADMIN через psql для першого тестового адміна

### 4.3 Повний audit log (TASK-041)
- [x] `AuditLog` модель + `AuditService` (append-only, actorId/action/targetType/targetId/metadata JSON)
- [x] Записується для: зміни статусу користувача, зміни ринку, коригування балансу, пауза/резюм маркетмейкера
- [x] `GET /api/admin/audit-log` (пагінація, фільтр за targetType)
- [ ] Ще не пише: реєстрація, паролі, 2FA, ордери, депозити/виведення (LoginAudit вже покриває входи окремо з М1)

### 4.4 Testnet (TASK-038, опційно)
- [ ] Anvil (local Ethereum) + тестовий ERC-20, Bitcoin regtest
- [ ] Генерація адрес, відстеження підтверджень, зарахування депозитів

---

## Майлстоун 5 — P2P та безпека акаунта

### 5.1 P2P-маркетплейс (див. p2p-design.md)
- [ ] Платіжні методи користувача
- [ ] Оголошення (ads): buy/sell, ціна, ліміти, умови, статуси
- [ ] P2P-ордери: state machine CREATED → ESCROWED → PAID → RELEASED / DISPUTED / CANCELLED
- [ ] Ескроу через ledger (системний рахунок P2P_ESCROW)
- [ ] Таймаути: автоскасування неоплачених, автоескалація оплачених-але-не-виданих у диспут
- [ ] Чат між сторонами угоди
- [ ] Диспути та розв'язання модератором (SUPPORT/ADMIN)
- [ ] P2P-сторінки у frontend

### 5.2 Email-верифікація (TASK-009)
- [ ] Mailpit у docker-compose, лист із посиланням, `emailVerified = true`

### 5.3 2FA (TASK-010)
- [x] TOTP: `TwoFactorService` (otplib v12, чиста логіка, 6 unit-тестів) — генерація секрету, otpauth:// URL, QR-код (data URL), верифікація коду
- [x] `POST /api/auth/2fa/setup` (генерує pending-секрет + QR), `POST /api/auth/2fa/confirm` (код → вмикає 2FA + видає 10 резервних кодів, argon2-хеші, показуються один раз)
- [x] Вимкнення тільки після повторної перевірки пароля: `POST /api/auth/2fa/disable` (password + code)
- [x] 2FA-виклик на вхід: `login` повертає `{requiresTwoFactor: true}` без токенів, якщо ввімкнено і код не наданий; фронтенд (LoginPage) показує другий крок
- [x] 2FA-виклик на виведення: `WalletsService.createWithdrawal` викликає `AuthService.verifyCodeForUser` (TOTP або резервний код, який одразу позначається використаним)
- [x] Frontend: сторінка `/settings` (QR + підтвердження + показ backup-кодів + вимкнення), поле 2FA-коду у формі виведення
- [ ] **Не перевірено на живій БД** (та сама причина з Docker) — потрібна нова міграція для `twoFactorSecret`/`TwoFactorBackupCode`

### 5.4 Токени та захист API (TASK-042)
- [ ] Refresh token rotation + збереження/відкликання в БД
- [ ] CSRF (якщо cookies), посилений rate limiting, секрети-аудит

---

## Майлстоун 6 — Тестування і запуск

### 6.1 Фінансові інваріанти (TASK-043…044)
- [ ] Автоматична перевірка після операцій: available ≥ 0, locked ≥ 0, Σ дебетів = Σ кредитів, locked = Σ активних holds
- [ ] Unit-тести matching engine: повне/часткове виконання, кілька рівнів, self-trade, комісії

### 6.2 E2E (TASK-045)
- [ ] Playwright: реєстрація → email → 2FA → депозит → Limit Buy → виконання через MM → перевірка балансу й комісії → продаж → виведення

### 6.3 Локальний запуск (TASK-046)
- [ ] Backend + frontend + admin у Docker (`docker compose up --build` — одна команда)
- [ ] Nginx reverse proxy у `infrastructure/nginx`
- [ ] Порти: frontend 5173, backend 3000, admin 5174, adminer 8080

### 6.4 Закрите тестування
- [ ] Тестування з реальними користувачами в локальній мережі
- [ ] Виправлення знайдених проблем, фінальний аудит логіки

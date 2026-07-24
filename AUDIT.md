# Phase 0 — Frontend Audit

> Источник ТЗ: в корне нет файла `MASTER_PROMPT_booking_platform.md`. Полный текст ТЗ лежит в `AGENTS.md` (заголовок: «MASTER PROMPT — Cottage Resort Booking Platform»). Аудит выполнен по нему.
> Код приложения **не изменялся**. Создан только этот файл.

---

## 1. Stack (публичный сайт)

| Слой | Технология | Версия / заметки |
|------|------------|------------------|
| UI | React (JSX, не TypeScript) | `^19.1.0` |
| Bundler | Vite | `^7.0.4` |
| Routing | `react-router-dom` | `^7.6.3` — `BrowserRouter` |
| i18n | `i18next` + `react-i18next` + browser language detector | ru / uz / en |
| HTTP | `axios` в `package.json` | **не используется** ни в одном `src/` файле |
| Даты | `dayjs` в зависимостях | **не используется** во фронтенде |
| Стили | один глобальный CSS | `src/css/style.css` (~1650 строк), CSS-переменные |
| Шрифты | Google Fonts | Cormorant Garamond + Golos Text |
| Деплой | Netlify | SPA redirect `/* → /index.html`, плагин Cloudinary |
| Dev proxy | Vite `/api` → `http://localhost:5005` | см. `vite.config.js` |

**Вывод по §14 п.8:** существующий фронтенд — **React + Vite (SPA)**, не Next.js и не plain HTML.

---

## 2. Структура репозитория

```
ecoLife/
├── AGENTS.md                 # ТЗ (master prompt)
├── AUDIT.md                  # этот файл (Phase 0)
├── index.html
├── package.json              # публичный сайт
├── vite.config.js
├── netlify.toml
├── public/                   # sitemap, robots
├── src/
│   ├── main.jsx              # entry: Router + i18n + CSS
│   ├── App.jsx               # routes + Header/Footer shell
│   ├── i18n.js
│   ├── css/style.css
│   ├── locales/{ru,uz,en}.json
│   ├── assets/               # webp/png (hero, rooms, gallery, …)
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── Footer.jsx
│   │   ├── Gallery.jsx
│   │   ├── Reveal.jsx        # scroll-reveal
│   │   ├── ScrollToTop.jsx
│   │   └── icons.jsx
│   └── pages/
│       ├── Home.jsx
│       ├── BookingPage.jsx   # страница «номера» (без формы брони)
│       └── HowToget.jsx
└── backend/                  # LEGACY — не соответствует ТЗ (§3)
    ├── server.js             # Express + MongoDB + Telegraf
    ├── seeds.js
    └── api/{search,booking,confirm}.js
```

Маршруты публичного сайта:

| Path | Страница | Назначение |
|------|----------|------------|
| `/` | `Home` | лендинг |
| `/booking` | `BookingPage` | каталог категорий номеров + контакты |
| `/how-to-get` | `HowToGet` | маршрут / карта |

Admin panel, NestJS API, Prisma, Docker compose — **отсутствуют** (будут в следующих фазах).

---

## 3. Где рендерятся 4 категории (критично для §2)

Реальный инвентарь по ТЗ: только **`lux`** и **`standart`**. Сейчас UI показывает **четыре** маркетинговые категории.

### 3.1 Booking page — все 4 карточки

Файл: `src/pages/BookingPage.jsx`

```js
const rooms = [1, 2, 3, 4].map((id) => ({ ... }));
// grid: rooms-grid rooms-grid--four
```

Картинки: `src/assets/room-{1,2,3,4}.webp`.

### 3.2 Home — превью (3 из 4)

Файл: `src/pages/Home.jsx` — секция «Комнаты» рендерит `room1`–`room3` (без `room4`), со ссылками на `/booking`.

### 3.3 i18n — названия и «четыре категории»

Ключи `roomsData.room1` … `room4` во всех локалях:

| Key | RU | UZ | EN | Соответствие ТЗ |
|-----|----|----|-----|-----------------|
| room1 | Стандарт | Standart | Standard | ≈ `standart` |
| room2 | Полулюкс | Yarim lyuks | Semi-Luxury | **лишняя** — убрать |
| room3 | Люкс | Lyuks | Luxury | ≈ `lux` |
| room4 | Апартаменты | Apartament | Apartment | **лишняя** — убрать |

Тексты-лиды:

- `roomsLead` (ru): «**Четыре** категории номеров…»
- аналогично en / uz

### 3.4 Мёртвый `state={{ showAll: true }}`

Header и Home передают `state={{ showAll: true }}` при навигации на `/booking`, но `BookingPage` **не читает** `useLocation().state`. Наследие удалённого UI.

### 3.5 CSS

- `.rooms-grid` — общая сетка
- `.rooms-grid--four` — сетка под 4 колонки на booking page  
  При переходе на 2 категории сетку нужно адаптировать (не ломая look & feel).

---

## 4. Текущий booking flow (факт)

**Онлайн-бронирования на фронте нет.**

Страница `/booking` сейчас:

1. Показывает 4 карточки (фото + title + description).
2. Кнопок «Book Now» / модалки / date picker / выбора комнаты **нет**.
3. Внизу — contact band: телефоны + Telegram.

В локалях уже есть «заготовки» под старую форму (не подключены к UI):

- `check-in`, `check-out`, `guests`, `find`, `name`, `phoneN`, `submit`, `cancel`
- `bookRoom`, `bookingSuccess`, `bookingError`, `networkError`, `invalidName`, `invalidPhone`

Vite proxy на `/api` и зависимости `axios`/`dayjs` намекают, что форма/поиск когда-то планировались или были удалены. Сейчас фронт **не вызывает** API.

Контакты (хардкод): `+998 55 900 01 10`, `+998 98 150 50 80`, Telegram `@EcoLifeEtiqod`.

---

## 5. Legacy backend (контекст, не переиспользовать)

Папка `backend/` — Express 5 + **MongoDB/Mongoose** + **Telegraf**, seed из **3 абстрактных комнат**, availability = массив дат `bookings: string[]` на документе комнаты.

| ТЗ (§3) | Legacy |
|---------|--------|
| NestJS + Prisma + PostgreSQL 16 | Express + Mongoose + MongoDB |
| grammY | Telegraf |
| 41 physical room, cottage hierarchy | 3 fake rooms |
| exclusion constraint / FOR UPDATE | нет anti-overbooking на уровне БД |
| Payme / Click / Mock | нет платежей |

**Рекомендация:** не развивать `backend/`. В Phase 1 поднять новый NestJS + Postgres. Legacy оставить до явного решения владельца (удалить / архивировать).

Баг в legacy (для справки): в `server.js` callback Telegram использует `dayjs` без import.

---

## 6. Design system (сохранять look & feel)

CSS variables в `:root`:

- Palette: `--ink`, `--paper`, `--moss`, `--honey`, …
- Fonts: display = Cormorant Garamond, body = Golos Text
- Components: `.btn--primary|ghost|outline|paper|line`, `.room-card`, `.contact-band`, `.page-head`, …

**Правило Phase 5:** не пересобирать визуальный язык; добавлять date picker / modal / availability в существующих токенах и классах кнопок/карточек.

Языки: **ru / uz / en** (переключатель в Header). Валюта в UI сейчас не показывается (нет цен).

---

## 7. Integration plan (как встроить бронирование — Phase 5)

Работа только в Phase 5; здесь план стыковки с API из §5–§6.

### 7.1 Сократить категории до 2

1. `BookingPage.jsx`: рендер только `standart` + `lux` (или `room1` + `room3` с remap на `code`).
2. `Home.jsx`: превью тоже 2 категории.
3. Локали: обновить `roomsData`, `roomsLead` («две категории»); удалить/не использовать room2/room4.
4. CSS: `rooms-grid--four` → сетка на 2 карточки.
5. Картинки: оставить 2 лучших ассета; остальные можно держать в assets без UI.

Данные категорий (описание, deposit %, images, цены) лучше тянуть с API (`GET` categories / public catalog), а не хардкодить — чтобы админ мог править.

### 7.2 Booking page + live availability

На `/booking`:

1. Date range picker (`check_in` / `check_out`) + опционально guests.
2. `GET /api/v1/availability?check_in=&check_out=` → `available_beds` / rooms per category.
3. На карточках категории: цена (из tiers), deposit %, availability после выбора дат.
4. CTA **«Book Now»** → модалка (не уводить на другой layout).

### 7.3 Modal (whole-room flow, §6)

Поля:

- first name, last name, phone (`+998…` mask)
- category (pre-filled), dates, guests
- список доступных комнат категории с `capacity >= guests` (best-fit), цена/ночь
- расчёт (клиентский preview): `total = nights × price`, deposit 30%/50%; **финальный пересчёт только на сервере**
- выбор провайдера: Payme / Click (Mock в dev)

Submit → `POST /api/v1/bookings` → `paymentUrl` → redirect.

Новые страницы/роуты:

- `/booking/success?code=BK-…`
- `/booking/fail` (или query на той же странице)

Сохранить Header/Footer shell.

### 7.4 API client слой

Рекомендуемый минимум:

```
src/api/
  client.js          # axios instance, baseURL из VITE_API_URL
  availability.js
  bookings.js
  categories.js
```

Env: `VITE_API_URL` (prod) / proxy `/api` в dev. Обновить Vite proxy на порт NestJS (не 5005 legacy).

### 7.5 i18n

Добавить ключи для модалки, депозита, статусов оплаты, ошибок 409 («комната только что занята»), success/fail. Три локали синхронно.

### 7.6 Что не трогать без нужды

Home hero, farm stories, amenities, gallery, HowToGet, Footer contacts, общая палитра/типографика.

---

## 8. Risks & gaps

| # | Риск | Влияние | Митигация |
|---|------|---------|-----------|
| 1 | 4 маркетинговые категории ≠ 2 реальных | путаница гостей / неверные ожидания | Phase 5: cut to lux/standart + тексты |
| 2 | Нет UI бронирования | весь flow §6 строить с нуля на существующем CSS | modal + date picker в Phase 5 |
| 3 | Legacy Mongo backend в репо | риск случайного подключения | не использовать; Phase 1 = Nest+PG |
| 4 | `axios`/`dayjs` не подключены, proxy на старый порт | путаница при интеграции | новый client + proxy на Nest |
| 5 | Цены PLACEHOLDER (§14.7) | номера без price_tier не бронируются | admin price matrix ASAP; seed placeholders |
| 6 | Netlify только static SPA | Nest/Postgres/bot на Netlify не живут | API+DB на VPS/Docker (§9); сайт может остаться на Netlify с `VITE_API_URL` |
| 7 | JS без TypeScript на публичном сайте | ТЗ требует typed backend; public site — as-is | не мигрировать фронт на TS без запроса |
| 8 | `showAll` dead state | шум | убрать в Phase 5 |
| 9 | Min/max stay, check-in times (§14.10) | валидация дат | спросить владельца или defaults 14:00/12:00 |
| 10 | i18n fallback = `en` | для UZ-аудитории спорно | подтвердить default `ru` |

---

## 9. Answers to open questions (из аудита)

| §14 | Статус |
|-----|--------|
| 8. Frontend stack | **React + Vite SPA** (подтверждено) |
| 9. Languages | **ru / uz / en** в UI; в Phase 5 fallback i18n → **`ru`** (подтверждено) |
| 7. Real prices | seed **placeholders**; владелец заполнит через админку |
| 10. Stay / times | check-in **14:00**, check-out **12:00**, min **1** ночь, max **30** ночей |
| 11. Payme/Click | по-прежнему ⚠️ (Phase 4) |
| Legacy `backend/` | **не трогать / не переиспользовать**; удалить позже |

---

## 10. Phase 0 deliverables

| Создано | Изменено в коде |
|---------|-----------------|
| `AUDIT.md` | **ничего** (на момент Phase 0) |

Phase 0 принят → Phase 1 в `api/`.

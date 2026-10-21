# backend/services

The work behind a few of the server addresses, kept apart from the request handling in `backend/api/`.

| What | Kind | Used by |
| --- | --- | --- |
| `invoice-sync.js` | A JavaScript file the server functions import | `backend/api/inventory.js`, to check an invoice the owner confirmed before saving it with their stock |
| `vision/shelf-count.js` | A JavaScript file the server functions import | `backend/api/read-document.js`, to count one shelf from a photo |
| `forecast/` | A separate Python program, run on its own server | `backend/api/forecast.js` calls it over the internet; see `forecast/README.md` to run it |

Only `forecast/` runs on its own. The other two do nothing until a function in `backend/api/` uses them.

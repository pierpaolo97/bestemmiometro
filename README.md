🔥 Bestemmiometro

Bestemmiometro is a multiplayer web application built with React and Firebase to track “curses”, “blessings”, and “super curses” inside a team in a fun and gamified way.

The platform supports:

* Team separation through Team Keys
* Persistent login using localStorage
* Maintainer and Player roles
* Push Notifications through Firebase Cloud Messaging
* Complete event history
* Blessing and Super Curse mechanics
* Automatic deployment through GitHub Pages

⸻

🚀 Features

Login

Users access the platform using:

* Team Key
* First Name
* Last Name

Users are validated through Firebase and their session is stored locally.

⸻

Roles

Player

Players can:

* View the leaderboard
* Assign curses
* Assign blessings
* Use super curses when enough blessings are available

Maintainer

Maintainers can additionally:

* Create new users
* Delete events
* Remove users
* Manage the team

⸻

🔥 Event System

Curse

Adds:

+1 point

⸻

Blessing

Adds:

-1 point

and generates one available blessing credit.

⸻

Super Curse

Requires:

2 available blessing credits

from the user who is assigning it.

Effects:

* Consumes 2 blessings from the author
* Assigns +2 points to the target

Consumed blessings remain visible in the history but no longer affect the score.

⸻

🏆 Leaderboard

The leaderboard displays:

* Username
* Available blessings
* Total score

Score formula:

Total Score = Sum of all non-consumed events

⸻

📜 Event History

Each user has a complete history of received events.

Every event shows:

* Event type
* Description
* Author
* Date

Maintainers can delete events and remove users.

⸻

🔔 Push Notifications

The application supports push notifications through:

* Firebase Cloud Messaging
* Service Workers
* PWA installation on iPhone and Android

Notifications are automatically sent whenever a new event is created.

Examples:

🔥 New curse assigned to Andrea
🙏 New blessing assigned to Marco
💀 Super curse assigned to Pierpaolo

The user who creates the event does not receive the notification.

⸻

🏗️ Technology Stack

Frontend

* React
* Vite
* CSS
* Lucide Icons

Backend

* Firebase Firestore
* Firebase Cloud Messaging
* Firebase Cloud Functions

Hosting

* GitHub Pages

⸻

📦 Firebase Structure

users

{
  "teamKey": "team-cassa",
  "firstName": "Pierpaolo",
  "lastName": "Molino",
  "username": "Pierpaolo",
  "role": "default",
  "accessRole": "maintainer"
}

events

{
  "teamKey": "team-cassa",
  "targetId": "userId",
  "targetName": "Andrea",
  "type": "curse",
  "points": 1,
  "description": "Did not read the analysis",
  "createdByName": "Pierpaolo",
  "createdAt": "timestamp"
}

⸻

🛠️ Local Development

Install dependencies:

npm install

Start development server:

npm run dev

Build project:

npm run build

Preview production build:

npm run preview

⸻

🚀 Deployment

Push changes to GitHub:

git add .
git commit -m "update"
git push origin main

GitHub Actions automatically deploys the application to GitHub Pages.

⸻

❤️ Charity Fund

Each curse symbolically contributes to the team’s charity fund.

At the end of the year, the collected amount can be donated through the PayPal link configured in the application.

⸻

⚠️ Disclaimer

This project was developed exclusively for entertainment and team-building purposes.
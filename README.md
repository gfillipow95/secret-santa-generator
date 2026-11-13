# 🎅 Secret Santa

A festive Secret Santa draw. Each person gets a private link where they unwrap their match. Partners never draw each other.

## Run it on your computer

You need Node.js 20 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000. Data is saved to `data/secret-santa.json`.

Run the tests with `npm test`.

## How it works

1. **Create an exchange.** Add a name, budget, date, and note, then everyone's names. Pair up couples so they can't draw each other.
2. **Share the links.** The organizer page lists one secret link per person. Send each person only their own link. "Copy all links as a message" copies every link at once, to paste and split up however you like.
3. **Shake the hat.** After the draw, each person taps a gift on their page to unwrap their match.

The organizer page shows who has opened their match. It never shows who drew whom, so the organizer can join in too. Anyone holding someone's link can see that person's match, so keep the links private.

Before the draw, you can edit people and couples, and everyone keeps their link. After the draw, only the details (name, budget, date, note) can change. To change who's in, reset the draw. Everyone will then unwrap a fresh match.

Bookmark the organizer link. It's the only way back to the organizer page. This browser also remembers the exchanges you created, on the home page.

## Put it online with Fly.io

Fly.io runs the app on a tiny machine with a 1 GB volume for the data. When nobody is using it, the machine stops and starts again on the next visit. In November 2026 the always-on price was about $2.19 a month for the machine plus $0.15 a month for the volume, so a stopped machine costs less. You need a credit card on the account.

1. Install the CLI and sign up:

   ```bash
   brew install flyctl
   fly auth signup
   ```

2. Pick a unique app name. It becomes `https://<name>.fly.dev`. Then create the app from the included config:

   ```bash
   fly launch --copy-config --no-deploy --name my-family-santa
   ```

3. Create the volume that holds the data, in the same region as the app (`iad` in `fly.toml`):

   ```bash
   fly volumes create santa_data --size 1 --region iad --yes
   ```

4. Deploy as a single machine. All the data lives on one volume, so the app runs one machine:

   ```bash
   fly deploy --ha=false
   ```

5. Open `https://my-family-santa.fly.dev`, create your exchange, and send the links.

To back up the data at any time:

```bash
fly ssh sftp get /data/secret-santa.json
```

After the holidays, delete the app to stop all charges. This also deletes the data:

```bash
fly apps destroy my-family-santa
```

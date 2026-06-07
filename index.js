require("dotenv").config();

const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const sharp = require("sharp");
const path = require("path");
const cron = require("node-cron");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

async function createWelcomeBanner(member) {
  const username = member.user.username.toUpperCase();

  const avatarUrl = member.user.displayAvatarURL({
    extension: "png",
    size: 512
  });

  const avatarBuffer = await fetch(avatarUrl)
    .then(res => res.arrayBuffer())
    .then(Buffer.from);

  const avatarSize = 270;

  const circleAvatar = await sharp(avatarBuffer)
    .resize(avatarSize, avatarSize)
    .composite([
      {
        input: Buffer.from(`
          <svg width="${avatarSize}" height="${avatarSize}">
            <circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" fill="white"/>
          </svg>
        `),
        blend: "dest-in"
      }
    ])
    .png()
    .toBuffer();

  const usernameSvg = Buffer.from(`
    <svg width="1536" height="512">
      <style>
        .username {
          fill: #7CFF3A;
          font-size: 46px;
          font-weight: 800;
          letter-spacing: 14px;
          font-family: Arial, Helvetica, sans-serif;
        }
      </style>
      <text x="768" y="75" text-anchor="middle" class="username">${username}</text>
    </svg>
  `);

  const finalImage = await sharp(path.join(__dirname, "assets", "template.png"))
    .resize(1536, 512)
    .composite([
      { input: usernameSvg, left: 0, top: 0 },
      { input: circleAvatar, left: 1150, top: 120 }
    ])
    .png()
    .toBuffer();

  return finalImage;
}


async function postPoll(channel, text) {
  await channel.send({
    poll: {
      question: { text },
      answers: [
        { text: "Bin dabei", emoji: "✅" },
        { text: "Nein", emoji: "❌" }
      ],
      duration: 16,
      allow_multiselect: false
    }
  });
}

async function postDailyPolls() {
  try {
    const channel = await client.channels.fetch(process.env.CW_CHANNEL_ID);

    if (!channel || !channel.isTextBased()) {
      console.error("CW-Channel nicht gefunden oder kein Text-Channel.");
      return;
    }

    await channel.send({
      content: "@everyone",
      allowedMentions: { parse: ["everyone"] }
    });

    await channel.send({
      content:
        `📌 **Heutige Fun CW-Abstimmungen** 📌\n` +
        `**Bitte stimmt in beiden Umfragen ab:**`
    });

    await postPoll(channel, "Fun CW 20:30 Uhr");
    await postPoll(channel, "Fun CW 22:30 Uhr");

    console.log("✅ CW-Polls gepostet.");
  } catch (err) {
    console.error("Fehler beim Posten der CW-Polls:", err);
  }
}


client.once("ready", () => {
  console.log(`✅ Eingeloggt als ${client.user.tag}`);

  cron.schedule(
    "0 8 * * *",
    () => postDailyPolls(),
    { timezone: "Europe/Berlin" }
  );
});

client.on("guildMemberAdd", async (member) => {
  try {

    const recruitRoleId = process.env.RECRUIT_ROLE_ID;

    if (recruitRoleId){
        await member.roles.add(recruitRoleId);
        console.log(`Recruit-Rolle an ${member.user.tag} vergeben`);
    }

    const channel = await client.channels.fetch(process.env.WELCOME_CHANNEL_ID);

    if (!channel) return;

    const banner = await createWelcomeBanner(member);

    const attachment = new AttachmentBuilder(banner, {
      name: "welcome.png"
    });

    await channel.send({
      content: `Willkommen ${member} 👋`,
      files: [attachment]
    });
  } catch (error) {
    console.error("Fehler beim Welcome-System:", error);
  }
});

client.login(process.env.DISCORD_TOKEN);
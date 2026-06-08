require("dotenv").config();
console.log(process.env.HC_MEMBER_ROLE_ID);

const {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require("discord.js");
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


async function createHcBanner(name) {
  const safeName = name.toUpperCase().slice(0, 24);

  const nameSvg = Buffer.from(`
    <svg width="1536" height="864">
      <text
        x="768"
        y="320"
        text-anchor="middle"
        font-family="Arial Black, Arial, sans-serif"
        font-size="125"
        font-weight="900"
        letter-spacing="5"
        fill="#f5f5f5"
        stroke="#76ff03"
        stroke-width="3">
        ${safeName}
      </text>
    </svg>
  `);

  return await sharp(path.join(__dirname, "assets", "hc-template.png"))
    .resize(1536, 864)
    .composite([
      {
        input: nameSvg,
        left: 0,
        top: 0
      }
    ])
    .png()
    .toBuffer();
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

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  console.log("guildMemberUpdate ausgelöst:", newMember.user.tag);

  console.log("HC_ROLE_ID aus ENV:", process.env.HC_MEMBER_ROLE_ID);
  console.log("Hatte Rolle vorher:", oldMember.roles.cache.has(process.env.HC_MEMBER_ROLE_ID));
  console.log("Hat Rolle jetzt:", newMember.roles.cache.has(process.env.HC_MEMBER_ROLE_ID));
  console.log("Alle Rollen jetzt:", newMember.roles.cache.map(r => `${r.name}: ${r.id}`));

  const hcRoleId = process.env.HC_MEMBER_ROLE_ID;

  const hadRole = oldMember.roles.cache.has(hcRoleId);
  const hasRole = newMember.roles.cache.has(hcRoleId);

  if (!hadRole && hasRole) {
    const channel = await client.channels.fetch(process.env.HC_BANNER_CHANNEL_ID);

    const button = new ButtonBuilder()
      .setCustomId(`create_hc_banner_${newMember.id}`)
      .setLabel("Banner erstellen")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({
      content: `🎉 ${newMember}, du bist jetzt **Member**! Klicke auf den Button und gib deinen gewünschten Banner-Namen ein.`,
      components: [row]
    });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (!interaction.customId.startsWith("create_hc_banner_")) return;

    const userId = interaction.customId.replace("create_hc_banner_", "");

    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: "Dieses Banner gehört nicht dir.",
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("hc_banner_modal")
      .setTitle("Banner erstellen");

    const nameInput = new TextInputBuilder()
      .setCustomId("banner_name")
      .setLabel("Welcher Name soll auf dein Banner?")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(24)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(nameInput);

    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId !== "hc_banner_modal") return;

    const bannerName = interaction.fields.getTextInputValue("banner_name");

    const banner = await createHcBanner(bannerName);

    const attachment = new AttachmentBuilder(banner, {
      name: "hc-banner.png"
    });

    await interaction.reply({
      content: `✅ Dein Banner wurde erstellt, ${interaction.user}!`,
      files: [attachment]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
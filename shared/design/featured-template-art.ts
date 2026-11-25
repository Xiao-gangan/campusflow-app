const sans = "'PingFang SC','Noto Sans SC','Microsoft YaHei',Arial,sans-serif";
const serif = "'Songti SC','STSong','Noto Serif SC','SimSun',Georgia,serif";
const roman = "Georgia,'Times New Roman',serif";
const wrap = "overflow-wrap:anywhere;word-wrap:break-word";

export const autumn = {
  paper: "#fff9f2", surround: "#ead7ca", ink: "#402721", deep: "#6f2424", accent: "#9a3532", metal: "#785c4a",
  line: "#b58c7a", name: "初面邀请", en: "FIRST INTERVIEW", number: "01",
  intro: "感谢你来认识我们。很高兴邀请你参加初面，聊聊你的兴趣与想做的事。",
  greeting: "期待与你见面",
  image: "/presets/invitation-autumn-envelope.webp",
  maxWidth: 760, ratio: "3 / 4", minimum: 510, top: "clamp(49px, 13.7cqw, 104px)",
};

export const pine = {
  paper: "#f8f8ee", surround: "#dce3d9", ink: "#283831", deep: "#203f35", accent: "#295a47", metal: "#715c3d",
  line: "#899a82", name: "二面深度交流", en: "SECOND INTERVIEW", number: "02",
  intro: "很高兴再次邀请你。带上一个你愿意分享的作品、项目或校园经历，让我们继续聊聊。",
  greeting: "期待更深入的交流",
  image: "/presets/invitation-pine-waxseal.webp",
  maxWidth: 680, ratio: "906 / 1610", minimum: 575, top: "clamp(63px, 19.9cqw, 135px)",
};

export const gold = {
  paper: "#fffaf0", surround: "#f2e6d2", ink: "#463422", deep: "#543614", accent: "#825317", metal: "#715738",
  line: "#ad8650",
};

type InterviewPalette = typeof autumn;

export function illustratedInvitation(theme: InterviewPalette) {
  return `
<div style="background:${theme.surround}">
  <article class="featured-invitation" style="width:100%;max-width:${theme.maxWidth}px;margin:0 auto;container-type:inline-size;background-image:url('${theme.image}');background-size:100% 100%;background-position:top center;background-repeat:no-repeat;color:${theme.ink};font-family:${sans}">
    <div class="featured-photo-page" style="box-sizing:border-box;width:100%;aspect-ratio:${theme.ratio};min-height:${theme.minimum}px;padding:${theme.top} 15.25% clamp(140px,40cqw,305px);">
      <header style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:clamp(9px,1.7cqw,13px);line-height:1.4;color:${theme.metal};${wrap}">
        <strong style="font-weight:600;letter-spacing:0.08em;color:${theme.ink}">{{organization_name}}</strong>
        <span style="white-space:nowrap;font-family:${roman};letter-spacing:0.1em">INVITATION / ${theme.number}</span>
      </header>
      <section style="text-align:center;margin:clamp(15px,4.2cqw,32px) 0 0">
        <p style="margin:0;color:${theme.accent};font-weight:600;font-size:clamp(9px,1.8cqw,14px);letter-spacing:0.26em">YOU'RE INVITED</p>
        <h1 style="margin:clamp(5px,1.5cqw,11px) 0 0;font-family:${serif};font-size:clamp(28px,8.5cqw,68px);font-weight:600;color:${theme.deep};line-height:1.13;text-wrap:balance">${theme.name}</h1>
        <p style="margin:clamp(5px,1.4cqw,10px) 0 0;color:${theme.metal};font-family:${roman};font-size:clamp(9px,1.7cqw,13px);letter-spacing:0.23em">${theme.en}</p>
        <div style="width:clamp(32px,10cqw,75px);height:1px;margin:clamp(8px,2.1cqw,16px) auto;background:${theme.line}"></div>
        <p style="max-width:27em;margin:0 auto;font-family:${serif};font-size:clamp(11px,2.35cqw,18px);line-height:1.58;color:${theme.ink};text-wrap:pretty">${theme.intro}</p>
      </section>
      <section class="featured-invitation-details" style="display:grid;grid-template-columns:minmax(0,0.88fr) minmax(0,1.12fr);align-items:start;margin-top:clamp(16px,5.1cqw,38px);">
        <div style="min-width:0;padding-right:clamp(7px,3cqw,23px);${wrap}">
          <p style="margin:0;font-family:${roman};font-size:clamp(10px,2cqw,15px);letter-spacing:0.16em;color:${theme.accent}">TO</p>
          <p style="margin:clamp(2px,1.2cqw,9px) 0 0;font-family:${serif};font-size:clamp(23px,8cqw,61px);line-height:1.13;font-weight:600;color:${theme.deep};text-wrap:balance">{{candidate_name}}</p>
          <p style="margin:clamp(6px,1.9cqw,14px) 0 0;color:${theme.metal};font-size:clamp(10px,2.1cqw,16px);line-height:1.35">${theme.greeting}</p>
        </div>
        <div style="min-width:0;padding-left:clamp(9px,3cqw,24px);border-left:1px solid ${theme.line};${wrap}">
          <p style="margin:0;color:${theme.accent};font-size:clamp(9px,1.7cqw,13px);font-weight:600;letter-spacing:0.16em">APPOINTMENT</p>
          <p style="margin:clamp(3px,1.1cqw,8px) 0 0;font-family:${roman},${serif};font-variant-numeric:tabular-nums;font-size:clamp(16px,4.6cqw,36px);line-height:1.15;color:${theme.deep}">{{interview_date}}</p>
          <p style="margin:clamp(1px,0.8cqw,6px) 0 0;font-family:${roman};font-variant-numeric:tabular-nums;font-size:clamp(12px,3.1cqw,22px);line-height:1.35;color:${theme.ink}">{{start_time}}–{{end_time}}</p>
          <p style="margin:clamp(4px,1.4cqw,10px) 0 0;font-size:clamp(10px,2.25cqw,16px);line-height:1.35;color:${theme.metal}">{{location}}</p>
        </div>
      </section>
    </div>
  </article>
</div>`;
}

export const offerInvitation = `
<div style="box-sizing:border-box;padding:clamp(16px,4vw,58px) clamp(10px,3vw,36px) clamp(3px,1vw,15px);background:radial-gradient(ellipse at 50% 0%,#fff7e1 0%,#f2e6d2 75%);font-family:${sans};color:${gold.ink}">
  <article class="featured-offer" style="box-sizing:border-box;max-width:714px;margin:0 auto;padding:clamp(34px,7vw,73px) clamp(18px,6vw,56px) clamp(28px,5vw,48px);border-radius:clamp(12px,2vw,22px);box-shadow:0 24px 60px #76542525,0 2px 8px #76542513;background-color:#fffaf0;background-image:radial-gradient(ellipse at 85% 12%,#f1d18a65,transparent 48%),radial-gradient(ellipse at 10% 82%,#e9ba5d25,transparent 55%),linear-gradient(165deg,#fffdf6,#fff4dc);text-align:center;${wrap}">
    <p style="margin:0;color:${gold.metal};font-size:clamp(11px,2.5vw,14px);font-weight:600;letter-spacing:0.14em">{{organization_name}}</p>
    <p style="margin:clamp(18px,4.5vw,38px) 0 0;color:${gold.accent};font-family:${roman};font-size:clamp(11px,2.6vw,15px);font-weight:600;letter-spacing:0.29em">WELCOME ABOARD</p>
    <h1 style="margin:9px 0 0;font-family:${serif};font-size:clamp(43px,9vw,82px);font-weight:600;line-height:1.1;color:${gold.deep};text-wrap:balance">恭喜加入</h1>
    <div style="width:64px;height:1px;margin:clamp(14px,3.4vw,25px) auto;background:${gold.line}"></div>
    <p style="margin:0;font-family:${serif};font-size:clamp(24px,6.2vw,46px);font-weight:600;line-height:1.25;color:${gold.deep};text-wrap:balance">{{candidate_name}} <small style="font-family:${sans};font-size:0.45em;color:${gold.metal}">同学</small></p>
    <p style="max-width:28em;margin:clamp(13px,3.6vw,24px) auto 0;color:${gold.ink};font-size:clamp(13px,3vw,16px);line-height:1.75;text-wrap:pretty">感谢你分享自己的想法与经历，很高兴与你一起开启新的校园故事。</p>
    <section style="box-sizing:border-box;display:inline-flex;flex-direction:column;align-items:center;gap:4px;margin:clamp(17px,4vw,28px) 0;padding:9px clamp(17px,6vw,37px);border-radius:12px;background:linear-gradient(125deg,#f8e7bd,#f0d7a5);color:${gold.deep};box-shadow:inset 0 1px 0 #fffaf0">
      <span style="font-family:${roman};font-size:10px;letter-spacing:0.15em;color:${gold.accent}">WELCOME TO</span>
      <strong style="font-family:${serif};font-size:clamp(17px,4.2vw,26px);line-height:1.35">{{department}}</strong>
    </section>
    <p style="margin:0;font-size:clamp(12px,2.7vw,14px);line-height:1.6;color:${gold.metal}">请在下方答复录取意向。期待见面。</p>
    <img src="/presets/invitation-forest-envelope.webp" alt="" style="display:block;width:clamp(88px,22vw,148px);max-width:100%;height:auto;margin:clamp(13px,4vw,28px) auto 0;border-radius:8px">
  </article>
</div>`;

function invitationButton(theme: { accent: string }, label: string, english: string) {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
    <td align="center" bgcolor="${theme.accent}" style="background-color:${theme.accent};border-radius:6px">
      <a href="{{rsvp_link}}" style="display:inline-block;padding:13px 23px;text-decoration:none;color:#fffaf1;font-family:${sans};font-size:15px;font-weight:700;line-height:21px">${label}<br>
        <span style="font-family:${roman};font-size:9px;font-weight:400;letter-spacing:1.5px">${english}</span>
      </a>
    </td></tr></table>`;
}

export function editorialMail(kind: "first" | "second" | "offer") {
  const offer = kind === "offer";
  const second = kind === "second";
  const theme = offer ? gold : second ? pine : autumn;
  const letterBand = offer ? `
    <tr><td align="center" style="padding:24px 18px 0;color:${theme.deep}">
      <p style="margin:0;color:${theme.accent};font-family:${roman};font-size:11px;letter-spacing:2px;line-height:1.5">WELCOME TO</p>
      <p style="margin:5px 0 0;font-family:${serif};font-size:26px;line-height:1.3;${wrap}">{{department}}</p>
    </td></tr>` : `
    <tr><td style="padding:23px 17px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;border-top:1px solid ${theme.line};border-bottom:1px solid ${theme.line};font-size:13px;line-height:19px">
        <tr>
          <td width="50%" valign="top" align="center" style="padding:11px 5px;border-right:1px solid ${theme.line};${wrap}">
            <span style="color:${theme.metal};font-size:10px;letter-spacing:1px">DATE &amp; TIME</span><br>
            <strong style="color:${theme.deep};font-weight:600">{{interview_date}}</strong><br><span>{{start_time}} – {{end_time}}</span>
          </td>
          <td width="50%" valign="top" align="center" style="padding:11px 5px;${wrap}">
            <span style="color:${theme.metal};font-size:10px;letter-spacing:1px">LOCATION</span><br>
            <strong style="color:${theme.deep};font-weight:600">{{location}}</strong>
          </td>
        </tr>
      </table>
    </td></tr>`;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.surround}" style="width:100%;background-color:${theme.surround}">
  <tr><td align="center" style="padding:18px 12px">
    <table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${theme.paper}" style="width:100%;max-width:590px;table-layout:fixed;background-color:${theme.paper};font-family:${sans};color:${theme.ink}">
      <tr><td height="4" bgcolor="${theme.accent}" style="height:4px;background-color:${theme.accent};line-height:0;font-size:0">&nbsp;</td></tr>
      <tr><td align="center" style="padding:28px 16px 0;text-align:center;${wrap}">
        <p style="margin:0;color:${theme.metal};font-size:12px;letter-spacing:1px;line-height:1.5">{{organization_name}}</p>
        <p style="margin:20px 0 0;color:${theme.accent};font-family:${roman};font-size:12px;font-weight:600;letter-spacing:3px">${offer ? "WELCOME ABOARD" : "YOU'RE INVITED"}</p>
        <h1 style="margin:8px 0 0;font-family:${serif};font-size:37px;line-height:1.22;letter-spacing:1px;color:${theme.deep}">${offer ? "恭喜加入" : second ? "二面复试邀请" : "初面邀请"}</h1>
        <div style="width:39px;height:1px;margin:16px auto 0;background-color:${theme.line};font-size:0;line-height:0">&nbsp;</div>
        <p style="margin:14px 0 0;font-family:${serif};font-size:22px;line-height:1.4;color:${theme.deep}">${offer ? "" : `<small style="font-family:${roman};font-size:10px;letter-spacing:2px;color:${theme.accent}">TO</small> `}{{candidate_name}} <small style="font-family:${sans};font-size:12px;color:${theme.metal}">同学</small></p>
      </td></tr>
      <tr><td align="center" style="padding:15px 20px 0;color:${theme.ink};font-size:14px;line-height:1.75;${wrap}">${offer
        ? "很高兴通知你，你已被 {{organization_name}} 录取。期待和你一起参与接下来的校园活动。"
        : second ? "诚邀你参加 {{department}} 二面。可以带来一件作品或一段经历，说说你负责的部分和你的取舍。"
        : "诚邀你参加 {{department}} 的初面。我们想听听你的兴趣，也让你认识这个团队。"}
      </td></tr>
      ${letterBand}
      <tr><td align="center" style="padding:23px 12px 0">${invitationButton(theme, offer ? "开启我的录取函 →" : "开启我的邀请函 →", offer ? "OPEN MY OFFER" : "OPEN MY INVITATION")}</td></tr>
      <tr><td align="center" style="padding:19px 15px 27px;color:${theme.metal};font-size:11px;line-height:1.65;${wrap}">{{organization_name}} · 招新组</td></tr>
    </table>
  </td></tr>
</table>`;
}

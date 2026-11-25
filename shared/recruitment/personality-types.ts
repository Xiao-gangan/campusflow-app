import type { PersonalityPole } from "./personality-questions.ts";

export type DepartmentAffinity = "LOW" | "MEDIUM" | "HIGH";

export type PersonalityTypeProfile = {
  type: string;
  title: string;
  tagline: string;
  keywords: readonly string[];
  teamStyle: string;
  strengths: readonly string[];
  possibleBlindSpots: readonly string[];
  campusScene: string;
  departmentAffinity: Readonly<Record<"宣传部" | "外联部" | "组织部", DepartmentAffinity>>;
  characterAsset: string | null;
  illustrationKey: string;
};

export const PERSONALITY_TYPE_PROFILES: Readonly<Record<string, PersonalityTypeProfile>> = {
  ENFP: { type: "ENFP", title: "气氛发动机", tagline: "让大家更快熟起来，把点子变成现场的热度。", keywords: ["热情", "联结", "创意"], teamStyle: "喜欢和伙伴一起碰撞想法，也愿意把大家带入状态。", strengths: ["善于破冰和调动现场", "能从细节里发现新点子", "愿意为团队补位"], possibleBlindSpots: ["点子很多时要记得收束", "连续高强度社交后需要留出充电时间"], campusScene: "迎新现场里，你可能一边拿着麦克风，一边把刚认识的同学介绍给彼此。", departmentAffinity: { 宣传部: "HIGH", 外联部: "MEDIUM", 组织部: "MEDIUM" }, characterAsset: null, illustrationKey: "enfp" },
  ENTP: { type: "ENTP", title: "脑洞策划师", tagline: "不怕重新提问，总能把熟悉的活动打开新入口。", keywords: ["灵活", "探索", "点子"], teamStyle: "享受快速讨论和方案迭代，喜欢给普通流程加一点巧思。", strengths: ["擅长提出替代方案", "面对变化反应快", "能把不同人的想法串起来"], possibleBlindSpots: ["推进前先确认共同目标", "新想法落地时要留意细节"], campusScene: "当大家还在讨论主题时，你已经画出了三个不同的活动版本。", departmentAffinity: { 宣传部: "HIGH", 外联部: "MEDIUM", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "entp" },
  ENFJ: { type: "ENFJ", title: "人群连接器", tagline: "看见每个人的参与感，让合作自然发生。", keywords: ["共情", "组织", "带动"], teamStyle: "会主动关注队友的状态，也愿意把模糊的共识变成下一步行动。", strengths: ["善于协调和鼓励", "能照顾团队氛围", "愿意承担沟通责任"], possibleBlindSpots: ["不要把所有人的情绪都揽到自己身上", "重要节点也要给自己留出缓冲"], campusScene: "分组活动开始前，你已经确认每个人都知道去哪儿、和谁一起行动。", departmentAffinity: { 宣传部: "MEDIUM", 外联部: "HIGH", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "enfj" },
  ENTJ: { type: "ENTJ", title: "活动总控官", tagline: "把目标、资源和节点排在一起，让大场面稳稳落地。", keywords: ["目标", "统筹", "推进"], teamStyle: "习惯先搭框架再分工，遇到卡点会主动推动决策。", strengths: ["目标感和推进力强", "善于拆解复杂任务", "敢于在关键时刻取舍"], possibleBlindSpots: ["推进时给伙伴留出表达空间", "效率之外也留意现场感受"], campusScene: "活动倒计时进入最后一小时，你正在用一张清单让每个岗位知道下一步。", departmentAffinity: { 宣传部: "MEDIUM", 外联部: "HIGH", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "entj" },

  INFP: { type: "INFP", title: "故事收藏家", tagline: "把真实的感受留下来，让一次活动有可以回味的温度。", keywords: ["真诚", "想象", "细腻"], teamStyle: "重视意义和真实表达，喜欢用自己的方式打磨有温度的内容。", strengths: ["善于捕捉情绪和故事", "表达有个人风格", "愿意认真听见别人"], possibleBlindSpots: ["把灵感尽早和团队同步", "面对取舍时给自己一个明确节点"], campusScene: "活动结束后，你还在记录某位新同学的一句话，准备把它变成下一次推文的开头。", departmentAffinity: { 宣传部: "HIGH", 外联部: "MEDIUM", 组织部: "LOW" }, characterAsset: null, illustrationKey: "infp" },
  INFJ: { type: "INFJ", title: "幕后策划师", tagline: "先想清楚大家为什么出发，再把体验安静地铺好。", keywords: ["洞察", "规划", "陪伴"], teamStyle: "喜欢提前理解目标和参与者感受，再设计一条完整的体验路径。", strengths: ["能看到长期方向", "擅长安静地做深度准备", "对参与者体验敏感"], possibleBlindSpots: ["不要独自承担全部准备", "适时让不完美的第一版先被看见"], campusScene: "大家看到的是顺畅的活动流程，而你知道每个转场背后都提前想过参与者会怎样感受。", departmentAffinity: { 宣传部: "HIGH", 外联部: "LOW", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "infj" },
  INTP: { type: "INTP", title: "方案研究员", tagline: "把问题拆开研究，找到更聪明、更轻量的做法。", keywords: ["分析", "好奇", "独立"], teamStyle: "喜欢先弄清原理和限制，再提出简洁有效的解决方案。", strengths: ["擅长分析复杂问题", "能发现流程中的漏洞", "学习新工具快"], possibleBlindSpots: ["研究到一定程度就开始试做", "用更易懂的方式分享思考"], campusScene: "报名表、签到和物资之间出现了一个小问题，你正在找出最省力的流程。", departmentAffinity: { 宣传部: "MEDIUM", 外联部: "LOW", 组织部: "MEDIUM" }, characterAsset: null, illustrationKey: "intp" },
  INTJ: { type: "INTJ", title: "路线规划师", tagline: "从目标倒推路径，把一次活动变成可复用的经验。", keywords: ["远见", "结构", "专注"], teamStyle: "倾向于先建立系统和优先级，再把精力放在最关键的环节。", strengths: ["擅长长期规划", "能建立清晰结构", "独立完成深度工作"], possibleBlindSpots: ["计划分享得越早越容易协作", "给临场变化留一点余地"], campusScene: "别人只看到一场活动，你已经在想下一次如何复用素材、流程和经验。", departmentAffinity: { 宣传部: "MEDIUM", 外联部: "MEDIUM", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "intj" },

  ESFP: { type: "ESFP", title: "现场气氛组", tagline: "先让现场亮起来，再让每个人找到自己的参与方式。", keywords: ["活力", "亲和", "现场"], teamStyle: "在真实互动里反应很快，喜欢用轻松的方式让大家加入进来。", strengths: ["善于活跃气氛", "临场表达自然", "能及时感知现场变化"], possibleBlindSpots: ["热闹之外也记得核对收尾", "把临场经验沉淀成记录"], campusScene: "音乐还没响，你已经让排队的新同学聊起了天，现场不再像一条安静的队伍。", departmentAffinity: { 宣传部: "HIGH", 外联部: "HIGH", 组织部: "MEDIUM" }, characterAsset: null, illustrationKey: "esfp" },
  ESTP: { type: "ESTP", title: "救场行动派", tagline: "变化来了就接住，先把现场最要紧的事情解决好。", keywords: ["果断", "行动", "应变"], teamStyle: "喜欢直接进入现场，在可见的问题里快速找到可行动作。", strengths: ["行动速度快", "临场应变强", "敢于承担现场任务"], possibleBlindSpots: ["重大决定前留半分钟确认信息", "把经验交接给下一位伙伴"], campusScene: "签到台突然缺了一盒彩笔，你已经找到替代物料，并顺手调整了队伍动线。", departmentAffinity: { 宣传部: "MEDIUM", 外联部: "HIGH", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "estp" },
  ESFJ: { type: "ESFJ", title: "大家的联络员", tagline: "把提醒、问候和细节都照顾到，让伙伴知道自己不是一个人。", keywords: ["可靠", "热心", "协作"], teamStyle: "重视明确沟通和彼此照应，习惯让信息及时抵达每个人。", strengths: ["联络细致", "照顾参与者体验", "能维持稳定的合作节奏"], possibleBlindSpots: ["不必为了周全而承担过多", "给自己保留不被打扰的时间"], campusScene: "活动前一天，你已经逐一确认集合信息，也提醒新成员带上需要的东西。", departmentAffinity: { 宣传部: "MEDIUM", 外联部: "HIGH", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "esfj" },
  ESTJ: { type: "ESTJ", title: "流程推进官", tagline: "让约定变成行动，让每个环节都有人接、有人跟。", keywords: ["清晰", "责任", "执行"], teamStyle: "偏好明确分工和时间节点，会持续跟进直到任务真正收尾。", strengths: ["执行和跟进稳定", "擅长建立秩序", "面对任务敢于负责"], possibleBlindSpots: ["推进时听听不同做法", "给伙伴留出调整方法的空间"], campusScene: "活动开场前，你按清单完成最后一轮检查，并让每个岗位知道出现变化时找谁。", departmentAffinity: { 宣传部: "LOW", 外联部: "MEDIUM", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "estj" },

  ISFP: { type: "ISFP", title: "视觉感知者", tagline: "留意光线、色彩和人的表情，把现场变成值得记住的画面。", keywords: ["审美", "感受", "真实"], teamStyle: "喜欢在具体创作和真实观察中工作，用细节传达团队气质。", strengths: ["对画面和氛围敏感", "表达自然不生硬", "能安静完成精细创作"], possibleBlindSpots: ["创作前先确认交付节点", "及时说明自己的进度和需要"], campusScene: "你注意到海报上的一处留白，也注意到某位同学笑起来的瞬间，并把它们保存下来。", departmentAffinity: { 宣传部: "HIGH", 外联部: "MEDIUM", 组织部: "LOW" }, characterAsset: null, illustrationKey: "isfp" },
  ISTP: { type: "ISTP", title: "现场修理师", tagline: "遇到具体问题就动手，把复杂情况还原成几个能处理的小步骤。", keywords: ["实用", "冷静", "动手"], teamStyle: "偏好直接观察、快速试验和用最简单的工具解决问题。", strengths: ["处理突发故障冷静", "善于找到实用办法", "学习操作型任务快"], possibleBlindSpots: ["把解决方案说给队友听", "不要只顾修好眼前而忘记记录"], campusScene: "投影线缆突然没有信号，你没有慌张，先排查连接，再让活动继续。", departmentAffinity: { 宣传部: "LOW", 外联部: "MEDIUM", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "istp" },
  ISFJ: { type: "ISFJ", title: "安心后勤官", tagline: "把容易被忽略的准备做好，让每个人都能安心参与。", keywords: ["细致", "照料", "可靠"], teamStyle: "愿意默默把物料、提醒和收尾安排妥当，重视稳定而踏实的配合。", strengths: ["细节检查扎实", "对他人需求敏感", "持续执行可靠"], possibleBlindSpots: ["不舒服时及时说出来", "让更多人分担重复性工作"], campusScene: "大家开始入场时，你已经准备好备用文具、饮水和一份清楚的现场指引。", departmentAffinity: { 宣传部: "LOW", 外联部: "MEDIUM", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "isfj" },
  ISTJ: { type: "ISTJ", title: "秩序守门员", tagline: "尊重约定、核对细节，让团队在可靠的节奏里向前走。", keywords: ["稳妥", "规范", "坚持"], teamStyle: "喜欢规则清楚、责任明确的协作方式，会认真守住质量和时间。", strengths: ["计划和检查有条理", "对承诺负责", "能稳定维护流程"], possibleBlindSpots: ["变化出现时先看目标是否改变", "给新方法一次小范围试用机会"], campusScene: "活动结束后，你把物资按清单归位，也留下了一份下次可以直接参考的记录。", departmentAffinity: { 宣传部: "LOW", 外联部: "MEDIUM", 组织部: "HIGH" }, characterAsset: null, illustrationKey: "istj" },
};

export function getPersonalityTypeProfile(type: string): PersonalityTypeProfile | null {
  return PERSONALITY_TYPE_PROFILES[type] ?? null;
}

export function isPersonalityType(value: string): value is keyof typeof PERSONALITY_TYPE_PROFILES {
  return value in PERSONALITY_TYPE_PROFILES;
}

export const PERSONALITY_TYPE_POLES: Readonly<Record<PersonalityPole, PersonalityPole>> = {
  E: "I", I: "E", S: "N", N: "S", T: "F", F: "T", J: "P", P: "J",
};

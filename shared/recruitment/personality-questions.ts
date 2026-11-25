export type PersonalityDimension = "EI" | "SN" | "TF" | "JP";
export type PersonalityPole = "E" | "I" | "S" | "N" | "T" | "F" | "J" | "P";
export type PersonalityAnswerValue = -2 | -1 | 0 | 1 | 2;

export type PersonalityQuestion = {
  id: string;
  dimension: PersonalityDimension;
  direction: 1 | -1;
  text: string;
  consistencyGroup?: string;
};

export const PERSONALITY_SCALE: ReadonlyArray<{ value: PersonalityAnswerValue; label: string }> = [
  { value: -2, label: "非常不同意" },
  { value: -1, label: "比较不同意" },
  { value: 0, label: "一般" },
  { value: 1, label: "比较同意" },
  { value: 2, label: "非常同意" },
];

/**
 * Original, non-diagnostic campus and collaboration prompts. A positive
 * direction scores toward the first pole in the dimension; a negative
 * direction is a reverse-keyed prompt.
 */
export const PERSONALITY_QUESTIONS: readonly PersonalityQuestion[] = [
  { id: "q01", dimension: "EI", direction: 1, text: "在新活动开始前，我通常会主动和身边不熟的人聊几句。", consistencyGroup: "ei-initiate" },
  { id: "q02", dimension: "EI", direction: -1, text: "连续参加几场活动后，我更想独自安静一会儿再恢复精力。" },
  { id: "q03", dimension: "EI", direction: 1, text: "讨论陷入冷场时，我往往愿意先抛出一个轻松的话题。" },
  { id: "q04", dimension: "EI", direction: -1, text: "比起在众人面前分享，我更习惯把想法先整理成文字。" },
  { id: "q05", dimension: "EI", direction: 1, text: "到了一个新教室或新场地，我常会很快和邻座打招呼。", consistencyGroup: "ei-open" },
  { id: "q06", dimension: "EI", direction: -1, text: "周末的安排如果没有独处时间，我会觉得少了点什么。", consistencyGroup: "ei-recharge" },
  { id: "q07", dimension: "EI", direction: 1, text: "筹备活动时，我喜欢边做边和不同岗位的人交换进度。" },
  { id: "q08", dimension: "EI", direction: -1, text: "我通常等别人先发消息，熟悉后才会主动联系。" },
  { id: "q09", dimension: "EI", direction: 1, text: "临时多来一位同学，我会自然地把他介绍进正在进行的聊天。" },
  { id: "q10", dimension: "EI", direction: -1, text: "参加大型集体活动前，我会先想好自己需要的休息节奏。" },
  { id: "q11", dimension: "EI", direction: 1, text: "分享一个刚想到的点子时，我不太介意它还没有完全打磨好。" },
  { id: "q12", dimension: "EI", direction: -1, text: "遇到有趣的见闻，我通常先留在心里消化，不急着告诉别人。" },
  { id: "q13", dimension: "EI", direction: 1, text: "如果社团需要主持开场，我愿意试着把现场带起来。" },
  { id: "q14", dimension: "EI", direction: -1, text: "忙完一场活动后，我最舒服的庆祝方式是安静地和一两个人待着。", consistencyGroup: "ei-recharge" },
  { id: "q15", dimension: "EI", direction: 1, text: "我会因为认识了新伙伴而对一场活动记忆更深。" },
  { id: "q16", dimension: "EI", direction: -1, text: "多人讨论时，我常常需要一点时间，才会把自己的观点说出来。" },
  { id: "q17", dimension: "EI", direction: 1, text: "临场需要找人帮忙时，我通常能较快开口求助。" },
  { id: "q18", dimension: "EI", direction: -1, text: "一个人完成海报、表格或整理工作时，我也能保持投入。" },
  { id: "q19", dimension: "EI", direction: 1, text: "在校园里偶遇熟人，我会自然地停下来聊几句。", consistencyGroup: "ei-open" },
  { id: "q20", dimension: "EI", direction: -1, text: "如果当天连续有社交安排，我会提前为自己留出缓冲时间。" },
  { id: "q21", dimension: "EI", direction: 1, text: "团队刚组建时，我常愿意先提议一个大家认识彼此的小环节。", consistencyGroup: "ei-initiate" },
  { id: "q22", dimension: "EI", direction: -1, text: "我更喜欢少数几位熟悉队友的稳定配合，而不是频繁认识新人。" },

  { id: "q23", dimension: "SN", direction: 1, text: "说明活动流程时，我更容易先关注时间、地点和负责人的具体信息。" },
  { id: "q24", dimension: "SN", direction: -1, text: "面对一个新任务，我会先设想它可能带来的各种新方向。" },
  { id: "q25", dimension: "SN", direction: 1, text: "做物资清单时，我喜欢把数量、规格和摆放位置写清楚。", consistencyGroup: "sn-detail" },
  { id: "q26", dimension: "SN", direction: -1, text: "听到一个概念时，我常先联想到它能不能发展成更大的创意。" },
  { id: "q27", dimension: "SN", direction: 1, text: "复盘活动时，我会优先核对哪些环节按计划完成。" },
  { id: "q28", dimension: "SN", direction: -1, text: "我对一个方案的兴趣，常来自它背后的可能性，而不只是眼前的步骤。" },
  { id: "q29", dimension: "SN", direction: 1, text: "接手海报或文案任务时，我会先确认尺寸、截止时间和提交格式。" },
  { id: "q30", dimension: "SN", direction: -1, text: "看到校园里的小变化时，我容易联想到未来可以怎样利用它。" },
  { id: "q31", dimension: "SN", direction: 1, text: "学习新软件时，我愿意照着明确教程一步步练习。" },
  { id: "q32", dimension: "SN", direction: -1, text: "集体讨论中，一个大胆的假设常常比现成做法更能吸引我。", consistencyGroup: "sn-possibility" },
  { id: "q33", dimension: "SN", direction: 1, text: "安排签到时，我会留意名单、顺序和现场的具体缺口。" },
  { id: "q34", dimension: "SN", direction: -1, text: "别人讲一个经历时，我常会想到它还能说明哪些更广的规律。" },
  { id: "q35", dimension: "SN", direction: 1, text: "拍摄活动照片时，我会注意现场发生的真实细节。" },
  { id: "q36", dimension: "SN", direction: -1, text: "我喜欢把不同事情之间隐藏的联系串起来。" },
  { id: "q37", dimension: "SN", direction: 1, text: "遇到问题时，我会先找出已经发生了什么，再决定怎么处理。" },
  { id: "q38", dimension: "SN", direction: -1, text: "做计划时，我会忍不住想象几种尚未发生的结果。" },
  { id: "q39", dimension: "SN", direction: 1, text: "比起抽象地讨论，我更喜欢先看一个可以照着做的例子。" },
  { id: "q40", dimension: "SN", direction: -1, text: "我更容易记住一段话的整体意思，而不是逐个记住原句。" },
  { id: "q41", dimension: "SN", direction: 1, text: "确认现场布置时，我会逐项检查桌椅、物料和指引是否到位。", consistencyGroup: "sn-detail" },
  { id: "q42", dimension: "SN", direction: -1, text: "如果一个活动还有改造空间，我很快会开始构想不同版本。", consistencyGroup: "sn-possibility" },
  { id: "q43", dimension: "SN", direction: 1, text: "我判断一项安排是否可行时，会先看现有的人力和时间。" },
  { id: "q44", dimension: "SN", direction: -1, text: "我常从一个小线索出发，推测它之后可能形成的变化。" },

  { id: "q45", dimension: "TF", direction: 1, text: "讨论活动方案时，我会先比较每个选择的利弊和执行成本。" },
  { id: "q46", dimension: "TF", direction: -1, text: "如果一个安排让队友感到不舒服，我会优先考虑怎样照顾他的感受。" },
  { id: "q47", dimension: "TF", direction: 1, text: "分配任务时，我更在意规则是否清晰、工作量是否均衡。" },
  { id: "q48", dimension: "TF", direction: -1, text: "即使一个点子不够成熟，我也会先鼓励提出它的人。", consistencyGroup: "tf-encourage" },
  { id: "q49", dimension: "TF", direction: 1, text: "复盘出现问题时，我倾向于直接指出关键原因，方便下次改进。" },
  { id: "q50", dimension: "TF", direction: -1, text: "做决定前，我会留意这个决定对团队气氛的影响。" },
  { id: "q51", dimension: "TF", direction: 1, text: "遇到意见分歧，我会把争议拆成可以逐项判断的事实。", consistencyGroup: "tf-standards" },
  { id: "q52", dimension: "TF", direction: -1, text: "队友临时出错时，我会先让他知道我理解他的处境。", consistencyGroup: "tf-empathy" },
  { id: "q53", dimension: "TF", direction: 1, text: "选择活动物料时，我会以耐用、好用和预算合适为主要标准。" },
  { id: "q54", dimension: "TF", direction: -1, text: "给新成员反馈时，我会先说出他已经做得好的地方。", consistencyGroup: "tf-encourage" },
  { id: "q55", dimension: "TF", direction: 1, text: "如果两种方案效果相近，我会用更省时的一种作决定。" },
  { id: "q56", dimension: "TF", direction: -1, text: "在一场活动里，让参与者感到被尊重对我来说和效率同样重要。" },
  { id: "q57", dimension: "TF", direction: 1, text: "评价一份方案时，我会把个人偏好和客观标准分开。", consistencyGroup: "tf-standards" },
  { id: "q58", dimension: "TF", direction: -1, text: "我会为了保留大家的参与感，花时间协调不同人的意见。" },
  { id: "q59", dimension: "TF", direction: 1, text: "面对临时变化，我会先确认事实，再做下一步判断。" },
  { id: "q60", dimension: "TF", direction: -1, text: "我通常先问问当事人怎么想，再给出自己的建议。", consistencyGroup: "tf-empathy" },
  { id: "q61", dimension: "TF", direction: 1, text: "团队需要取舍时，我愿意作出可能不讨喜但更有效率的选择。" },
  { id: "q62", dimension: "TF", direction: -1, text: "只要能让合作更顺畅，我愿意在细节上多做一些体谅。" },
  { id: "q63", dimension: "TF", direction: 1, text: "我喜欢用清楚的标准来判断一项工作是否完成。" },
  { id: "q64", dimension: "TF", direction: -1, text: "我很在意一句提醒说出口后，别人会怎样感受。" },
  { id: "q65", dimension: "TF", direction: 1, text: "发生冲突时，我会把注意力拉回共同目标和可执行方案。" },
  { id: "q66", dimension: "TF", direction: -1, text: "我认为活动留下的温暖记忆，有时比流程是否完美更重要。" },

  { id: "q67", dimension: "JP", direction: 1, text: "活动前几天，我会把需要完成的事项列成清单。", consistencyGroup: "jp-plan" },
  { id: "q68", dimension: "JP", direction: -1, text: "只要最后能按时完成，我喜欢让安排保留一些临场变化空间。" },
  { id: "q69", dimension: "JP", direction: 1, text: "我会提前确认集合时间和分工，减少当天的来回沟通。" },
  { id: "q70", dimension: "JP", direction: -1, text: "遇到临时改动时，我通常能顺势调整原来的做法。", consistencyGroup: "jp-flex" },
  { id: "q71", dimension: "JP", direction: 1, text: "对于一个有截止时间的任务，我倾向于尽早做出第一版。" },
  { id: "q72", dimension: "JP", direction: -1, text: "我不介意到了现场再根据气氛决定活动的小细节。" },
  { id: "q73", dimension: "JP", direction: 1, text: "整理资料时，我喜欢用统一的文件名和文件夹分类。", consistencyGroup: "jp-organize" },
  { id: "q74", dimension: "JP", direction: -1, text: "我常在多个点子之间来回尝试，最后才确定采用哪一个。" },
  { id: "q75", dimension: "JP", direction: 1, text: "负责签到或物资时，我会在开始前再次核对数量。" },
  { id: "q76", dimension: "JP", direction: -1, text: "临时收到新消息时，我愿意先放下原计划看看有没有更好的机会。", consistencyGroup: "jp-spontaneous" },
  { id: "q77", dimension: "JP", direction: 1, text: "我喜欢知道一项任务什么时候算真正结束。" },
  { id: "q78", dimension: "JP", direction: -1, text: "比起照着固定流程，我更享受边走边发现新的处理方式。" },
  { id: "q79", dimension: "JP", direction: 1, text: "我会把重要提醒写进日历或手机待办，避免凭记忆。", consistencyGroup: "jp-plan" },
  { id: "q80", dimension: "JP", direction: -1, text: "如果没有硬性要求，我有时会把决定留到更接近现场时。" },
  { id: "q81", dimension: "JP", direction: 1, text: "当团队目标确定后，我会推动大家按约定节点往前走。" },
  { id: "q82", dimension: "JP", direction: -1, text: "计划临时被打乱时，我通常能把它当成新的尝试。", consistencyGroup: "jp-flex" },
  { id: "q83", dimension: "JP", direction: 1, text: "我在活动当天会预留检查和收尾的时间。" },
  { id: "q84", dimension: "JP", direction: -1, text: "我喜欢在最后一刻根据最新情况调整表达或布置。" },
  { id: "q85", dimension: "JP", direction: 1, text: "开始一个大任务前，我会先拆出几个可以完成的小步骤。" },
  { id: "q86", dimension: "JP", direction: -1, text: "如果一个方案还有想象空间，我不急着马上把它定死。" },
  { id: "q87", dimension: "JP", direction: 1, text: "我会在提交前留出时间检查格式、遗漏和细节。", consistencyGroup: "jp-organize" },
  { id: "q88", dimension: "JP", direction: -1, text: "即使已有计划，我也愿意临时加入一个值得参与的校园活动。", consistencyGroup: "jp-spontaneous" },
];

export const PERSONALITY_QUESTION_COUNT = PERSONALITY_QUESTIONS.length;

export function questionById(questionId: string): PersonalityQuestion | undefined {
  return PERSONALITY_QUESTIONS.find((question) => question.id === questionId);
}

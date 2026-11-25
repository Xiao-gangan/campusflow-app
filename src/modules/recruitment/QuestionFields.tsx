import { useId } from "react";
import type { FormAnswer, FormAnswers, FormQuestion, MbtiResult } from "@/shared/contracts/interview-rounds";
import { PERSONALITY_TYPE_PROFILES } from "@/shared/recruitment/personality-types";
import { Input } from "@/components/ui/input";

export const fieldClass = "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
export const QUESTION_LABELS: Record<FormQuestion["type"], string> = {
  text: "单行文本", textarea: "多行文本", single_choice: "单选", multi_choice: "多选",
  select: "下拉选择", url: "网址", rating: "1–5 评分",
};

export function QuestionField({ question, index, value, onChange }: {
  question: FormQuestion; index: number; value: FormAnswer | undefined; onChange: (value: FormAnswer) => void;
}) {
  const id = useId();
  const title = <>{index + 1}. {question.title || "未命名问题"}{question.required && <span className="ml-1 text-rose-700" aria-label="必填">*</span>}</>;
  const hint = question.description && <p className="text-xs opacity-75" id={id + "-hint"}>{question.description}</p>;
  const text = typeof value === "string" ? value : "";
  const input = {
    id, value: text, placeholder: question.placeholder, required: question.required,
    "aria-describedby": question.description ? id + "-hint" : undefined,
  };
  if (["single_choice", "multi_choice", "rating"].includes(question.type)) {
    const multiple = question.type === "multi_choice";
    const rating = question.type === "rating";
    const checkedOptions = Array.isArray(value) ? value : [];
    const options = rating ? [1, 2, 3, 4, 5] : question.options;
    return <fieldset className="min-w-0 space-y-2">
      <legend className="py-1 text-sm font-medium [overflow-wrap:anywhere]">{title}</legend>
      {hint}
      <div className={rating ? "flex flex-wrap gap-2" : "grid gap-1.5"}>
        {options.map((option) => <label key={option} className="flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-current/15 px-2.5 text-sm [overflow-wrap:anywhere]">
          <input type={multiple ? "checkbox" : "radio"} name={id} className="size-4 shrink-0 accent-[#1d5343]"
            required={!multiple && question.required} checked={multiple ? checkedOptions.includes(String(option)) : value === option}
            onChange={() => onChange(multiple
              ? checkedOptions.includes(String(option)) ? checkedOptions.filter((item) => item !== option) : [...checkedOptions, String(option)]
              : option)} />
          {option}
        </label>)}
      </div>
    </fieldset>;
  }
  return <div className="min-w-0 space-y-2">
    <label htmlFor={id} className="block text-sm font-medium [overflow-wrap:anywhere]">{title}</label>
    {hint}
    {question.type === "textarea" ? <textarea {...input} className={fieldClass + " min-h-24 resize-y"} maxLength={8000} onChange={(e) => onChange(e.target.value)} />
      : question.type === "select" ? <select {...input} className={fieldClass} onChange={(e) => onChange(e.target.value)}>
        <option value="">{question.placeholder || "请选择"}</option>
        {question.options.map((option) => <option key={option}>{option}</option>)}
      </select>
      : <Input {...input} type={question.type === "url" ? "url" : "text"} maxLength={1000} onChange={(e) => onChange(e.target.value)} />}
  </div>;
}

export function PersonalityCard({ result }: { result: MbtiResult }) {
  const profile = PERSONALITY_TYPE_PROFILES[result.type];
  return <div className="space-y-4 rounded-xl border border-emerald-900/15 bg-[#f0f7f2] p-4 text-[#16362b]">
    <div>
      <p className="text-xs font-medium tracking-wide text-emerald-900/80">校园协作性格画像</p>
      <h3 className="mt-1 text-xl font-semibold">{result.type} · {profile?.title}</h3>
      <p className="mt-1 text-sm leading-6">{profile?.teamStyle}</p>
    </div>
    <div className="grid gap-2.5">
      {result.dimensions.map(({ dimension, firstPercent, close }) => <div key={dimension}>
        <div className="flex justify-between gap-2 text-xs">
          <span>{dimension[0]} {firstPercent}%</span>
          {close && <span className="opacity-65">两侧接近</span>}
          <span>{100 - firstPercent}% {dimension[1]}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-emerald-900/15" aria-hidden="true">
          <div className="h-full rounded-full bg-[#396e58]" style={{ width: firstPercent + "%" }} />
        </div>
      </div>)}
    </div>
    <ul className="flex flex-wrap gap-1.5">{profile?.strengths.map((label) => <li key={label} className="rounded-full bg-white px-2.5 py-1 text-xs">{label}</li>)}</ul>
    <p className="text-xs leading-5 opacity-75">已答 {result.answeredCount} 题 · 答题一致性{result.stability === null ? "暂无可比较题组" : " " + result.stability + "%"}。仅供校园协作破冰参考，不用于诊断或决定录取。</p>
  </div>;
}

export function QuestionAnswers({ questions, answers }: { questions: FormQuestion[]; answers: FormAnswers }) {
  return <dl className="space-y-2">
    {questions.map(({ id, title }) => {
      const answer = answers[id];
      return <div key={id} className="rounded-lg bg-muted/45 p-2 [overflow-wrap:anywhere]">
        <dt className="font-medium">{title}</dt>
        <dd className="whitespace-pre-wrap">{Array.isArray(answer) ? answer.join("、") : answer ?? "未填写"}</dd>
      </div>;
    })}
  </dl>;
}

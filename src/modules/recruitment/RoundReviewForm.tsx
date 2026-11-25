import { useId, useState } from "react";
import { Star } from "lucide-react";
import { REVIEW_DECISIONS, type ReviewDecision, type RoundReview } from "@/shared/contracts/interview-rounds";
import { REVIEW_LABELS } from "@/shared/recruitment/round-presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { demoApi } from "./local-demo-client";
import { fieldClass } from "./QuestionFields";
import { dateTime } from "./recruitment-labels";

export function RoundReviewForm({ candidateId, roundId, review, onReviewed }: {
  candidateId: string;
  roundId: string;
  review: RoundReview | null;
  onReviewed: (review: RoundReview) => void;
}) {
  const group = useId();
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [decision, setDecision] = useState<ReviewDecision>(review?.decision ?? "hold");
  const [notes, setNotes] = useState(review?.notes ?? "");
  const [reviewerName, setReviewer] = useState(review?.reviewerName ?? "");
  const [saved, setSaved] = useState(review);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return <details className="min-w-0 rounded-lg border border-border/60 bg-muted/25 p-2.5">
    <summary className="cursor-pointer text-sm font-medium">
      面试官评价{saved ? ` · ${REVIEW_LABELS[saved.decision]} ${saved.rating}/5` : ""}
    </summary>
    <form className="mt-3 min-w-0 space-y-2.5" onSubmit={async (event) => {
      event.preventDefault();
      if (busy || !rating) return;
      setBusy(true);
      setStatus("");
      setError("");
      try {
        const updated = await demoApi.saveReview(candidateId, roundId, { rating, decision, notes, reviewerName });
        setSaved(updated);
        setStatus("面评已保存。");
        onReviewed(updated);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "面评保存失败。");
      } finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="min-w-0 space-y-2.5">
        <fieldset className="min-w-0">
          <legend className="text-xs text-muted-foreground">评分</legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => <label key={value}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-border/70 text-amber-800 focus-within:ring-2 focus-within:ring-ring">
              <input type="radio" name={group} className="sr-only" aria-label={value + " 星"} checked={rating === value}
                onChange={() => setRating(value)} />
              <Star className={value <= rating ? "size-4 fill-current" : "size-4"} aria-hidden="true" />
            </label>)}
          </div>
        </fieldset>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-xs">面评结论
            <select value={decision} className={fieldClass} onChange={(event) => setDecision(event.target.value as ReviewDecision)}>
              {REVIEW_DECISIONS.map((item) => <option key={item} value={item}>{REVIEW_LABELS[item]}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-xs">面试官（选填）
            <Input value={reviewerName} placeholder="面试官" maxLength={100} onChange={(e) => setReviewer(e.target.value)} />
          </label>
        </div>
        <label className="grid min-w-0 gap-1 text-xs">面评
          <textarea className={fieldClass + " min-h-20 resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
        </label>
        <Button type="submit" size="sm" disabled={!rating}>{busy ? "正在保存…" : "保存面评"}</Button>
      </fieldset>
      {error && <p role="alert" className="text-xs text-rose-800">{error}</p>}
      {saved && <p className="text-xs text-muted-foreground">{saved.reviewerName} · {dateTime(saved.updatedAt)}</p>}
      {status && <p role="status" className="text-xs text-emerald-900">{status}</p>}
    </form>
  </details>;
}
